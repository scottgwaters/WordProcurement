#!/bin/sh
echo "=== Environment Debug ==="
echo "DATABASE_URL is set: ${DATABASE_URL:+yes}"
echo "All DB-related vars:"
env | grep -i database || echo "None found"
env | grep -i mysql || echo "None found"
echo "=== End Debug ==="

if [ -n "$DATABASE_URL" ]; then
  echo "Regenerating Prisma client..."
  npx prisma generate
  echo "Running Prisma db push..."
  npx prisma db push --skip-generate --accept-data-loss || echo "DB push failed, continuing..."
fi

echo "Starting Next.js..."
npm start
