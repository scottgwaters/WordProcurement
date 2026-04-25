#!/bin/sh
# DB connectivity sanity-check without leaking the URL (which contains the
# MySQL password) to logs. `dailey logs` is readable by anyone with project
# access — keep secrets out of stdout.
echo "DATABASE_URL is set: ${DATABASE_URL:+yes}"

if [ -n "$DATABASE_URL" ]; then
  echo "Regenerating Prisma client..."
  npx prisma generate
  echo "Running Prisma db push..."
  npx prisma db push --skip-generate --accept-data-loss || echo "DB push failed, continuing..."

  # Idempotent admin bootstrap: if no admin exists yet (e.g. right after the
  # is_admin column is added), promote the oldest user to admin so the Users
  # page is reachable. No-ops on every subsequent boot once an admin exists.
  echo "Ensuring at least one admin user..."
  printf 'UPDATE users SET is_admin = 1 WHERE id = (SELECT id FROM (SELECT id FROM users ORDER BY created_at ASC LIMIT 1) AS t) AND (SELECT COUNT(*) FROM (SELECT id FROM users WHERE is_admin = 1) AS a) = 0;\n' \
    | npx prisma db execute --stdin --schema prisma/schema.prisma \
    || echo "Admin bootstrap skipped (already ran or no users)."
fi

echo "Starting Next.js..."
npm start
