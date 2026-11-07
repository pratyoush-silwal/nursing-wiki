FROM node:24.11.0-alpine3.22
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/public-web/package.json apps/public-web/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY scripts scripts
RUN mkdir -p /data/objects && chown node:node /data/objects
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s CMD sh scripts/healthcheck.sh
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]
