import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compile } from '../compile.mjs';

const require = createRequire(import.meta.url);
const createSmlrpp = require('./smlrpp.js');
const createSmlrc = require('./smlrc.js');
const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const hostSmlrpp = resolve(scriptDir, 'host/smlrpp');
const hostSmlrc = resolve(scriptDir, 'host/smlrc');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameBytes(left, right) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr.trim()
      || `${executable} exited with status ${result.status}`);
  }
}

async function buildHost(source) {
  const dir = await mkdtemp(join(tmpdir(), 'smallerc-host-'));
  await writeFile(join(dir, 'in.c'), source);
  run(hostSmlrpp, ['-zI', '-o', 'out.i', 'in.c'], dir);
  run(hostSmlrc, ['-seg16', 'out.i', 'out.asm'], dir);
  return {
    preprocessed: new Uint8Array(await readFile(join(dir, 'out.i'))),
    output: new Uint8Array(await readFile(join(dir, 'out.asm'))),
  };
}

async function testReusedModules(source, preprocessed) {
  const pp = await createSmlrpp({ print: () => {}, printErr: () => {} });
  const ppOutputs = [];
  for (let index = 0; index < 2; index++) {
    pp.FS.writeFile('/in.c', source);
    const status = pp.callMain(['-zI', '-o', '/out.i', 'in.c']);
    pp._fflush(0);
    if (status !== 0) return { ppReusable: false, compilerReusable: false };
    ppOutputs.push(new Uint8Array(pp.FS.readFile('/out.i')));
  }

  const cc = await createSmlrc({ print: () => {}, printErr: () => {} });
  const statuses = [];
  for (let index = 0; index < 2; index++) {
    cc.FS.writeFile('/out.i', preprocessed);
    statuses.push(cc.callMain(['-seg16', '/out.i', '/out.asm']));
  }
  return {
    ppReusable: sameBytes(ppOutputs[0], ppOutputs[1]),
    compilerReusable: statuses[0] === 0 && statuses[1] === 0,
  };
}

let failed = false;
const source = new Uint8Array(await readFile(new URL('../../samples/minimal.c', import.meta.url)));
const host = await buildHost(source);
const wasmRuns = await Promise.all([compile(source), compile(source), compile(source)]);

if (wasmRuns.some((result) => !result.ok)) {
  console.error('FAIL wasm compile');
  failed = true;
} else {
  const [first, ...rest] = wasmRuns;
  const ppMatches = sameBytes(host.preprocessed, first.preprocessed);
  const asmMatches = sameBytes(host.output, first.output);
  const stable = rest.every((result) => sameBytes(first.preprocessed, result.preprocessed)
    && sameBytes(first.output, result.output));
  console.log(`${ppMatches ? 'PASS' : 'FAIL'} host/wasm smlrpp: ${sha256(first.preprocessed)}`);
  console.log(`${asmMatches ? 'PASS' : 'FAIL'} host/wasm smlrc: ${first.output.byteLength} bytes ${sha256(first.output)}`);
  console.log(`${stable ? 'PASS' : 'FAIL'} fresh-instance repeat: 3 identical runs`);
  failed ||= !ppMatches || !asmMatches || !stable;

  const corrupted = new Uint8Array(first.output);
  corrupted[Math.floor(corrupted.byteLength / 2)] ^= 1;
  const faultDetected = !sameBytes(host.output, corrupted);
  console.log(`${faultDetected ? 'PASS' : 'FAIL'} fault injection: changed wasm output rejected`);
  failed ||= !faultDetected;

  const reused = await testReusedModules(source, first.preprocessed);
  console.log(`INFO reused instance: smlrpp=${reused.ppReusable ? 'stable' : 'unstable'}, smlrc=${reused.compilerReusable ? 'stable' : 'not reusable'}`);
  failed ||= !reused.ppReusable || reused.compilerReusable;
}

const invalid = new TextEncoder().encode('int main(void) {\n  return + ;\n}\n');
const invalidResult = await compile(invalid);
const invalidDetected = !invalidResult.ok && invalidResult.errors.some((error) => error.line === 2);
console.log(`${invalidDetected ? 'PASS' : 'FAIL'} invalid source: line 2 rejected`);
failed ||= !invalidDetected;

const invalidDirective = new TextEncoder().encode('#if 1\nint value;\n');
const directiveResult = await compile(invalidDirective);
const directiveDetected = !directiveResult.ok
  && directiveResult.errors.some((error) => error.stage === 'smlrpp' && error.line === 3);
console.log(`${directiveDetected ? 'PASS' : 'FAIL'} invalid directive: line 3 rejected despite exit 0`);
failed ||= !directiveDetected;

if (failed) process.exitCode = 1;
