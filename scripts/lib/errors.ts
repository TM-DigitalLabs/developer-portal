export class ProjectPortalError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProjectPortalError';
  }
}

export function formatExpectedError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
