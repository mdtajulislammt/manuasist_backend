FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci 2>/dev/null || npm install
RUN npm run build:ai
EXPOSE 3004
ENV AI_INGESTION_SERVICE_PORT=3004
CMD ["node", "dist/apps/ai-ingestion-service/main.js"]
