import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'static-content-policy',
      apply: 'build',
      transformIndexHtml: () => [{
        tag: 'meta',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: [
            "default-src 'none'",
            "script-src 'self' 'wasm-unsafe-eval'",
            "style-src 'self'",
            "img-src 'self' blob: data:",
            "connect-src 'self'",
            "base-uri 'self'",
            "form-action 'none'",
            "object-src 'none'",
          ].join('; '),
        },
        injectTo: 'head-prepend',
      }],
    },
  ],
  test: {
    environment: 'node',
  },
});
