FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci 2>/dev/null || npm install
RUN npm run build:gateway
EXPOSE 5000
ENV API_GATEWAY_PORT=5000
CMD ["node", "dist/apps/api-gateway/main.js"]
