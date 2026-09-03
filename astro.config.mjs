// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// https://astro.build/config
// CSP is build/production-only: Astro's hashes are computed for the real
// bundled output, so enabling it under `astro dev` just breaks Vite's own
// HMR/dev-toolbar scripts without protecting anything (nothing dev-only is
// ever exposed to a visitor).
export default defineConfig({
  site: 'https://chancepublishers.com',
  adapter: netlify(),
  security: process.env.NODE_ENV === 'production' ? {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
        "frame-src https://www.google.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://www.googletagmanager.com'],
      },
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      },
    },
  } : undefined,
});
