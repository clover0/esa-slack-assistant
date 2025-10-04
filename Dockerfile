FROM node:22.20-trixie-slim@sha256:535ba2ed7dcf0dec29b0af4cac2b87ccdd935880212d4b9537e767b078ce1ca3 AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --no-audit --no-fund

COPY src src
RUN npm run build


FROM node:22.20-trixie-slim@sha256:535ba2ed7dcf0dec29b0af4cac2b87ccdd935880212d4b9537e767b078ce1ca3 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
