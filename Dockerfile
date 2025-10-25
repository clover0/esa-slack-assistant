FROM node:22.20-trixie-slim@sha256:f3bca16c4b87ad0c7abfad97f6803898ee9b08a1f153a269140f0a08f50231d2 AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --no-audit --no-fund

COPY src src
RUN npm run build


FROM node:22.20-trixie-slim@sha256:f3bca16c4b87ad0c7abfad97f6803898ee9b08a1f153a269140f0a08f50231d2 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
