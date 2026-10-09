import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPrecache } from '../tools/precache.mjs';

test('precache.js matches current app files (run: node tools/precache.mjs)', () => {
  const { content } = buildPrecache();
  assert.equal(readFileSync(new URL('../precache.js', import.meta.url), 'utf8'), content);
});
