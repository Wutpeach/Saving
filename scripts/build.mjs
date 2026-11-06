import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist/host', { recursive: true });
await copyFile('src/host/operations.jsx', 'dist/host/operations.jsx');
