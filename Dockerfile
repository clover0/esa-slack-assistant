FROM node:24.13.0-trixie-slim@sha256:a16979bcaf12a2fd24888eb8e89874b11bd1038a3e3f1881c26a5e2b8fb92b5c AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile

COPY src src
RUN pnpm run build


FROM node:24.13.0-trixie-slim@sha256:a16979bcaf12a2fd24888eb8e89874b11bd1038a3e3f1881c26a5e2b8fb92b5c AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
