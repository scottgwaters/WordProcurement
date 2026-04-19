FROM node:20-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .

# Use ARG for build-time only (won't persist to runtime)
ARG DATABASE_URL="mysql://dummy:dummy@localhost:3306/dummy"
RUN npm run build

COPY start.sh ./
RUN chmod +x start.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["./start.sh"]
