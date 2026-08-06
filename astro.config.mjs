// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages: https://quokkoo.github.io/news/
export default defineConfig({
  site: "https://quokkoo.github.io",
  base: "/news",
  trailingSlash: "ignore",
  output: "static",
  build: {
    // 把 CSS 内联进 HTML，减少首屏请求（站点 CSS 很小）
    inlineStylesheets: "auto",
    format: "directory",
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // 无外部 CDN，全部本地打包
      assetsInlineLimit: 4096,
    },
  },
  compressHTML: true,
});
