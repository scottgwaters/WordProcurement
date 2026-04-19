#!/bin/sh
echo "DATABASE_URL is set: ${DATABASE_URL:+yes}"
echo "Regenerating Prisma client..."
npx prisma generate
echo "Running Prisma db push..."
npx prisma db push --skip-generate --accept-data-loss
echo "Starting Next.js..."
npm start
