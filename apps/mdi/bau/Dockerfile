# Freie Karte 2, P3: ein Image fuer drei getrennte Container (deploy/fk2-p34 im Wrapper):
#   mdi-bau          node bau/main.mjs          Key + Token, Modell-API, Warteschlange; startet KEINEN Browser
#   mdi-pruef        node bau/pruef-dienst.mjs  Chromium mit Sandbox (MDI_CHROMIUM_SANDBOX=1, seccomp-Profil), ohne Geheimnisse, ohne Netz
#   mdi-spiel-dienst node bau/spiel-dienst.mjs  statisch, read-only
# Kontext: apps/mdi. Bauen: docker build -f bau/Dockerfile -t mdi-bau:<tag> apps/mdi
# Playwright-Image in genau der Version aus package.json (1.56.1): der Browser fuer die Sandbox-Pruefung ist dabei.
# Laeuft als Nutzer pwuser (kein root), ohne Port; der Spiel-Dienst veroeffentlicht nur 127.0.0.1:8795 (siehe Deploy-Doku).
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY bau ./bau
ENV NODE_ENV=production
USER pwuser
CMD ["node", "bau/main.mjs"]
