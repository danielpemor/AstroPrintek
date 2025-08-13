import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  experimental: {
    middleware: true
  },
  integrations: [tailwind()],
});