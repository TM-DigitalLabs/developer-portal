import { describe, expect, it } from 'vitest';
import { GitHubSourceClient } from '../scripts/lib/github.js';
import type { ProjectDefinition } from '../scripts/lib/types.js';

const project: ProjectDefinition = {
  id: 'payments-api',
  name: 'Payments API',
  description: 'Docs',
  category: 'product',
  repository: 'acme/payments-api',
  branch: 'main',
  docsPath: 'docs',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('GitHub source client', () => {
  it('resolves a branch and enumerates the configured documentation tree', async () => {
    const responses = [
      response({ full_name: 'acme/payments-api' }),
      response({ object: { sha: 'commit-sha', type: 'commit' } }),
      response({ tree: { sha: 'tree-sha' } }),
      response({
        truncated: false,
        tree: [
          { path: 'docs', type: 'tree', sha: 'docs-sha' },
          { path: 'docs/index.md', type: 'blob', sha: 'index-sha', size: 10 },
          { path: 'docs/architecture/system.md', type: 'blob', sha: 'system-sha', size: 10 },
          { path: 'src/not-docs.ts', type: 'blob', sha: 'other-sha' },
        ],
      }),
    ];
    const client = new GitHubSourceClient({ token: 'test-token', request: async () => responses.shift() as Response });
    await expect(client.inspect(project)).resolves.toEqual({
      project,
      commit: 'commit-sha',
      files: [
        { path: 'architecture/system.md', sha: 'system-sha', size: 10 },
        { path: 'index.md', sha: 'index-sha', size: 10 },
      ],
    });
  });

  it('reports inaccessible repositories and missing blobs clearly', async () => {
    const inaccessible = new GitHubSourceClient({ token: 'test-token', request: async () => response({ message: 'Not Found' }, 404) });
    await expect(inaccessible.inspect(project)).rejects.toThrow('GitHub returned 404');

    const missingBlob = new GitHubSourceClient({ token: 'test-token', request: async () => response({ message: 'Not Found' }, 404) });
    await expect(missingBlob.downloadFile(project.repository, 'missing-sha')).rejects.toThrow('GitHub returned 404');
  });

  it('rejects truncated trees instead of publishing partial documentation', async () => {
    const responses = [
      response({ full_name: 'acme/payments-api' }),
      response({ object: { sha: 'commit-sha', type: 'commit' } }),
      response({ tree: { sha: 'tree-sha' } }),
      response({ truncated: true, tree: [] }),
    ];
    const client = new GitHubSourceClient({ token: 'test-token', request: async () => responses.shift() as Response });
    await expect(client.inspect(project)).rejects.toThrow('truncated documentation tree');
  });

  it('rejects missing documentation directories and required index files', async () => {
    const missingDocsResponses = [
      response({ full_name: 'acme/payments-api' }),
      response({ object: { sha: 'commit-sha', type: 'commit' } }),
      response({ tree: { sha: 'tree-sha' } }),
      response({ truncated: false, tree: [] }),
    ];
    const missingDocs = new GitHubSourceClient({ token: 'test-token', request: async () => missingDocsResponses.shift() as Response });
    await expect(missingDocs.inspect(project)).rejects.toThrow('docs/ was not found');

    const missingIndexResponses = [
      response({ full_name: 'acme/payments-api' }),
      response({ object: { sha: 'commit-sha', type: 'commit' } }),
      response({ tree: { sha: 'tree-sha' } }),
      response({ truncated: false, tree: [{ path: 'docs', type: 'tree', sha: 'docs-sha' }, { path: 'docs/readme.md', type: 'blob', sha: 'readme-sha' }] }),
    ];
    const missingIndex = new GitHubSourceClient({ token: 'test-token', request: async () => missingIndexResponses.shift() as Response });
    await expect(missingIndex.inspect(project)).rejects.toThrow('docs/index.md was not found');
  });
});
