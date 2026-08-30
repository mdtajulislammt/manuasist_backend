FROM node:22-alpine

RUN apk add --no-cache openssl \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run build:api-auth && pnpm run build:gateway

EXPOSE 4000
CMD ["node", "dist/apps/api-gateway/apps/api-gateway/src/main.js"]
