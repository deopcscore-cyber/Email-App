# Production image for the NovaMail API. Also runs the BullMQ worker:
# Railway's worker service overrides the CMD to `node dist/worker.js`
# (see docs/06-deployment.md) — same image, same deploy, one source of truth.
#
# Build from the MONOREPO ROOT so pnpm workspace deps (packages/shared)
# resolve correctly:
#   docker build -f apps/api/Dockerfile -t novamail-api .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# ---- build: full workspace install + compile ---------------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/config packages/config
COPY apps/api apps/api

RUN pnpm --filter @novamail/shared build
RUN pnpm --filter @novamail/api exec prisma generate
RUN pnpm --filter @novamail/api build

# `pnpm deploy` produces a self-contained install for one workspace package —
# the correct way to Dockerize a pnpm monorepo app, since manually copying
# node_modules across build stages breaks pnpm's symlinked workspace layout.
# --legacy mode (forced by this workspace's config) copies dist/ as long as
# it exists at deploy time, which it does here; the explicit copies below
# are a defensive no-op if a future pnpm/config change ever excludes it.
RUN pnpm deploy --filter=@novamail/api --prod --legacy /prod/api
RUN cp -r apps/api/dist /prod/api/dist
RUN mkdir -p /prod/api/node_modules/@novamail/shared \
  && cp -r packages/shared/dist /prod/api/node_modules/@novamail/shared/dist

# ---- runtime: minimal image, no build tooling ---------------------------
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=app:app /prod/api .
USER app

EXPOSE 4000
CMD ["node", "dist/main.js"]
