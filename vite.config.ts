import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:4173",
      "/outputs": "http://127.0.0.1:4173",
      "/downloads": "http://127.0.0.1:4173",
      "/data": "http://127.0.0.1:4173",
      "/public": "http://127.0.0.1:4173",
      "/images": "http://127.0.0.1:4173",
      "/videos": "http://127.0.0.1:4173",
      "/js": "http://127.0.0.1:4173",
      "/assets": "http://127.0.0.1:4173",
      "/libs": "http://127.0.0.1:4173",
      "/transitions.js": "http://127.0.0.1:4173",
      "/noise.js": "http://127.0.0.1:4173",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
