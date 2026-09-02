import { resolve } from 'node:path';
import { GitHubSourceClient } from './lib/github.js';
import { formatExpectedError } from './lib/errors.js';
import { readProjectRegistry } from './lib/registry.js';

const root = resolve(import.meta.dirname, '..');

try {
  const registry = await readProjectRegistry(resolve(root, 'portal/projects.yaml'));
  if (registry.projects.length === 0) {
    console.log('Project registry is valid; no projects are registered.');
  } else {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is required to validate registered repositories.');
    const provider = new GitHubSourceClient({ token, apiUrl: process.env.GITHUB_API_URL });
    for (const project of registry.projects) {
      await provider.inspect(project);
      console.log('Validated ' + project.id + ' (' + project.repository + '@' + project.branch + ').');
    }
  }
} catch (error) {
  console.error('Project registry validation failed: ' + formatExpectedError(error));
  process.exitCode = 1;
}
