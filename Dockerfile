FROM node:22.20-trixie-slim@sha256:535ba2ed7dcf0dec29b0af4cac2b87ccdd935880212d4b9537e767b078ce1ca3 AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile

COPY src src
RUN pnpm run build


FROM node:22.20-trixie-slim@sha256:535ba2ed7dcf0dec29b0af4cac2b87ccdd935880212d4b9537e767b078ce1ca3 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
