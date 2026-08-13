FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY bin/ ./bin/
COPY src/ ./src/

RUN chmod +x /app/bin/alata-gateway.js && mkdir -p /app/data

ENV NODE_ENV=production
ENV GATEWAY_PORT=3100
ENV GATEWAY_DATA_DIR=/app/data

EXPOSE 3100

CMD ["node", "bin/alata-gateway.js", "run"]
