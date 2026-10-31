# Messstand: Chromium mit Netzwerkwerkzeugen. Nur fuer Tests.
FROM mcr.microsoft.com/playwright:v1.49.1-noble
RUN apt-get update -qq && apt-get install -y -qq iptables >/dev/null
WORKDIR /app
RUN npm init -y >/dev/null && npm i --silent playwright@1.49.1
COPY src /app/src
COPY server /app/server
COPY test/e2e /app/e2e
