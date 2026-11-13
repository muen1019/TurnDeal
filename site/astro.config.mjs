import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
export default defineConfig({
  site: 'https://muen1019.github.io',
  base: '/TurnDeal',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react()],
  server: { host: '127.0.0.1' },
  devToolbar: { enabled: false },
});
