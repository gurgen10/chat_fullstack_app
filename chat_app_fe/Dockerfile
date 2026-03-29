FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig*.json ./
COPY server ./server
COPY src ./src
COPY public ./public

EXPOSE 5173

CMD ["npm", "run", "dev:client", "--", "--host", "0.0.0.0", "--port", "5173"]
