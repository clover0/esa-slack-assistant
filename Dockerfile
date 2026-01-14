FROM node:22.22.0-trixie-slim@sha256:280792ea1ffd24ac282c6aafac78c830608ab85afea77a9a03e5d07c57ee5559 AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile

COPY src src
RUN pnpm run build


FROM node:22.22.0-trixie-slim@sha256:280792ea1ffd24ac282c6aafac78c830608ab85afea77a9a03e5d07c57ee5559 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
