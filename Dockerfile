FROM node:22.20-trixie-slim@sha256:c7a6d80f9d76726291228f8878cd844cb15fcbdd2a4d54591e7d2b1903efb4e1 AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --no-audit --no-fund

COPY src src
RUN npm run build


FROM node:22.20-trixie-slim@sha256:c7a6d80f9d76726291228f8878cd844cb15fcbdd2a4d54591e7d2b1903efb4e1 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
