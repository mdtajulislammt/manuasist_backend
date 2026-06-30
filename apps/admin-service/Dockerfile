FROM node:22-alpine

RUN apk add --no-cache openssl python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run prisma:generate:admin
RUN pnpm run build:admin

EXPOSE 2648
ENV ADMIN_SERVICE_PORT=2648
CMD ["node", "dist/apps/admin-service/main.js"]
