FROM node:22.21.1-trixie-slim@sha256:50d7d95c827a32646b67c488b70f661725381356133884aca05cd658c32ff53c AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --no-audit --no-fund

COPY src src
RUN npm run build


FROM node:22.21.1-trixie-slim@sha256:50d7d95c827a32646b67c488b70f661725381356133884aca05cd658c32ff53c AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
