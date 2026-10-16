import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.KSSL_API_TARGET || "http://127.0.0.1:8600";

/* KSSL_Deploy frontend. Dev proxies /api to the FastAPI backend on :8600;
   the production build fetches /api relative to its own origin, so any static
   server that also routes /api to the backend serves it unchanged. */

/* The dataset always comes from the PostgreSQL-backed API; a checked-in snapshot or
   external enrichment endpoint would make an empty database look populated. */
async function apiMiddleware(req, res, next) {
  if (req.url && req.url.startsWith("/api/img")) {
    /* Image proxy: many publishers block hotlinking (Referer/UA checks), so an
       og:image that renders fine on the source 403s in an <img> here. Fetching it
       server-side with a browser UA and no referer bypasses that; the browser then
       loads it from our own origin. Mirrors the backend /api/img on staging/prod. */
    try {
      const src = new URL(req.url, "http://localhost").searchParams.get("u") || "";
      if (!/^https?:\/\//i.test(src)) { res.statusCode = 400; return res.end("bad url"); }
      const upstream = await fetch(src, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", "accept": "image/*,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      const ct = upstream.headers.get("content-type") || "";
      if (!upstream.ok || !/^image\//i.test(ct)) { res.statusCode = 404; return res.end("not an image"); }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.end(buf);
    } catch (e) {
      res.statusCode = 404;
      return res.end("img fetch failed");
    }
  }
  return next();
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "api-local",
      configureServer(server) {
        server.middlewares.use(apiMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(apiMiddleware);
      },
    },
  ],
  /* `preview` serves the BUILT bundle. It needs the same proxy as `server`, or the
     only way to test the real artefact is to deploy it. */
  preview: {
    port: 5179,
    host: true,
    strictPort: true,
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
  },
  server: {
    port: 5178,
    host: true,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
