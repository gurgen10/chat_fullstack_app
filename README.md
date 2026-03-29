# Chat App

Full-stack chat application: **NestJS** API with **Prisma** / **PostgreSQL**, and a **React** (**Vite**) web client with real-time messaging.

## Repository layout

| Path | Description |
|------|-------------|
| `chat_app_be/` | Backend (NestJS, JWT auth, rooms, friends, WebSockets) |
| `chat_app_fe/` | Frontend (Vite, React, Socket.IO client) |
| `docker-compose.yml` | Postgres, dependency install, backend, and frontend dev stack |
| `scripts/docker-install-deps.sh` | Installs npm dependencies into named volumes (used by Compose) |

## Quick start with Docker

From the repository root:

```bash
docker compose up --build
```

This will:

1. Run a one-off `deps` service that installs Node dependencies for the backend and frontend into Docker volumes.
2. Start **PostgreSQL** (database `chat_app`, user/password `postgres`/`postgres`).
3. Run **migrations** and start the backend in dev mode on port **3000**.
4. Start the **Vite** dev server on port **5173**.

Open the app at [http://localhost:5173](http://localhost:5173).

**Ports**

- **5173** — web UI (Vite)
- **3000** — REST API and WebSocket gateway (NestJS)
- **5433** — PostgreSQL on the host (mapped from container `5432` to avoid clashing with a local PostgreSQL on **5432**)

Optional: set `JWT_SECRET` in your environment when running Compose; otherwise the default `change-me` from the compose file is used.

## Local development (without Docker for Node)

1. **PostgreSQL** — run Postgres (e.g. via `docker compose up -d postgres` only, or your own instance on port **5433** if matching `.env.example`).

2. **Backend** — in `chat_app_be/`:

   ```bash
   cp .env.example .env   # adjust DATABASE_URL, JWT_SECRET, etc.
   npm install
   npx prisma migrate deploy   # or `prisma migrate dev` while iterating
   npm run start:dev
   ```

3. **Frontend** — in `chat_app_fe/`:

   ```bash
   npm install
   npm run dev
   ```

   The dev server proxies API calls to the Nest app (see `vite.config.ts`). Override with `VITE_API_ORIGIN` if the API is not on the default host/port (see `chat_app_fe/.env.example`).

For the optional Express-based stack in the frontend repo (`npm run dev:stack`), see `chat_app_fe/package.json`.

## Environment configuration

- Backend: copy `chat_app_be/.env.example` to `chat_app_be/.env`. Use port **5433** in `DATABASE_URL` when Postgres is started via this repo’s `docker-compose` on the host.
- Frontend: optional `.env`; see `chat_app_fe/.env.example`.

## Further reading

- Backend details and API overview: `chat_app_be/README.md`
- Prisma schema: `chat_app_be/prisma/schema.prisma`
