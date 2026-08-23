FROM node:22-alpine AS builder

WORKDIR /app

COPY apps/home .
RUN node build.mjs

# ─── Runtime ─────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/*.html /usr/share/nginx/html/
COPY --from=builder /app/css /usr/share/nginx/html/css
COPY --from=builder /app/js /usr/share/nginx/html/js
COPY --from=builder /app/images /usr/share/nginx/html/images
COPY apps/home/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
