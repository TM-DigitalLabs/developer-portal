import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const generatedSidebarPath = fileURLToPath(new URL('./src/generated/sidebar.mjs', import.meta.url));
let sidebar = [];

if (existsSync(generatedSidebarPath)) {
  const generatedSidebar = await import('./src/generated/sidebar.mjs');
  sidebar = generatedSidebar.default;
}

export default defineConfig({
  ...(process.env.SITE_URL ? { site: process.env.SITE_URL } : {}),
  integrations: [
    starlight({
      title: 'Developer Portal',
      description: 'A single entry point for company project documentation.',
      sidebar,
      components: {
        Footer: './src/components/SourceFooter.astro',
      },
      customCss: ['./src/styles/portal.css'],
    }),
  ],
});
