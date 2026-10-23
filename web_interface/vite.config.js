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

const gliner2PiiProxy = {
  "/gliner2-pii-api": {
    target: "http://127.0.0.1:8765",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/gliner2-pii-api/, ""),
  },
};

const proxies = {
  ...albertProxy,
  ...gliner2PiiProxy,
};

export default defineConfig({
  base: "./",
  plugins: [react()],
  optimizeDeps: {
    exclude: ["@huggingface/transformers", "onnxruntime-web"],
    include: ["gliner", "udpipe-wasm"],
  },
  worker: {
    format: "es",
  },
  assetsInclude: ["**/*.udpipe", "**/*.wasm"],
  server: {
    host: "127.0.0.1",
    proxy: proxies,
  },
  preview: {
    host: "127.0.0.1",
    proxy: proxies,
  },
});
