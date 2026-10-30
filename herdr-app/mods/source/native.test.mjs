import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('native GPUI renders loaded panel, picker, split/unified diff, and discard controls', async t => {
  try { await exec('herdr-app', ['--version']); }
  catch (error) { if (error.code === 'ENOENT') { t.skip('herdr-app is not installed'); return; } throw error; }
  const root = await mkdtemp(join(tmpdir(), 'herdr-source-native-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of await readdir(new URL('./', import.meta.url))) {
    if (file.endsWith('.js') || file === 'mod.json') await copyFile(new URL(file, import.meta.url), join(root, file));
  }
  const repo = { root, gitDir: join(root, '.git'), key: root, name: 'merchant-service-with-long-name', on: null };
  const patch = '@@ -1,2 +1,3 @@\n unchanged\n-old\n+new\n+added\n';
  const cases = {
    panel: `const controller = new Panel(); controller.init({}, cx); const entry = { repo, data: { files: [{path:'src/payments/authorize.ts'}], staged: [{path:'src/payments/authorize.ts',status:'M'}], unstaged: [{path:'src/payments/authorize.ts',status:'M'}], conflicts: [], branch:'feature/a-long-payment-branch', upstream:'origin/main', ahead:2, behind:1 }, input: InputState.new({value:'Commit message'}), epoch:0 }; this.renderContent = () => controller.repository(entry);`,
    picker: `const controller = new Picker(); controller.init({cwd:repo.root,selected:[repo],name:'Payment retries',on:null},cx); controller.loading = false; this.renderContent = () => controller.render();`,
    split: `const controller = new Diff(); controller.init({repo,path:'payment.txt',group:'unstaged'},cx); controller.rows = diffRows(${JSON.stringify(patch)}); controller.loading = false; this.renderContent = () => controller.render(cx);`,
    unified: `const controller = new Diff(); controller.init({repo,path:'payment.txt',group:'staged'},cx); controller.rows = diffRows(${JSON.stringify(patch)}); controller.mode = 'unified'; controller.loading = false; this.renderContent = () => controller.render(cx);`,
    discard: `const controller = new Discard(); controller.init({repo,path:'payment.txt'},cx); controller.loading = false; controller.snapshot = {untracked:false,fingerprint:'fixture'}; this.renderContent = () => controller.render();`,
  };
  for (const [name, setup] of Object.entries(cases)) {
    await writeFile(join(root, 'main.js'), `import { View } from 'gpui-kit';\nimport { InputState } from 'gpui-base';\nimport Panel from './panel.js';\nimport { Picker, Diff, Discard } from './dialogs.js';\nimport { diffRows } from './diff.js';\nconst repo=${JSON.stringify(repo)};\nexport default class Fixture extends View { init(_props,cx) { ${setup} } render(cx) { return this.renderContent(cx); } }\n`);
    const result = await exec('herdr-app', ['check', root]);
    assert.match(result.stdout, /check passed/, `${name}: ${result.stdout}`);
  }
});
