import { ProjectPortalError } from './errors.js';
import type { GitHubSourceProvider, ProjectDefinition, RemoteFileReference, SourceInspection } from './types.js';

interface RepositoryResponse { full_name?: unknown; }
interface RefResponse { object?: { sha?: unknown; type?: unknown }; }
interface CommitResponse { tree?: { sha?: unknown }; }
interface TreeEntry { path?: unknown; type?: unknown; sha?: unknown; size?: unknown; }
interface TreeResponse { truncated?: unknown; tree?: unknown; }
interface BlobResponse { content?: unknown; encoding?: unknown; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ProjectPortalError('GitHub response did not contain a valid ' + label + '.');
  return value;
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

export class GitHubApiError extends ProjectPortalError {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

export class GitHubSourceClient implements GitHubSourceProvider {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly request: typeof fetch;

  constructor(options: { token: string; apiUrl?: string; request?: typeof fetch }) {
    if (!options.token.trim()) throw new ProjectPortalError('GITHUB_TOKEN is required to synchronize project documentation.');
    this.token = options.token;
    this.apiUrl = (options.apiUrl ?? 'https://api.github.com').replace(/\/$/, '');
    this.request = options.request ?? fetch;
  }

  private async get<T>(path: string, project: ProjectDefinition): Promise<T> {
    let response: Response;
    try {
      response = await this.request(this.apiUrl + path, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + this.token,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'developer-documentation-portal',
        },
      });
    } catch (error) {
      throw new ProjectPortalError('Project "' + project.id + '": GitHub request failed for ' + project.repository + ': ' + (error instanceof Error ? error.message : String(error)) + '.');
    }
    if (!response.ok) {
      throw new GitHubApiError('Project "' + project.id + '": GitHub returned ' + response.status + ' for ' + project.repository + path + '. Check repository access, branch configuration, and App installation scope.', response.status);
    }
    return (await response.json()) as T;
  }

  async inspect(project: ProjectDefinition): Promise<SourceInspection> {
    const repo = await this.get<RepositoryResponse>('/repos/' + encodePath(project.repository), project);
    if (typeof repo.full_name === 'string' && repo.full_name.toLowerCase() !== project.repository.toLowerCase()) {
      throw new ProjectPortalError('Project "' + project.id + '": GitHub repository response did not match ' + project.repository + '.');
    }

    const ref = await this.get<RefResponse>('/repos/' + encodePath(project.repository) + '/git/ref/heads/' + encodePath(project.branch), project);
    const commit = asString(ref.object?.sha, 'branch commit SHA');
    if (ref.object?.type && ref.object.type !== 'commit') throw new ProjectPortalError('Project "' + project.id + '": ' + project.branch + ' does not resolve to a commit.');

    const commitResponse = await this.get<CommitResponse>('/repos/' + encodePath(project.repository) + '/git/commits/' + commit, project);
    const treeSha = asString(commitResponse.tree?.sha, 'tree SHA');
    const treeResponse = await this.get<TreeResponse>('/repos/' + encodePath(project.repository) + '/git/trees/' + treeSha + '?recursive=1', project);
    if (treeResponse.truncated === true) throw new ProjectPortalError('Project "' + project.id + '": GitHub returned a truncated documentation tree; synchronization stopped to avoid omitting files.');
    if (!Array.isArray(treeResponse.tree)) throw new ProjectPortalError('Project "' + project.id + '": GitHub returned an unreadable documentation tree.');

    const prefix = project.docsPath + '/';
    const files: RemoteFileReference[] = [];
    let docsDirectoryFound = false;
    for (const rawEntry of treeResponse.tree) {
      if (!isRecord(rawEntry)) continue;
      const entry = rawEntry as TreeEntry;
      const path = typeof entry.path === 'string' ? entry.path : '';
      if (path === project.docsPath && entry.type === 'tree') docsDirectoryFound = true;
      if (!path.startsWith(prefix) || entry.type !== 'blob') continue;
      const relativePath = path.slice(prefix.length);
      if (!relativePath || relativePath.split('/').some((part) => part === '..' || part === '.')) continue;
      files.push({ path: relativePath, sha: asString(entry.sha, 'blob SHA for ' + path), size: typeof entry.size === 'number' ? entry.size : undefined });
    }

    if (!docsDirectoryFound) throw new ProjectPortalError('Project "' + project.id + '": ' + project.docsPath + '/ was not found in ' + project.repository + '@' + project.branch + '.');
    if (!files.some((file) => file.path === 'index.md')) throw new ProjectPortalError('Project "' + project.id + '": ' + project.docsPath + '/index.md was not found in ' + project.repository + '@' + project.branch + '.');
    files.sort((left, right) => left.path.localeCompare(right.path));
    return { project, commit, files };
  }

  async downloadFile(repository: string, sha: string): Promise<Uint8Array> {
    const project: ProjectDefinition = { id: repository, name: repository, description: '', category: '', repository, branch: '', docsPath: '' };
    const blob = await this.get<BlobResponse>('/repos/' + encodePath(repository) + '/git/blobs/' + encodeURIComponent(sha), project);
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new ProjectPortalError('GitHub returned an unsupported blob encoding for ' + repository + '@' + sha + '.');
    return Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
  }
}
