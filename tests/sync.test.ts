import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { generateSidebarModule, sourceFileUrl, toProjectMetadata } from '../scripts/lib/metadata.js';
import { namespacedDestination, projectDestination, synchronizeProjects } from '../scripts/lib/sync.js';
import type { GitHubSourceProvider, ProjectDefinition, SourceInspection } from '../scripts/lib/types.js';

const project: ProjectDefinition = {
  id: 'payments-api',
  name: 'Payments API',
  description: 'Docs',
  category: 'product',
  repository: 'acme/payments-api',
  branch: 'main',
  docsPath: 'docs',
};

function provider(files: Array<{ path: string; content: string }>): GitHubSourceProvider {
  const inspection: SourceInspection = { project, commit: 'abc123', files: files.map((file, index) => ({ path: file.path, sha: 'sha-' + index })) };
  return {
    inspect: async () => inspection,
    downloadFile: async (_repository, sha) => Buffer.from(files[Number(sha.replace('sha-', ''))].content),
  };
}

describe('documentation synchronization', () => {
  it('creates namespaced destinations and preserves nested paths', () => {
    const root = '/tmp/generated';
    expect(projectDestination(root, project.id)).toBe('/tmp/generated/payments-api');
    expect(namespacedDestination(root, project.id, 'architecture/system.md')).toBe('/tmp/generated/payments-api/architecture/system.md');
  });

  it('generates metadata, sidebar, and removes stale generated content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'portal-test-'));
    const generatedRoot = join(root, 'docs/projects');
    const metadataPath = join(root, 'generated/project-metadata.json');
    const sidebarPath = join(root, 'generated/sidebar.mjs');
    const sourceFiles = [
      { path: 'index.md', content: '# Payments\n\n[Architecture](architecture/system.md)' },
      { path: 'architecture/system.md', content: '---\ntitle: System\n---\n# System' },
      { path: 'old.md', content: '# Old' },
    ];
    await synchronizeProjects({ projects: [project], provider: provider(sourceFiles), generatedRoot, metadataPath, sidebarPath, now: () => new Date('2026-01-02T03:04:05.000Z') });
    expect(await readFile(join(generatedRoot, 'payments-api/index.md'), 'utf8')).toContain('repository: acme/payments-api');
    expect(await readFile(join(generatedRoot, 'payments-api/architecture/system.md'), 'utf8')).toContain('title: System');
    expect(await readFile(metadataPath, 'utf8')).toContain('"commit": "abc123"');
    expect(await readFile(sidebarPath, 'utf8')).toContain('projects/payments-api');

    await synchronizeProjects({ projects: [project], provider: provider(sourceFiles.slice(0, 2)), generatedRoot, metadataPath, sidebarPath, now: () => new Date('2026-01-02T03:04:05.000Z') });
    await expect(stat(join(generatedRoot, 'payments-api/old.md'))).rejects.toThrow();
  });

  it('fails and leaves no generated output when a source cannot be retrieved', async () => {
    const root = await mkdtemp(join(tmpdir(), 'portal-test-failure-'));
    const generatedRoot = join(root, 'docs/projects');
    const metadataPath = join(root, 'generated/project-metadata.json');
    const sidebarPath = join(root, 'generated/sidebar.mjs');
    const failing: GitHubSourceProvider = {
      inspect: async () => { throw new Error('private repository unavailable'); },
      downloadFile: async () => Buffer.from(''),
    };
    await expect(synchronizeProjects({ projects: [project], provider: failing, generatedRoot, metadataPath, sidebarPath })).rejects.toThrow('private repository unavailable');
    await expect(readdir(generatedRoot)).rejects.toThrow();
  });
});

describe('metadata helpers', () => {
  it('creates source edit URLs and availability metadata', () => {
    const snapshot = { project, commit: 'abc', files: [{ path: 'index.md', content: Buffer.from('') }] };
    expect(sourceFileUrl(project, 'architecture/system.md')).toBe('https://github.com/acme/payments-api/blob/main/docs/architecture/system.md');
    expect(toProjectMetadata(snapshot, '2026-01-01T00:00:00.000Z').documentationAvailable).toBe(true);
    expect(generateSidebarModule([project])).toContain('autogenerate');
  });
});
