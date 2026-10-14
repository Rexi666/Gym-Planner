// Compile isolated modules into a temporary folder and test against a fake client.
// These are unit tests, NOT tests against a real Supabase project.
import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-planner-tests-'));
try {
  for (const name of ['domain', 'store']) {
    const input = fs.readFileSync(path.join(root, 'src', name + '.ts'), 'utf8');
    const out = ts.transpileModule(input, { fileName: name + '.ts', reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    if (out.diagnostics?.length) throw new Error('Transpilation failed');
    fs.writeFileSync(path.join(temp, name + '.mjs'), out.outputText.replace("'./client'", "'./client.mjs'").replace("'./domain'", "'./domain.mjs'"));
  }
  fs.writeFileSync(path.join(temp, 'client.mjs'), 'export const supabase = { rpc: async () => ({data:1,error:null}) };');
  fs.copyFileSync(path.join(root, 'tests', 'store.mock.test.mjs'), path.join(temp, 'store.test.mjs'));
  const result = spawnSync(process.execPath, ['--test', path.join(temp, 'store.test.mjs')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
