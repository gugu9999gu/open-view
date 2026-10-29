import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = ['server.mjs'];
for (const directory of ['onboarding', 'lib', 'public', 'test', 'scripts', 'runtime', 'examples/runtime-app', 'examples/runtime-app/src', 'test/integration']) {
  for (const name of await fs.readdir(directory)) if (name.endsWith('.mjs')) files.push(`${directory}/${name}`);
}
for (const file of files) {
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) { console.error(checked.stderr); process.exit(checked.status || 1); }
  const text = await fs.readFile(file, 'utf8');
  if (text.includes('\uFFFD')) throw new Error(`Invalid text encoding: ${file}`);
}
const html = await fs.readFile('public/index.html', 'utf8');
if (!html.includes('<script type="module" src="./app.mjs"></script>')) throw new Error('Missing UI module entrypoint');
console.log(`Syntax and UTF-8 checks passed for ${files.length} JavaScript modules.`);
