import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** Serves /data (without the trailing slash) as the page data/index.html in dev and preview; Vercel does it with a rewrite. */
const dataPage = (): Plugin => {
  const rewrite = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, _res, next) => {
      const url = (req as { url?: string }).url;
      if (url && /^\/data(\?|$)/.test(url)) (req as { url?: string }).url = `/data/index.html${url.slice('/data'.length)}`;
      next();
    });
  };
  return { name: 'data-page', configureServer: rewrite, configurePreviewServer: rewrite };
};

export default defineConfig({
  plugins: [react(), dataPage()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        data: fileURLToPath(new URL('./data/index.html', import.meta.url)),
        devHub: fileURLToPath(new URL('./dev/index.html', import.meta.url)),
        devPlayground: fileURLToPath(new URL('./dev/playground.html', import.meta.url)),
        devCalculator: fileURLToPath(new URL('./dev/calculator.html', import.meta.url)),
        devStyleGuide: fileURLToPath(new URL('./dev/style-guide.html', import.meta.url)),
      },
    },
  },
});
