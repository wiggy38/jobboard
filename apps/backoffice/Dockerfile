FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=...@tumaa/backoffice

# ─── Runtime ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable

WORKDIR /app

COPY --from=builder /app/apps/backoffice/build ./build
COPY --from=builder /app/apps/backoffice/node_modules ./node_modules
COPY --from=builder /app/apps/backoffice/package.json .

EXPOSE 80

ENV PORT=80
ENV HOST=0.0.0.0

CMD ["node", "build"]
