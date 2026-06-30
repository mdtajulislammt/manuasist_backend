FROM node:22-alpine

RUN apk add --no-cache openssl python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run prisma:generate:auth
RUN pnpm run build:auth

EXPOSE 2646
ENV AUTH_SERVICE_PORT=2646
CMD ["node", "dist/apps/auth-service/main.js"]
