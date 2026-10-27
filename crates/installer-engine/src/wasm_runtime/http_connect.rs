//! Outgoing `wasi:http` connection with the destination **pinned** to an address this module vetted.
//!
//! Why this exists: the stock `wasmtime_wasi_http::default_send_request` resolves the host name
//! itself and connects to whatever comes back. A hostname on the manifest allowlist can therefore be
//! made to point at `127.0.0.1`, `169.254.169.254` (cloud metadata) or an RFC 1918 host (DNS
//! rebinding / SSRF), and the allowlist would still say "allowed". Here the hook resolves the name
//! once, rejects the request if ANY returned address is not globally routable ([`is_global_ip`]),
//! and then connects to the vetted address directly while TLS (SNI + certificate check) and the
//! `Host` header keep using the hostname. There is no second resolution between check and connect.
//!
//! The request/response plumbing follows `wasmtime-wasi-http` 50.0.0's `default_send_request`
//! (Apache-2.0 WITH LLVM-exception), reduced to the https-only, pinned-address case; the
//! between-bytes timeout of the stock implementation is not reproduced (the guest's overall
//! wall-clock limit bounds a slow body).

use http_body_util::BodyExt;
use std::future::Future;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use wasmtime_wasi_http::io::TokioIo;
use wasmtime_wasi_http::{Error, RequestOptions, WasiBody};

/// Hostname -> addresses. A trait so tests can inject a resolver (e.g. one that answers
/// `127.0.0.1`) without touching the network.
pub trait Resolver: Send + Sync {
    fn resolve<'a>(&'a self, host: &'a str, port: u16) -> Pin<Box<dyn Future<Output = std::io::Result<Vec<IpAddr>>> + Send + 'a>>;
}

/// The system resolver (`getaddrinfo` via tokio).
pub struct SystemResolver;

impl Resolver for SystemResolver {
    fn resolve<'a>(&'a self, host: &'a str, port: u16) -> Pin<Box<dyn Future<Output = std::io::Result<Vec<IpAddr>>> + Send + 'a>> {
        Box::pin(async move { Ok(tokio::net::lookup_host((host, port)).await?.map(|a| a.ip()).collect()) })
    }
}

/// `true` only for addresses that are globally routable unicast. Everything an attacker could use to
/// reach the host itself or its network is rejected: loopback, unspecified, link-local (incl. the
/// 169.254.169.254 metadata address), RFC 1918, CGNAT 100.64/10, ULA fc00::/7, multicast, broadcast,
/// reserved/documentation/benchmark ranges, and every IPv6 form that embeds an IPv4 address
/// (v4-mapped, v4-compatible, NAT64, 6to4, Teredo).
pub fn is_global_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_global_v4(v4),
        IpAddr::V6(v6) => is_global_v6(v6),
    }
}

fn is_global_v4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !(ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_multicast()
        || a == 0                                   // 0.0.0.0/8 "this network"
        || (a == 100 && (b & 0xc0) == 64)           // 100.64.0.0/10 CGNAT
        || (a == 192 && b == 0 && c == 0)           // 192.0.0.0/24 IETF protocol assignments
        || (a == 192 && b == 0 && c == 2)           // TEST-NET-1
        || (a == 198 && (b & 0xfe) == 18)           // 198.18.0.0/15 benchmarking
        || (a == 198 && b == 51 && c == 100)        // TEST-NET-2
        || (a == 203 && b == 0 && c == 113)         // TEST-NET-3
        || a >= 240) // 240.0.0.0/4 reserved
}

fn is_global_v6(ip: Ipv6Addr) -> bool {
    let s = ip.segments();
    // Only 2000::/3 is global unicast; this alone excludes ::, ::1, ::ffff:0:0/96 (v4-mapped),
    // ::/96 (v4-compatible), 64:ff9b::/96 (NAT64), fc00::/7 (ULA), fe80::/10, fec0::/10, ff00::/8.
    if !(0x2000..=0x3fff).contains(&s[0]) {
        return false;
    }
    !(s[0] == 0x2002                                  // 6to4 (embeds an IPv4 address)
        || (s[0] == 0x2001 && s[1] == 0x0000)         // Teredo
        || (s[0] == 0x2001 && s[1] == 0x0db8)         // documentation
        || (s[0] == 0x2001 && s[1] == 0x0002 && s[2] == 0x0000)) // benchmarking
}

/// Resolve `host` and return the single address to connect to, or the error to report. Rejects if
/// ANY answer is non-global (a mixed answer is a rebinding signature, not something to filter around).
pub async fn vet_destination(resolver: &dyn Resolver, host: &str, port: u16) -> Result<SocketAddr, Error> {
    let addrs = resolver.resolve(host, port).await.map_err(|_| Error::DnsError { rcode: Some("resolution failed".into()), info_code: None })?;
    if addrs.is_empty() {
        return Err(Error::DestinationNotFound);
    }
    if addrs.iter().any(|a| !is_global_ip(*a)) {
        return Err(Error::DestinationIpProhibited);
    }
    Ok(SocketAddr::new(addrs[0], port))
}

type Resp = Result<(http::Response<WasiBody>, Box<dyn Future<Output = Result<(), Error>> + Send>), Error>;

/// Send `req` over TLS to the vetted `addr`, using `host` for SNI/certificate verification.
pub async fn send_pinned(
    resolver: Arc<dyn Resolver>,
    mut req: http::Request<WasiBody>,
    options: Option<RequestOptions>,
) -> Resp {
    let host = req.uri().host().ok_or(Error::HttpRequestUriInvalid)?.to_ascii_lowercase();
    let port = req.uri().port_u16().unwrap_or(443);
    let addr = vet_destination(resolver.as_ref(), &host, port).await?;

    let connect_timeout = options.and_then(|o| o.connect_timeout).unwrap_or(Duration::from_secs(30));
    let first_byte_timeout = options.and_then(|o| o.first_byte_timeout).unwrap_or(Duration::from_secs(60));

    let tcp = match tokio::time::timeout(connect_timeout, tokio::net::TcpStream::connect(addr)).await {
        Ok(s) => s.map_err(Error::Connect)?,
        Err(_) => return Err(Error::ConnectionTimeout),
    };
    let roots = rustls::RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.into() };
    let config = rustls::ClientConfig::builder().with_root_certificates(roots).with_no_client_auth();
    let connector = tokio_rustls::TlsConnector::from(Arc::new(config));
    let server_name = rustls::pki_types::ServerName::try_from(host.clone()).map_err(Error::InvalidDnsNameError)?;
    let tls = connector.connect(server_name, tcp).await.map_err(Error::Tls)?;

    let (mut sender, conn) = tokio::time::timeout(connect_timeout, hyper::client::conn::http1::Builder::new().handshake(TokioIo::new(tls)))
        .await
        .map_err(|_| Error::ConnectionTimeout)??;

    // Origin-form request line (scheme/authority are only for proxies).
    *req.uri_mut() = http::Uri::builder()
        .path_and_query(req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/"))
        .build()
        .map_err(|_| Error::HttpRequestUriInvalid)?;

    // hyper needs its connection future polled for the request to make progress: run it as a task.
    let conn_task = tokio::spawn(conn);
    let response = tokio::time::timeout(first_byte_timeout, sender.send_request(req))
        .await
        .map_err(|_| Error::ConnectionReadTimeout)?
        .map_err(Error::from)?;

    let response = response.map(|b| b.map_err(Error::from).boxed_unsync());
    let io = async move {
        match conn_task.await {
            Ok(r) => r.map_err(Error::from),
            Err(_) => Err(Error::ConnectionTerminated),
        }
    };
    Ok((response, Box::new(io) as Box<dyn Future<Output = Result<(), Error>> + Send>))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v4(s: &str) -> IpAddr {
        s.parse::<Ipv4Addr>().unwrap().into()
    }
    fn v6(s: &str) -> IpAddr {
        s.parse::<Ipv6Addr>().unwrap().into()
    }

    #[test]
    fn local_and_internal_addresses_are_never_global() {
        for bad in [
            "127.0.0.1", "127.255.255.254", "0.0.0.0", "0.1.2.3", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
            "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255", "224.0.0.1", "239.255.255.255", "255.255.255.255",
            "240.0.0.1", "192.0.0.8", "192.0.2.1", "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.9",
        ] {
            assert!(!is_global_ip(v4(bad)), "{bad} must be rejected");
        }
        for bad in [
            "::", "::1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "::127.0.0.1", "64:ff9b::7f00:1", "fc00::1", "fd12:3456::1",
            "fe80::1", "fec0::1", "ff02::1", "2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:db8::1", "2001:2::1",
        ] {
            assert!(!is_global_ip(v6(bad)), "{bad} must be rejected");
        }
    }

    #[test]
    fn ordinary_public_addresses_pass() {
        for ok in ["8.8.8.8", "1.1.1.1", "93.184.216.34", "100.63.255.255", "100.128.0.1", "172.15.255.255", "172.32.0.1", "198.17.0.1", "198.20.0.1"] {
            assert!(is_global_ip(v4(ok)), "{ok} must pass");
        }
        for ok in ["2606:4700:4700::1111", "2a00:1450:4001::200e", "2001:4860:4860::8888"] {
            assert!(is_global_ip(v6(ok)), "{ok} must pass");
        }
    }

    struct Fixed(Vec<IpAddr>);
    impl Resolver for Fixed {
        fn resolve<'a>(&'a self, _: &'a str, _: u16) -> Pin<Box<dyn Future<Output = std::io::Result<Vec<IpAddr>>> + Send + 'a>> {
            let v = self.0.clone();
            Box::pin(async move { Ok(v) })
        }
    }

    fn block_on<F: Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap().block_on(f)
    }

    #[test]
    fn an_allowed_name_that_resolves_to_loopback_or_metadata_is_refused() {
        for bad in ["127.0.0.1", "169.254.169.254", "10.1.2.3", "::1"] {
            let r = Fixed(vec![bad.parse().unwrap()]);
            let res = block_on(vet_destination(&r, "api.example.com", 443));
            assert!(matches!(res, Err(Error::DestinationIpProhibited)), "{bad}: {res:?}");
        }
    }

    #[test]
    fn a_mixed_answer_is_refused_not_filtered() {
        let r = Fixed(vec![v4("93.184.216.34"), v4("127.0.0.1")]);
        let res = block_on(vet_destination(&r, "api.example.com", 443));
        assert!(matches!(res, Err(Error::DestinationIpProhibited)));
    }

    #[test]
    fn a_global_answer_is_pinned_with_the_requested_port() {
        let r = Fixed(vec![v4("93.184.216.34")]);
        let addr = block_on(vet_destination(&r, "api.example.com", 443)).unwrap();
        assert_eq!(addr, "93.184.216.34:443".parse().unwrap());
    }

    #[test]
    fn an_empty_answer_is_not_found() {
        let res = block_on(vet_destination(&Fixed(vec![]), "api.example.com", 443));
        assert!(matches!(res, Err(Error::DestinationNotFound)));
    }
}
