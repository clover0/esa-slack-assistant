FROM node:24.12.0-trixie-slim@sha256:9ad7e7db423b2ca7ddcc01568da872701ef6171505bd823978736247885c7eb4 AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --no-audit --no-fund

COPY src src
RUN npm run build


FROM node:24.12.0-trixie-slim@sha256:9ad7e7db423b2ca7ddcc01568da872701ef6171505bd823978736247885c7eb4 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
