export interface ProjectDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  repository: string;
  branch: string;
  docsPath: string;
}

export interface ProjectRegistry {
  version: 1;
  projects: ProjectDefinition[];
}

export interface RemoteFileReference {
  path: string;
  sha: string;
  size?: number;
}

export interface SourceInspection {
  project: ProjectDefinition;
  commit: string;
  files: RemoteFileReference[];
}

export interface SourceFile {
  path: string;
  content: Uint8Array;
}

export interface SourceSnapshot {
  project: ProjectDefinition;
  commit: string;
  files: SourceFile[];
}

export interface GitHubSourceProvider {
  inspect(project: ProjectDefinition): Promise<SourceInspection>;
  downloadFile(repository: string, sha: string): Promise<Uint8Array>;
}

export interface ProjectMetadata {
  projectId: string;
  name: string;
  description: string;
  category: string;
  repository: string;
  branch: string;
  commit: string;
  syncedAt: string;
  sourceUrl: string;
  documentationAvailable: boolean;
  docFileCount: number;
}

export interface ProjectMetadataFile {
  version: 1;
  generatedAt: string;
  projects: ProjectMetadata[];
}
