#!/bin/sh
echo "Running Prisma db push..."
npx prisma db push --skip-generate
echo "Starting Next.js..."
npm start
