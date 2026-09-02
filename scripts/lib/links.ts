import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { ProjectPortalError } from './errors.js';

const LINK_PATTERN = /!?(?:\[[^\]]*\])\((<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/g;
const IGNORED_SCHEMES = /^(?:https?:|mailto:|tel:|data:|\/\/)/i;
const DOCUMENT_EXTENSIONS = ['.md', '.mdx'];

async function walk(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else result.push(path);
    }
  }
  await visit(root);
  return result;
}

function candidates(root: string, currentFile: string, target: string): string[] {
  const targetPath = target.split('#')[0].split('?')[0];
  if (!targetPath) return [];
  const relativeTarget = targetPath.startsWith('/') ? targetPath.slice(1) : normalize(join(dirname(currentFile), targetPath));
  const base = resolve(root, relativeTarget);
  const paths = [base];
  if (!extname(base)) paths.push(...DOCUMENT_EXTENSIONS.map((extension) => base + extension), ...DOCUMENT_EXTENSIONS.map((extension) => join(base, 'index' + extension)));
  return paths;
}

export async function validateInternalLinks(root: string): Promise<void> {
  const filePaths = await walk(root);
  const existing = new Set(filePaths.map((path) => resolve(path)));
  const failures: string[] = [];

  for (const filePath of filePaths.filter((path) => DOCUMENT_EXTENSIONS.includes(extname(path).toLowerCase()))) {
    const content = await readFile(filePath, 'utf8');
    let inFence = false;
    const source = content.split(/\r?\n/).filter((line) => {
      if (/^\s*(?:\x60\x60\x60|~~~)/.test(line)) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    }).join('\n');
    for (const match of source.matchAll(LINK_PATTERN)) {
      const rawTarget = match[1].replace(/^<|>$/g, '');
      if (rawTarget.startsWith('#') || IGNORED_SCHEMES.test(rawTarget)) continue;
      const valid = candidates(root, filePath, rawTarget).some((candidate) => existing.has(resolve(candidate)));
      if (!valid) failures.push(relative(root, filePath) + ' -> ' + rawTarget);
    }
  }
  if (failures.length > 0) throw new ProjectPortalError('Broken internal documentation links:\n' + failures.map((failure) => '- ' + failure).join('\n'));
}
