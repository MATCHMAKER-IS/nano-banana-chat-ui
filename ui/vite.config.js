import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const LAMBDA_URL = "https://mqoskkhk6qq4hog2rdtj7yfvuy0bwjqo.lambda-url.ap-northeast-1.on.aws";

export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis"
  },
  server: {
    proxy: {
      "/lambda": {
        target: LAMBDA_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lambda/, ""),
        headers: { origin: "" },
      },
    },
  },
});
