import { resolve } from 'node:path';
import { formatExpectedError } from './lib/errors.js';
import { validateInternalLinks } from './lib/links.js';

try {
  await validateInternalLinks(resolve(import.meta.dirname, '../src/content/docs'));
  console.log('Internal documentation links are valid.');
} catch (error) {
  console.error('Documentation link validation failed: ' + formatExpectedError(error));
  process.exitCode = 1;
}
