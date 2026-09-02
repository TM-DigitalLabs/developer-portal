import { describe, expect, it } from 'vitest';
import { parseProjectRegistry } from '../scripts/lib/registry.js';

const valid = [
  'version: 1',
  'projects:',
  '  - id: payments-api',
  '    name: Payments API',
  '    description: Payment service docs',
  '    category: product',
  '    repository: acme/payments-api',
  '    branch: main',
  '    docsPath: docs',
].join('\n');

describe('project registry', () => {
  it('parses a valid registry and preserves dynamic categories', () => {
    expect(parseProjectRegistry(valid).projects[0]).toEqual({
      id: 'payments-api',
      name: 'Payments API',
      description: 'Payment service docs',
      category: 'product',
      repository: 'acme/payments-api',
      branch: 'main',
      docsPath: 'docs',
    });
  });

  it('rejects duplicate IDs', () => {
    const duplicate = [
      'version: 1',
      'projects:',
      '  - id: payments-api',
      '    name: First',
      '    description: First',
      '    category: product',
      '    repository: acme/first',
      '    branch: main',
      '    docsPath: docs',
      '  - id: payments-api',
      '    name: Second',
      '    description: Second',
      '    category: product',
      '    repository: acme/second',
      '    branch: main',
      '    docsPath: docs',
    ].join('\n');
    expect(() => parseProjectRegistry(duplicate)).toThrow('id must be unique');
  });

  it('rejects missing required fields and unsafe docs paths', () => {
    expect(() => parseProjectRegistry(valid.replace('name: Payments API', 'name:'))).toThrow('name');
    expect(() => parseProjectRegistry(valid.replace('docsPath: docs', 'docsPath: ../docs'))).toThrow('safe relative');
  });
});
