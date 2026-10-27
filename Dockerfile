# ─── Сборка фронтенда ───
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Рантайм бэкенда ───
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# только прод-зависимости (js-yaml)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY settings.yaml ./

# db.yaml и logs/ подключаются томами (см. docker-compose.yml),
# но на случай первого старта создаём заготовки
RUN mkdir -p logs

EXPOSE 3001
CMD ["node", "server/server.mjs"]
