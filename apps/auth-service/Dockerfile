FROM node:22-alpine

RUN apk add --no-cache openssl python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run prisma:generate:auth
RUN pnpm run build:auth

EXPOSE 5001
ENV AUTH_SERVICE_PORT=5001
CMD ["node", "dist/apps/auth-service/apps/auth-service/src/main.js"]
