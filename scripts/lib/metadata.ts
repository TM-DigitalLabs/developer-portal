import type { ProjectDefinition, ProjectMetadata, ProjectMetadataFile, SourceSnapshot } from './types.js';

export function sourceRepositoryUrl(repository: string): string {
  return 'https://github.com/' + repository;
}

export function sourceFileUrl(project: ProjectDefinition, sourcePath: string): string {
  const branch = project.branch.split('/').map(encodeURIComponent).join('/');
  const path = [project.docsPath, sourcePath].filter(Boolean).join('/').split('/').map(encodeURIComponent).join('/');
  return sourceRepositoryUrl(project.repository) + '/blob/' + branch + '/' + path;
}

export function toProjectMetadata(snapshot: SourceSnapshot, syncedAt: string): ProjectMetadata {
  return {
    projectId: snapshot.project.id,
    name: snapshot.project.name,
    description: snapshot.project.description,
    category: snapshot.project.category,
    repository: snapshot.project.repository,
    branch: snapshot.project.branch,
    commit: snapshot.commit,
    syncedAt,
    sourceUrl: sourceRepositoryUrl(snapshot.project.repository),
    documentationAvailable: snapshot.files.some((file) => file.path === 'index.md'),
    docFileCount: snapshot.files.filter((file) => /\.(md|mdx)$/i.test(file.path)).length,
  };
}

export function buildMetadataFile(projects: ProjectMetadata[], generatedAt: string): ProjectMetadataFile {
  return {
    version: 1,
    generatedAt,
    projects: [...projects].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
  };
}

export function generateSidebarModule(projects: ProjectDefinition[]): string {
  const groups = [...projects].sort((a, b) => a.name.localeCompare(b.name)).map((project) => ({
    label: project.name,
    items: [
      { label: 'Overview', link: '/projects/' + project.id + '/' },
      { autogenerate: { directory: 'projects/' + project.id } },
    ],
  }));
  return 'export default ' + JSON.stringify([{ label: 'Projects', items: groups }], null, 2) + ';\n';
}
