import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './paths.mjs';

// Export the index into a disposable directory; never modify the working tree or index.
const entry = process.argv[2];
if (!entry || path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..')) throw new Error('検証スクリプトをリポジトリ内の相対パスで指定してください。');
await mkdir(path.join(projectRoot, 'dist'), { recursive: true });
const snapshot = await mkdtemp(path.join(projectRoot, 'dist', '.staged-check-'));
try {
  const files = execFileSync('git', ['ls-files', '--cached', '-z', '--', 'Triadic-extension/src', 'tests', 'scripts', 'package.json', 'package-lock.json'], { cwd: projectRoot });
  execFileSync('git', ['checkout-index', '--prefix=' + snapshot + path.sep, '-z', '--stdin'], { cwd: projectRoot, input: files });
  if (existsSync(path.join(projectRoot, 'node_modules'))) {
    await symlink(path.join(projectRoot, 'node_modules'), path.join(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  }
  const result = spawnSync(process.execPath, [path.join(snapshot, entry)], { cwd: snapshot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('コミット対象の検証に失敗しました。ステージ済みの実装とテストを確認してください。');
} finally {
  await rm(snapshot, { recursive: true, force: true });
}
