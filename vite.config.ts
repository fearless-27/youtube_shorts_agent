import path from "path"
import fs from "fs"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

function getBackendTarget() {
  if (process.env.BACKEND_PORT) {
    return `http://127.0.0.1:${process.env.BACKEND_PORT}`;
  }
  try {
    const portFile = path.resolve(__dirname, ".backend_port");
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, "utf8").trim();
      if (port && /^\d+$/.test(port)) {
        return `http://127.0.0.1:${port}`;
      }
    }
  } catch {
    // Ignore error reading .backend_port
  }
  return `http://127.0.0.1:${process.env.PORT || "4173"}`;
}

const backendTarget = getBackendTarget();

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
    host: "localhost",
    proxy: {
      "/api": backendTarget,
      "/landing": backendTarget,
      "/outputs": backendTarget,
      "/downloads": backendTarget,
      "/data": backendTarget,
      "/public": backendTarget,
      "/images": backendTarget,
      "/videos": backendTarget,
      "/js": backendTarget,
      "/css": backendTarget,
      "/assets": backendTarget,
      "/libs": backendTarget,
      "/transitions.js": backendTarget,
      "/noise.js": backendTarget,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
