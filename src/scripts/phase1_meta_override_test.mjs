import assert from 'node:assert/strict';
import { resolveFixtureMeta } from '../features/resolveFixtureMeta.js';

const dbMeta = { a: 1, shared: 'db' };
const override = { a: 2, shared: 'override', live: true };
const resolved1 = resolveFixtureMeta(override, dbMeta);
assert.equal(resolved1.shared, 'override');
assert.equal(resolved1.live, true);

const resolved2 = resolveFixtureMeta(null, dbMeta);
assert.equal(resolved2.shared, 'db');

const resolved3 = resolveFixtureMeta(null, null);
assert.deepEqual(resolved3, {});

console.log('ok');
