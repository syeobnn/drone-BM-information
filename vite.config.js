import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/vworld": {
        target: "https://api.vworld.kr",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vworld/, "")
      }
    }
  }
});
