# syntax=docker/dockerfile:1
FROM nginx:1.27-alpine

# Copy custom nginx config (expects build context = ./Frontend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Clean and copy static site (asegura eliminar archivos obsoletos)
RUN rm -rf /usr/share/nginx/html/*
COPY . /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx","-g","daemon off;"]
