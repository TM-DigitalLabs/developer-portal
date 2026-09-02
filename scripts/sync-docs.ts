import { resolve } from 'node:path';
import { GitHubSourceClient } from './lib/github.js';
import { formatExpectedError } from './lib/errors.js';
import { readProjectRegistry } from './lib/registry.js';
import { synchronizeProjects } from './lib/sync.js';

const root = resolve(import.meta.dirname, '..');

try {
  const registry = await readProjectRegistry(resolve(root, 'portal/projects.yaml'));
  const token = process.env.GITHUB_TOKEN;
  if (registry.projects.length > 0 && !token) throw new Error('GITHUB_TOKEN is required to synchronize registered repositories.');
  const provider = new GitHubSourceClient({ token: token ?? 'not-needed-for-empty-registry', apiUrl: process.env.GITHUB_API_URL });
  await synchronizeProjects({
    projects: registry.projects,
    provider,
    generatedRoot: resolve(root, 'src/content/docs/projects'),
    metadataPath: resolve(root, 'src/generated/project-metadata.json'),
    sidebarPath: resolve(root, 'src/generated/sidebar.mjs'),
  });
  console.log('Synchronized ' + registry.projects.length + ' project' + (registry.projects.length === 1 ? '' : 's') + '.');
} catch (error) {
  console.error('Documentation synchronization failed: ' + formatExpectedError(error));
  process.exitCode = 1;
}
