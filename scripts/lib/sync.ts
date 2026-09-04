import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, posix, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { ProjectPortalError } from './errors.js';
import { buildMetadataFile, generateSidebarModule, sourceFileUrl, sourceRepositoryFileUrl, toProjectMetadata } from './metadata.js';
import type { GitHubSourceProvider, ProjectDefinition, SourceFile, SourceSnapshot } from './types.js';

const MARKDOWN_PATTERN = /\.(md|mdx)$/i;
const MARKDOWN_LINK_PATTERN = /!?(?:\[[^\]]*\])\((<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/g;
const IGNORED_LINK_SCHEMES = /^(?:https?:|mailto:|tel:|data:|\/\/)/i;
const FRONTMATTER_STRINGIFY_OPTIONS = { schema: 'yaml-1.1' } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function titleFromContent(content: string, sourcePath: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.replace(/[#*_\x60]/g, '').trim();
  return basename(sourcePath).replace(/\.(md|mdx)$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rewriteSourceRelativeLinks(content: string, project: ProjectDefinition, sourcePath: string): string {
  const sourceDocsRoot = posix.normalize(project.docsPath);
  const sourceDirectory = posix.dirname(sourcePath);
  let inFence = false;

  return content.split(/\r?\n/).map((line) => {
    if (/^\s*(?:\x60\x60\x60|~~~)/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    return line.replace(MARKDOWN_LINK_PATTERN, (fullMatch, capturedTarget: string) => {
      const angleWrapped = capturedTarget.startsWith('<') && capturedTarget.endsWith('>');
      const target = capturedTarget.replace(/^<|>$/g, '');
      if (!target || target.startsWith('#') || target.startsWith('/') || IGNORED_LINK_SCHEMES.test(target)) return fullMatch;

      const suffixIndex = target.search(/[?#]/);
      const targetPath = suffixIndex === -1 ? target : target.slice(0, suffixIndex);
      const suffix = suffixIndex === -1 ? '' : target.slice(suffixIndex);
      if (!targetPath) return fullMatch;

      const repositoryPath = posix.normalize(posix.join(sourceDocsRoot, sourceDirectory, targetPath));
      const isInsideDocumentation = repositoryPath === sourceDocsRoot || repositoryPath.startsWith(sourceDocsRoot + '/');
      if (isInsideDocumentation || repositoryPath === '..' || repositoryPath.startsWith('../')) return fullMatch;

      const sourceUrl = sourceRepositoryFileUrl(project, repositoryPath) + suffix;
      const replacement = angleWrapped ? '<' + sourceUrl + '>' : sourceUrl;
      return fullMatch.replace(capturedTarget, replacement);
    });
  }).join('\n');
}

export function addGeneratedFrontmatter(content: string, project: ProjectDefinition, sourcePath: string, commit: string, syncedAt: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const body = match ? content.slice(match[0].length) : content;
  let frontmatter: Record<string, unknown> = {};

  if (match) {
    try {
      const parsed: unknown = parse(match[1]);
      if (parsed !== null && parsed !== undefined) {
        if (!isRecord(parsed)) throw new Error('frontmatter must be a mapping');
        frontmatter = parsed;
      }
    } catch (error) {
      throw new ProjectPortalError('Project "' + project.id + '": invalid frontmatter in ' + sourcePath + ': ' + (error instanceof Error ? error.message : String(error)) + '.');
    }
  }

  const source = {
    repository: project.repository,
    branch: project.branch,
    commit,
    syncedAt,
    path: [project.docsPath, sourcePath].join('/'),
  };
  const generated = {
    ...frontmatter,
    title: typeof frontmatter.title === 'string' && frontmatter.title.trim() ? frontmatter.title : titleFromContent(body, sourcePath),
    editUrl: sourceFileUrl(project, sourcePath),
    source,
  };
  return '---\n' + stringify(generated, FRONTMATTER_STRINGIFY_OPTIONS) + '---\n' + rewriteSourceRelativeLinks(body, project, sourcePath);
}

export function projectDestination(root: string, projectId: string): string {
  return join(root, projectId);
}

export function namespacedDestination(root: string, projectId: string, sourcePath: string): string {
  const destination = resolve(projectDestination(root, projectId), sourcePath);
  const projectRoot = resolve(projectDestination(root, projectId));
  if (destination !== projectRoot && !destination.startsWith(projectRoot + '/')) {
    throw new ProjectPortalError('Refusing to write a path outside project "' + projectId + '": ' + sourcePath + '.');
  }
  return destination;
}

async function writeSnapshot(root: string, snapshot: SourceSnapshot, syncedAt: string): Promise<void> {
  for (const file of snapshot.files) {
    const destination = namespacedDestination(root, snapshot.project.id, file.path);
    await mkdir(dirname(destination), { recursive: true });
    const content = MARKDOWN_PATTERN.test(file.path)
      ? addGeneratedFrontmatter(Buffer.from(file.content).toString('utf8'), snapshot.project, file.path, snapshot.commit, syncedAt)
      : file.content;
    await writeFile(destination, content);
  }
}

export async function synchronizeProjects(options: {
  projects: ProjectDefinition[];
  provider: GitHubSourceProvider;
  generatedRoot: string;
  metadataPath: string;
  sidebarPath: string;
  now?: () => Date;
}): Promise<void> {
  const syncedAt = (options.now ?? (() => new Date()))().toISOString();
  await rm(options.generatedRoot, { recursive: true, force: true });
  await rm(options.metadataPath, { force: true });
  await rm(options.sidebarPath, { force: true });

  const stagingRoot = await mkdtemp(join(tmpdir(), 'developer-portal-sync-'));
  const stagingDocs = join(stagingRoot, 'projects');
  const snapshots: SourceSnapshot[] = [];
  try {
    await mkdir(stagingDocs, { recursive: true });
    for (const project of options.projects) {
      try {
        const inspection = await options.provider.inspect(project);
        const files: SourceFile[] = [];
        for (const reference of inspection.files) {
          try {
            files.push({ path: reference.path, content: await options.provider.downloadFile(project.repository, reference.sha) });
          } catch (error) {
            throw new ProjectPortalError('Project "' + project.id + '": unable to retrieve ' + project.docsPath + '/' + reference.path + ': ' + (error instanceof Error ? error.message : String(error)) + '.');
          }
        }
        snapshots.push({ project, commit: inspection.commit, files });
      } catch (error) {
        if (error instanceof ProjectPortalError) throw error;
        throw new ProjectPortalError('Project "' + project.id + '": synchronization failed: ' + (error instanceof Error ? error.message : String(error)) + '.');
      }
    }

    for (const snapshot of snapshots) await writeSnapshot(stagingDocs, snapshot, syncedAt);
    await mkdir(dirname(options.generatedRoot), { recursive: true });
    await rename(stagingDocs, options.generatedRoot);

    const metadata = buildMetadataFile(snapshots.map((snapshot) => toProjectMetadata(snapshot, syncedAt)), syncedAt);
    await mkdir(dirname(options.metadataPath), { recursive: true });
    await writeFile(options.metadataPath, JSON.stringify(metadata, null, 2) + '\n');
    await mkdir(dirname(options.sidebarPath), { recursive: true });
    await writeFile(options.sidebarPath, generateSidebarModule(options.projects));
  } catch (error) {
    await rm(options.generatedRoot, { recursive: true, force: true });
    await rm(options.metadataPath, { force: true });
    await rm(options.sidebarPath, { force: true });
    if (error instanceof ProjectPortalError) throw error;
    throw new ProjectPortalError('Documentation synchronization failed: ' + (error instanceof Error ? error.message : String(error)) + '.');
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function listGeneratedFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(relative(root, path));
    }
  }
  try {
    await visit(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return files.sort();
}

export async function readGeneratedFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
