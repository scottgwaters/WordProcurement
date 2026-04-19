FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .

# Set DATABASE_URL only for the build command (inline)
RUN DATABASE_URL="mysql://build:build@localhost:3306/build" npm run build

COPY start.sh ./
RUN chmod +x start.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["./start.sh"]
