FROM nginx:alpine

# Landing page statique
COPY landing /usr/share/nginx/html/landing

# Config Nginx (template résolu au démarrage via envsubst, SVELTEKIT_UPSTREAM
# doit être défini en env : "sveltekit:3000" en local, "<service>.railway.internal:3000" sur Railway)
COPY nginx/templates/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
