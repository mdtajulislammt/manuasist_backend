FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci 2>/dev/null || npm install
RUN npx prisma generate --schema apps/application-service/prisma/schema.prisma
RUN npm run build:application
EXPOSE 5002
ENV APPLICATION_SERVICE_PORT=5002
ENV APPLICATION_DATABASE_URL=postgresql://postgres:postgres@postgres:5432/menu_assist_application_service
CMD ["node", "dist/apps/application-service/main.js"]
