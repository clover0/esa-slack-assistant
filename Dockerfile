FROM node:24.13.0-trixie-slim@sha256:a16979bcaf12a2fd24888eb8e89874b11bd1038a3e3f1881c26a5e2b8fb92b5c AS base

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable


FROM base AS builder

ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml ./
RUN pnpm config set store-dir /app/.pnpm-store \
  && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src src
RUN pnpm run build \
  && pnpm prune --prod


FROM node:24.13.0-trixie-slim@sha256:a16979bcaf12a2fd24888eb8e89874b11bd1038a3e3f1881c26a5e2b8fb92b5c AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/.pnpm-store .pnpm-store
COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
