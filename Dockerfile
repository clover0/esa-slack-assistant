FROM node:24.22.2-trixie-slim@sha256:0820eaa85e07d0490446dd01d14707e17e6108a36988cf374899cd057eb3812d AS base

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable


FROM base AS builder

ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm config set store-dir /app/.pnpm-store \
  && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src src
RUN pnpm run build \
  && pnpm prune --prod


FROM node:24.22.2-trixie-slim@sha256:0820eaa85e07d0490446dd01d14707e17e6108a36988cf374899cd057eb3812d AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/.pnpm-store .pnpm-store
COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
