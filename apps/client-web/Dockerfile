FROM node:24.11.0-alpine3.22 AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/public-web/package.json apps/public-web/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/client-web/package.json apps/client-web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY tsconfig.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY apps/client-web apps/client-web
COPY packages/shared packages/shared
COPY scripts/copy-vendor.mjs scripts/copy-vendor.mjs
RUN node scripts/copy-vendor.mjs
RUN npm run build -w @wiki/client-web
FROM nginx:1.28.0-alpine
COPY infra/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client-web/dist /usr/share/nginx/html
