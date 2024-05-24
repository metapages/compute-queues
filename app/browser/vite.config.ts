import fs from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';

import react from '@vitejs/plugin-react';

const HOST: string = process.env.HOST || "server1.localhost";
const PORT: string = process.env.PORT || "4440";
const CERT_FILE: string | undefined = process.env.CERT_FILE;
const CERT_KEY_FILE: string | undefined = process.env.CERT_KEY_FILE;
const BASE: string | undefined = process.env.BASE;
const OUTDIR: string | undefined = process.env.OUTDIR;
const INSIDE_CONTAINER: boolean = fs.existsSync("/.dockerenv");

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  // For serving NOT at the base path e.g. with github pages: https://<user_or_org>.github.io/<repo>/
  base: BASE,
  resolve: {
    alias: {
      "/@": resolve(__dirname, "./src"),
    },
    preserveSymlinks: true,
  },

  // this is really stupid this should not be necessary
  plugins: [
    react(),
  ],

  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" },
  },

  build: {
    outDir: OUTDIR ?? "./dist",
    target: "esnext",
    sourcemap: true,
    minify: mode === "development" ? false : "esbuild",
  },
  server: {
    open: INSIDE_CONTAINER ? undefined : "/",
    host: INSIDE_CONTAINER ? "0.0.0.0" : HOST,
    port: parseInt(
      CERT_KEY_FILE && fs.existsSync(CERT_KEY_FILE) ? PORT : "8000"
    ),
    https:
      CERT_KEY_FILE &&
      fs.existsSync(CERT_KEY_FILE) &&
      CERT_FILE &&
      fs.existsSync(CERT_FILE)
        ? {
            key: fs.readFileSync(CERT_KEY_FILE),
            cert: fs.readFileSync(CERT_FILE),
          }
        : undefined,
  },
}));
