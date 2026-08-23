# Plain Caddy -- no custom build, no ACME DNS plugin. Same convention as
# CADS-webconference-demo/Caddy.Dockerfile (this operator's other tunnel demos): cert is issued
# CORE-side and mounted in, Caddy here only ever reads fullchain.pem/privkey.pem.
#
# Serves the static read-only dashboard (dashboard/) and reverse-proxies /registry/* to the
# registry service (see ../Caddyfile) -- no build step for the dashboard itself, plain
# HTML/CSS/JS matching this operator's other demos' convention.
FROM caddy:2
COPY dashboard/index.html /srv/index.html
COPY dashboard/dashboard.js /srv/dashboard.js
COPY dashboard/style.css /srv/style.css
