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
      title: 'Portal deweloperski',
      description: 'Jedno miejsce dla dokumentacji projektów i wiedzy inżynierskiej.',
      logo: {
        dark: './src/assets/tm-mark-dark.svg',
        light: './src/assets/tm-mark.svg',
        alt: 'Znak TM Tomasza Molisa',
      },
      locales: {
        root: { label: 'Polski', lang: 'pl' },
      },
      defaultLocale: 'root',
      sidebar,
      components: {
        Footer: './src/components/SourceFooter.astro',
      },
      customCss: ['./src/styles/portal.css'],
    }),
  ],
});
