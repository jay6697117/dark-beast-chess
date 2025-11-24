import { serveDir, serveFile } from "std/http/file_server.ts";

import { createApp } from "./server/app.ts";

const app = createApp();
const distDir = "dist";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // WebSocket 升级交给 Hono 应用处理
  if (url.pathname === "/ws") {
    return app.fetch(req);
  }

  // 其余路径走静态资源，未命中回退 index.html 以支持前端路由
  return serveDir(req, {
    fsRoot: distDir,
    quiet: true,
    onError: () => serveFile(req, `${distDir}/index.html`),
  });
});
