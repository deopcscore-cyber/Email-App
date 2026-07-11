FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/config packages/config
COPY apps/web apps/web

# next.config.ts reads API_URL at build time to bake the /api rewrite
# destination into .next/routes-manifest.json — Railway passes service
# variables as build args for any ARG declared here with a matching name.
ARG API_URL
ENV API_URL=$API_URL

RUN pnpm --filter @novamail/shared build
RUN pnpm --filter @novamail/web build

FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `output: "standalone"` produces a pruned, self-contained server tree
# (only the deps actually used, no full node_modules) plus a server.js
# entrypoint; static assets are emitted separately and must be copied in.
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static

USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
