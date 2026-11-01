import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Reuse the frontend's installed TypeScript loader. Native type stripping does
// not resolve its Astro/TypeScript extensionless imports. No CMS requests here.
export async function loadFrontendMock(frontend) {
  const root = resolve(frontend);
  const require = createRequire(join(root, 'package.json'));
  const { tsImport } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href);
  const { mockContent } = await tsImport(pathToFileURL(join(root, 'src/lib/mock.ts')).href, import.meta.url);
  return mockContent;
}
