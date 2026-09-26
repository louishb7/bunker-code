import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  build: { target: "es2022" },
});
