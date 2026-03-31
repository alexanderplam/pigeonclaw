import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const require = createRequire(path.join(desktopDir, 'package.json'));

const electronPackage = JSON.parse(readFileSync(require.resolve('electron/package.json'), 'utf8'));
const betterSqlitePackagePath = require.resolve('better-sqlite3/package.json');
const betterSqliteBinaryPath = path.join(
  path.dirname(betterSqlitePackagePath),
  'build',
  'Release',
  'better_sqlite3.node',
);
const stampDir = path.join(desktopDir, 'node_modules', '.cache', 'pigeonclaw');
const stampPath = path.join(stampDir, 'electron-native-deps.json');
const currentStamp = {
  electronVersion: electronPackage.version,
  platform: process.platform,
  arch: process.arch,
};

const loadStamp = () => {
  if (!existsSync(stampPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(stampPath, 'utf8'));
  } catch {
    return null;
  }
};

const needsRebuild =
  !existsSync(betterSqliteBinaryPath) ||
  JSON.stringify(loadStamp()) !== JSON.stringify(currentStamp);

if (!needsRebuild) {
  console.log(
    `Electron native dependencies already prepared for Electron ${currentStamp.electronVersion} (${currentStamp.platform}/${currentStamp.arch}).`,
  );
  process.exit(0);
}

console.log(
  `Preparing Electron native dependencies for Electron ${currentStamp.electronVersion} (${currentStamp.platform}/${currentStamp.arch})...`,
);

const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'electron-builder', 'install-app-deps'],
  {
    cwd: desktopDir,
    stdio: 'inherit',
    env: process.env,
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(betterSqliteBinaryPath)) {
  console.error(
    `Expected native module at ${betterSqliteBinaryPath}, but it was not found after rebuild.`,
  );
  process.exit(1);
}

mkdirSync(stampDir, { recursive: true });
writeFileSync(stampPath, `${JSON.stringify(currentStamp, null, 2)}\n`);

console.log('Electron native dependencies are ready.');
