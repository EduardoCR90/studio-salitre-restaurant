import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendMock } from './seed-source.mjs';
import { imageSlots, assertPlanStructure } from './seed-plan.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('source loader fails closed without frontend dependencies', async () => {
  await assert.rejects(loadFrontendMock('/tmp/nonexistent-salitre-frontend'));
});

test('the real frontend mock resolves extensionless imports after template extraction', {
  skip: !process.env.SEED_FRONTEND && 'Run in the cross-repository audit with SEED_FRONTEND set',
}, async () => {
  const frontend = resolve(process.env.SEED_FRONTEND);
  const mock = await loadFrontendMock(frontend);
  assert.equal(mock.pages.length, 4);
  assert.equal(mock.dishes.length, 11);
  const source = (await readFile(resolve(frontend, '.sanity/seed.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse);
  assertPlanStructure(source);
  const slots = imageSlots(mock);
  assert.ok(slots.length > 0);
  assert.ok(slots.every(slot => new URL(slot.image.url).origin === 'https://images.unsplash.com'));
});
