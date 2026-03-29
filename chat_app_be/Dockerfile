FROM node:22-bookworm-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# prisma/ must exist before `npm ci` — postinstall runs `prisma generate`.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY nest-cli.json ./
COPY tsconfig*.json ./
COPY src ./src

EXPOSE 3000
