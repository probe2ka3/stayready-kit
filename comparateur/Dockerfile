# syntax=docker/dockerfile:1.7
# Images de production : `web` (application Next.js autonome) et `worker` (tâches planifiées).
#   docker build --target web -t cabas-web .
#   docker build --target worker -t cabas-worker .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY packages/reference/package.json packages/reference/
COPY packages/connectors/package.json packages/connectors/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile

FROM deps AS build
# URL publique : intégrée aux pages pré-générées (liens canoniques, données structurées).
ARG SITE_URL=http://localhost:3000
ENV SITE_URL=${SITE_URL}
COPY . .
RUN pnpm --filter @cabas/web build

# --- Application web -------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/app/data
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public
COPY --from=build --chown=app:app /app/data/geo ./data/geo
COPY --from=build --chown=app:app /app/data/stores ./data/stores
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]

# --- Tâches (migrations, imports, connecteurs, qualité) --------------------
FROM deps AS worker
COPY . .
ENV NODE_ENV=production DATA_DIR=/app/data
RUN mkdir -p /app/data/imports/inbox && chown -R node:node /app/data
USER node
ENTRYPOINT ["/app/apps/worker/node_modules/.bin/tsx", "/app/apps/worker/src/cli.ts"]
CMD ["status"]
