import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('src/engine/preparePredictionContext.js');
const src = fs.readFileSync(filePath, 'utf8');

assert.match(
  src,
  /buildFeatureVector\([\s\S]*rawData\?\.\s*meta[\s\S]*\)/m
);

console.log('ok');
