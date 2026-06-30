FROM node:22-alpine
WORKDIR /app
COPY . .
RUN pnpm ci 2>/dev/null || pnpm install
RUN pnpm run build:auth
EXPOSE 2646
ENV AUTH_SERVICE_PORT=2646
CMD ["node", "dist/apps/auth-service/main.js"]
