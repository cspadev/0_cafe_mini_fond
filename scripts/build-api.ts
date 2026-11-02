// Bundles the API handlers (server/entries) into server-dist/, which the stubs in api/ re-export.
// The sources import each other with .ts extensions, which the bundler resolves once instead of leaving it to the platform.
import { build } from 'esbuild';

await build({
  entryPoints: {
    start: 'server/entries/start.ts',
    submit: 'server/entries/submit.ts',
    stats: 'server/entries/stats.ts',
  },
  outdir: 'server-dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'info',
});
