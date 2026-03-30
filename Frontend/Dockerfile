# syntax=docker/dockerfile:1
# Etapa 1: generar ui.css con Tailwind; no copiar node_modules a la imagen final
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:css \
  && rm -rf node_modules \
  && rm -f package.json package-lock.json tailwind.config.cjs

# Etapa 2: solo archivos estáticos
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /src /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
