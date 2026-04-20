FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci 2>/dev/null || npm install
RUN npx prisma generate --schema apps/admin-service/prisma/schema.prisma
RUN npm run build:admin
EXPOSE 5003
ENV ADMIN_SERVICE_PORT=5003
CMD ["node", "dist/apps/admin-service/main.js"]
