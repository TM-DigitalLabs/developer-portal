import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { validateInternalLinks } from '../scripts/lib/links.js';

describe('internal documentation links', () => {
  it('accepts nested documents, assets, anchors, and external links', async () => {
    const root = await mkdtemp(join(tmpdir(), 'portal-links-'));
    await mkdir(join(root, 'architecture'), { recursive: true });
    await writeFile(join(root, 'index.md'), '[Architecture](architecture/system.md#design) [asset](diagram.svg) [external](https://example.com)');
    await writeFile(join(root, 'architecture/system.md'), '# Design');
    await writeFile(join(root, 'diagram.svg'), '<svg/>');
    await expect(validateInternalLinks(root)).resolves.toBeUndefined();
  });

  it('rejects broken internal links', async () => {
    const root = await mkdtemp(join(tmpdir(), 'portal-links-broken-'));
    await writeFile(join(root, 'index.md'), '[Missing](missing.md)');
    await expect(validateInternalLinks(root)).rejects.toThrow('missing.md');
  });
});
