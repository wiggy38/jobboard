FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@tumaa/web...

FROM nginx:alpine

# Landing page statique
COPY apps/web/landing /usr/share/nginx/html/landing

# App React (flow /subscribe), buildée par le stage précédent
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html/subscribe

# Config Nginx (template résolu au démarrage via envsubst, SVELTEKIT_UPSTREAM
# et API_UPSTREAM doivent être définis en env : "sveltekit:3000"/"api:3000" en
# local, "<service>.railway.internal:<port>" sur Railway)
COPY apps/web/nginx/templates/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
