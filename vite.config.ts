import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    // Non-default port so it never collides with other dev servers on this machine
    // (keep in sync with devUrl in src-tauri/tauri.conf.json).
    port: 9999,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 9998,
        }
      : undefined,
    watch: {
      // Cargo's workspace output lives at /target, outside /src-tauri.
      // Ignore the directories themselves too, so Windows-locked binaries are
      // never visited by the frontend watcher.
      ignored: ["**/src-tauri/**", "**/target", "**/target/**"],
    },
  },
}));
