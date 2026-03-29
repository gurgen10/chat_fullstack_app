#!/bin/sh
set -e
cd /app

if [ ! -d node_modules/vite ] || [ ! -d node_modules/react ]; then
  echo "frontend: installing npm dependencies..."
  npm install
fi

exec npm run dev:client -- --host 0.0.0.0 --port 5173
