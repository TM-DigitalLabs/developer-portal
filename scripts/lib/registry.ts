import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { ProjectPortalError } from './errors.js';
import type { ProjectDefinition, ProjectRegistry } from './types.js';

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPOSITORY_PATTERN = /^[^/\\\\\s]+\/[^/\\\\\s]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProjectPortalError(label + ': "' + field + '" is required and must be a non-empty string.');
  }
  return value.trim();
}

export function parseProjectRegistry(source: string, sourceName = 'portal/projects.yaml'): ProjectRegistry {
  let value: unknown;
  try {
    value = parse(source);
  } catch (error) {
    throw new ProjectPortalError(sourceName + ': invalid YAML (' + (error instanceof Error ? error.message : String(error)) + ').');
  }
  if (!isRecord(value)) throw new ProjectPortalError(sourceName + ': root must be a mapping.');
  if (value.version !== 1) throw new ProjectPortalError(sourceName + ': version must be 1.');
  if (!Array.isArray(value.projects)) throw new ProjectPortalError(sourceName + ': projects must be a list.');

  const ids = new Set<string>();
  const projects: ProjectDefinition[] = value.projects.map((item, index) => {
    if (!isRecord(item)) throw new ProjectPortalError('Project at index ' + index + ': must be a mapping.');
    const itemId = typeof item.id === 'string' ? item.id.trim() : '';
    const label = itemId ? 'Project "' + itemId + '"' : 'Project at index ' + index;
    const id = requiredString(item.id, 'id', label);
    const name = requiredString(item.name, 'name', 'Project "' + id + '"');
    const description = requiredString(item.description, 'description', 'Project "' + id + '"');
    const category = requiredString(item.category, 'category', 'Project "' + id + '"');
    const repository = requiredString(item.repository, 'repository', 'Project "' + id + '"');
    const branch = requiredString(item.branch, 'branch', 'Project "' + id + '"');
    const docsPath = requiredString(item.docsPath, 'docsPath', 'Project "' + id + '"');

    if (!PROJECT_ID_PATTERN.test(id)) throw new ProjectPortalError('Project "' + id + '": id must be a lowercase kebab-case path segment.');
    if (ids.has(id)) throw new ProjectPortalError('Project "' + id + '": id must be unique.');
    ids.add(id);
    if (!REPOSITORY_PATTERN.test(repository)) throw new ProjectPortalError('Project "' + id + '": repository must use the owner/name format.');
    if (docsPath.startsWith('/') || docsPath.includes('\\') || docsPath.split('/').some((part) => part === '..' || part === '.')) {
      throw new ProjectPortalError('Project "' + id + '": docsPath must be a safe relative POSIX path.');
    }
    if (/\p{Cc}/u.test(branch)) throw new ProjectPortalError('Project "' + id + '": branch contains control characters.');
    return { id, name, description, category, repository, branch, docsPath: docsPath.replace(/\/+$/, '') };
  });
  return { version: 1, projects };
}

export async function readProjectRegistry(path: string): Promise<ProjectRegistry> {
  try {
    return parseProjectRegistry(await readFile(path, 'utf8'), path);
  } catch (error) {
    if (error instanceof ProjectPortalError) throw error;
    throw new ProjectPortalError('Unable to read project registry at ' + path + ': ' + (error instanceof Error ? error.message : String(error)) + '.');
  }
}
