# syntax=docker/dockerfile:1
# Solo nginx: no Node/npm en el servidor (ahorra disco y RAM en VPS chicos).
# Antes de desplegar, genera CSS en tu máquina o CI y haz commit:
#   cd Frontend && npm ci && npm run build:css
# El sitio enlaza ./assets/ui.css (ya compilado).

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY . /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
