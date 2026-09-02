import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        source: z
          .object({
            repository: z.string(),
            branch: z.string(),
            commit: z.string(),
            syncedAt: z.string(),
            path: z.string(),
          })
          .optional(),
      }),
    }),
  }),
};
