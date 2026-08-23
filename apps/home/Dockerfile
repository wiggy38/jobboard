FROM node:18-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @tumaa/home run build

FROM nginx:alpine

COPY --from=builder /app/apps/home /usr/share/nginx/html

EXPOSE 80
