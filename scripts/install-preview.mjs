import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.env.RENDER) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  execFileSync('python3', ['-m', 'pip', 'install', '--no-cache-dir', '--target', path.join(root, '.preview-python'), '-r', path.join(root, 'requirements-preview.txt')], { stdio: 'inherit' });
}
