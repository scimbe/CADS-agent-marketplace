# Skalierung

- A. Wiggins, „The Twelve-Factor App“, 2011, https://12factor.net – zustandslose Prozesse, Konfiguration in der Umgebung, Drain.
- D. Karger et al., „Consistent Hashing and Random Trees“, STOC 1997. *(Details nicht nachgeprüft)*
- D. Thaler, C. Ravishankar, „Using Name-Based Mappings to Increase Hit Rates“, IEEE/ACM ToN 6(1), 1998 – Rendezvous-Hashing. *(nicht nachgeprüft)*
- G. DeCandia et al., „Dynamo“, SOSP 2007. *(nicht nachgeprüft)*
- A. Forero Cuervo, „Handling Overload“, Kap. 21 in Beyer et al., Site Reliability Engineering, O'Reilly 2016,
  https://sre.google/sre-book/handling-overload/ – adaptives Drosseln, Kritikalitätsklassen. (abgerufen 2026-11-11)
- J. Dean, L. A. Barroso, „The Tail at Scale“, CACM 56(2), 2013. *(nicht nachgeprüft)*
- J. D. C. Little, „A Proof for the Queuing Formula L = λW“, Operations Research 9(3), 1961. *(nicht nachgeprüft)*
- IETF RFC 8656 (TURN, 2020), RFC 8445 (ICE, 2018).
- Kubernetes Horizontal Pod Autoscaler, kubernetes.io.

Ableitung: zustandslos + stabiler Shard-Schlüssel + Pull-Worker erlaubt Burst ohne Datenbewegung. Einziger affiner Pfad:
Live-Signalisierung mit Rendezvous-Hashing.
