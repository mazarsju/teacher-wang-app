# Frontend static + reverse-proxy image for ECS (linux/arm64).
# Listens on container port 80 (host maps 8080→80). Proxies API routes to
# BACKEND_UPSTREAM (default on ECS: http://172.17.0.1:5000).
# Build from repo root:
#   docker buildx build --platform linux/arm64 -f frontend/Dockerfile -t … .

FROM node:22-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine

# Only substitute BACKEND_UPSTREAM so nginx $host / $uri stay intact.
ENV NGINX_ENVSUBST_FILTER=BACKEND_UPSTREAM \
    BACKEND_UPSTREAM=http://127.0.0.1:5000

COPY frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Checks nginx is serving (local /health, not proxied to the API).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health >/dev/null || exit 1
