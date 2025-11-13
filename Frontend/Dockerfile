# syntax=docker/dockerfile:1
# Dockerfile para PRODUCCIÓN - Mantiene compatibilidad con archivos estáticos actuales
# NOTA: Este Dockerfile sigue funcionando con los archivos HTML estáticos existentes
# Para usar Svelte en producción, usar Dockerfile.prod después de hacer npm run build

FROM nginx:1.27-alpine

# Copy custom nginx config (expects build context = ./Frontend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Clean and copy static site
# IMPORTANTE: Esto copia TODOS los archivos estáticos, incluyendo los nuevos HTML
# Los nuevos HTML con Svelte SOLO funcionarán si se hace build primero (ver Dockerfile.prod)
RUN rm -rf /usr/share/nginx/html/*
COPY . /usr/share/nginx/html/

# Si los HTML nuevos están presentes pero no hay build, nginx servirá el HTML pero
# los módulos JS no funcionarán. Esto es intencional para no romper producción.

EXPOSE 80

CMD ["nginx","-g","daemon off;"]
