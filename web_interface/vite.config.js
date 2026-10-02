import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const albertProxy = {
  "/albert-api": {
    target: "https://albert.api.etalab.gouv.fr",
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/albert-api/, ""),
  },
};

export default defineConfig({
  base: "./",
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
    include: ["gliner", "udpipe-wasm"],
  },
  worker: {
    format: "es",
  },
  assetsInclude: ["**/*.udpipe", "**/*.wasm"],
  server: {
    host: "127.0.0.1",
    proxy: albertProxy,
  },
  preview: {
    host: "127.0.0.1",
    proxy: albertProxy,
  },
});
