#!/bin/sh
set -e
cd /app

# Named volume often mounts an empty node_modules; YAML $ escaping can break inline checks.
if [ ! -d node_modules/@nestjs/core ]; then
  echo "backend: installing npm dependencies..."
  npm install
fi

npx prisma generate
npx prisma migrate deploy
exec npm run start:dev
