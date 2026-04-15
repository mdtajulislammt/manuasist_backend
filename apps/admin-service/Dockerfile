FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci 2>/dev/null || npm install
RUN npm run build:admin
EXPOSE 3003
ENV ADMIN_SERVICE_PORT=3003
CMD ["node", "dist/apps/admin-service/main.js"]
