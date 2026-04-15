FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci 2>/dev/null || npm install
RUN npm run build:auth
EXPOSE 3001
ENV AUTH_SERVICE_PORT=3001
CMD ["node", "dist/apps/auth-service/main.js"]
