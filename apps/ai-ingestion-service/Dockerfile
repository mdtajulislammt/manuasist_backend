FROM node:22-alpine

RUN apk add --no-cache openssl python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run build:ai

EXPOSE 2649
ENV AI_INGESTION_SERVICE_PORT=2649
CMD ["node", "dist/apps/ai-ingestion-service/main.js"]
