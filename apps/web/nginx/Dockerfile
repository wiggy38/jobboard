FROM nginx:alpine

# Landing page statique
COPY landing /usr/share/nginx/html/landing

# Config Nginx
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
