FROM node:24.15.0-trixie-slim@sha256:735dd688da64d22ebd9dd374b3e7e5a874635668fd2a6ec20ca1f99264294086 AS base

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


FROM node:24.15.0-trixie-slim@sha256:735dd688da64d22ebd9dd374b3e7e5a874635668fd2a6ec20ca1f99264294086 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/.pnpm-store .pnpm-store
COPY --from=builder /app/dist dist

USER node

CMD ["node", "dist/app.js"]
