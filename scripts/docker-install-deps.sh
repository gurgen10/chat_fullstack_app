#!/bin/sh
# Run inside Docker (deps service): install all npm packages into mounted node_modules volumes.
set -e
echo "docker-install-deps: backend (chat_app_be)..."
cd /workspace/chat_app_be && npm install
echo "docker-install-deps: frontend (chat_app_fe)..."
cd /workspace/chat_app_fe && npm install
echo "docker-install-deps: finished."
