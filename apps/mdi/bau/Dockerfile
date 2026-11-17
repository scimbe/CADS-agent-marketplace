# Freie Karte 2, P3: Image fuer den Bau-Worker (node bau/main.mjs) und den statischen Spiel-Dienst (node bau/spiel-dienst.mjs).
# Kontext: apps/mdi. Bauen: docker build -f bau/Dockerfile -t mdi-bau:<tag> apps/mdi
# Playwright-Image in genau der Version aus package.json (1.56.1): der Browser fuer die Sandbox-Pruefung ist dabei.
# Laeuft als Nutzer pwuser (kein root), ohne Port; der Spiel-Dienst veroeffentlicht nur 127.0.0.1:8794 (siehe Deploy-Doku).
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
