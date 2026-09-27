# Image de l'API RISE (Cockpit + Console Admin).
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY frontends/ /frontends/
ENV FRONTEND_DIR=/frontends SEED_DATA_DIR=/frontends STORAGE_DIR=/data/storage
EXPOSE 3000
# Migrations au démarrage, puis API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
