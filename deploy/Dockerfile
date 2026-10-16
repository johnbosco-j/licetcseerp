# syntax=docker/dockerfile:1
#
# LICET CSE ERP: production image (Next.js standalone server).
#
# Built by deploy/docker-compose.app.yml from the repository root:
#   docker compose -f deploy/docker-compose.app.yml build app
#
# NEXT_PUBLIC_* values are compiled into the browser bundle and the
# Content-Security-Policy at build time, so they are build arguments. They are
# public values (the API URL and the anon key). Secrets such as
# SUPABASE_SERVICE_ROLE_KEY are only given at run time, never at build time.

ARG NODE_IMAGE=node:22-alpine

# ---- 1. dependencies -------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 2. build --------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN test -n "${NEXT_PUBLIC_SUPABASE_URL}" && test -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    || { echo "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be passed as build args (see deploy/.env)" >&2; exit 1; }
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 3. runtime ------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# The web-app manifest is a cheap page that needs no database or sign-in.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/manifest.webmanifest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
