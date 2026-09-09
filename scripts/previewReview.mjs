// Development-only fixture preview. No production credentials or network providers.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixtureApp } from '../tests/helpers/trackRecordFixture.mjs';

const { app } = createFixtureApp();
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url));
app.use('/api', (_req, res) => res.status(401).json({ error: 'Not authenticated' }));
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
app.listen(4173, '127.0.0.1', () => console.log('Fixture preview: http://127.0.0.1:4173 (synthetic data)'));
