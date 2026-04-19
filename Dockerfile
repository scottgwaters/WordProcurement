FROM node:20-slim

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy source code
COPY . .

# Set dummy DATABASE_URL for build
ENV DATABASE_URL="mysql://dummy:dummy@localhost:3306/dummy"

# Build the application
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

CMD ["npm", "start"]
