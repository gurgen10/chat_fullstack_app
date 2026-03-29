import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Nest URL for the dev proxy. In Docker Compose use `http://backend:3000`. */
const apiUpstream = process.env.API_UPSTREAM ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // REST + uploads: browser calls /api/* → strip prefix → Nest
      "/api": {
        target: apiUpstream,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, "") || "/",
      },
      "/socket.io": {
        target: apiUpstream,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
