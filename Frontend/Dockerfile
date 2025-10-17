# syntax=docker/dockerfile:1
FROM nginx:1.27-alpine

# Copy custom nginx config
COPY Frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy static site
COPY Frontend/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx","-g","daemon off;"]
