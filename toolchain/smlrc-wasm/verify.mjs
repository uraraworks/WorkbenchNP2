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
const createSmlrl = require('./smlrl.js');
const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const hostSmlrpp = resolve(scriptDir, 'host/smlrpp');
const hostSmlrc = resolve(scriptDir, 'host/smlrc');
const hostSmlrl = resolve(scriptDir, 'host/smlrl');

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

const preprocessorArgs = [
  '-U', '__STDC_VERSION__', '-zI', '-D', '_DOS',
  '-D', '__SMALLER_C__', '-D', '__SMALLER_C_16__', '-D', '__SMALLER_C_SCHAR__',
  '-D', '__SMALLER_C_UWCHAR__', '-D', '__SMALLER_C_WCHAR16__', '-D', '__SMALLER_PP__',
];

async function buildHostCompiler(source) {
  const dir = await mkdtemp(join(tmpdir(), 'smallerc-host-'));
  await writeFile(join(dir, 'in.c'), source);
  run(hostSmlrpp, [...preprocessorArgs, '-o', 'out.i', 'in.c'], dir);
  run(hostSmlrc, ['-seg16', 'out.i', 'out.asm'], dir);
  return {
    preprocessed: new Uint8Array(await readFile(join(dir, 'out.i'))),
    assembly: new Uint8Array(await readFile(join(dir, 'out.asm'))),
  };
}

async function linkHost(object, library) {
  const dir = await mkdtemp(join(tmpdir(), 'smallerc-link-'));
  await Promise.all([
    writeFile(join(dir, 'out.o'), object), writeFile(join(dir, 'lcds.a'), library),
  ]);
  run(hostSmlrl, ['-small', 'out.o', 'lcds.a', '-o', 'out.exe'], dir);
  return new Uint8Array(await readFile(join(dir, 'out.exe')));
}

async function testReusedModules(source, preprocessed, linkerCases, library) {
  const pp = await createSmlrpp({ print: () => {}, printErr: () => {} });
  const ppOutputs = [];
  for (let index = 0; index < 2; index++) {
    pp.FS.writeFile('/in.c', source);
    const status = pp.callMain([...preprocessorArgs, '-o', '/out.i', 'in.c']);
    pp._fflush(0);
    if (status !== 0) return { ppReusable: false, compilerReusable: false, linkerReusable: false };
    ppOutputs.push(new Uint8Array(pp.FS.readFile('/out.i')));
  }

  const cc = await createSmlrc({ print: () => {}, printErr: () => {} });
  const compilerStatuses = [];
  for (let index = 0; index < 2; index++) {
    cc.FS.writeFile('/out.i', preprocessed);
    try { compilerStatuses.push(cc.callMain(['-seg16', '/out.i', `/out${index}.asm`])); }
    catch { compilerStatuses.push(1); }
  }

  const ld = await createSmlrl({ print: () => {}, printErr: () => {} });
  ld.FS.writeFile('/lcds.a', library);
  const linkerStatuses = [];
  for (let index = 0; index < 2; index++) {
    ld.FS.writeFile(`/out${index}.o`, linkerCases[index].object);
    try {
      linkerStatuses.push(ld.callMain([
        '-small', `/out${index}.o`, '/lcds.a', '-o', `/out${index}.exe`,
      ]));
    } catch { linkerStatuses.push(1); }
  }
  let linkerOutputsMatchFresh = false;
  if (linkerStatuses.every((status) => status === 0)) {
    linkerOutputsMatchFresh = linkerCases.every((testCase, index) => (
      sameBytes(ld.FS.readFile(`/out${index}.exe`), testCase.output)
    ));
  }
  return {
    ppReusable: sameBytes(ppOutputs[0], ppOutputs[1]),
    compilerReusable: compilerStatuses.every((status) => status === 0),
    linkerReusable: linkerOutputsMatchFresh,
  };
}

let failed = false;
const [source, library] = await Promise.all([
  readFile(new URL('../../samples/minimal.c', import.meta.url)), readFile(new URL('./lcds.a', import.meta.url)),
]);
const upstreamCompiler = await readFile(new URL('../smallerc-src/v0100/smlrc.c', import.meta.url), 'utf8');
const sourceBytes = new Uint8Array(source);
const libraryBytes = new Uint8Array(library);
const hostCompiler = await buildHostCompiler(sourceBytes);
const wasmRuns = await Promise.all([
  compile(sourceBytes, { library: libraryBytes }),
  compile(sourceBytes, { library: libraryBytes }),
  compile(sourceBytes, { library: libraryBytes }),
]);

if (wasmRuns.some((result) => !result.ok)) {
  console.error('FAIL wasm compile/link');
  failed = true;
} else {
  const [first, ...rest] = wasmRuns;
  const hostExe = await linkHost(first.object, libraryBytes);
  const checks = [
    ['host/wasm smlrpp', sameBytes(hostCompiler.preprocessed, first.preprocessed), first.preprocessed],
    ['host/wasm smlrc', sameBytes(hostCompiler.assembly, first.assembly), first.assembly],
    ['host/wasm smlrl', sameBytes(hostExe, first.output), first.output],
  ];
  for (const [name, passed, bytes] of checks) {
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${bytes.byteLength} bytes ${sha256(bytes)}`);
    failed ||= !passed;
  }
  const stable = rest.every((result) => sameBytes(first.preprocessed, result.preprocessed)
    && sameBytes(first.assembly, result.assembly) && sameBytes(first.object, result.object)
    && sameBytes(first.output, result.output));
  console.log(`${stable ? 'PASS' : 'FAIL'} fresh-instance repeat: 3 identical four-stage runs`);
  failed ||= !stable;

  const marker = new TextDecoder().decode(first.assembly).includes('; @pc98dev-c-line\t');
  const patchNecessary = marker && !upstreamCompiler.includes('@pc98dev-c-line');
  console.log(`${patchNecessary ? 'PASS' : 'FAIL'} line-comment patch: patched output has marker, pinned upstream has none`);
  failed ||= !patchNecessary;

  const corrupted = new Uint8Array(first.output);
  corrupted[Math.floor(corrupted.byteLength / 2)] ^= 1;
  const faultDetected = !sameBytes(hostExe, corrupted);
  console.log(`${faultDetected ? 'PASS' : 'FAIL'} fault injection: changed linked output rejected`);
  failed ||= !faultDetected;

  const variantSource = new TextEncoder().encode('int main(void) { return 9; }\n');
  const variant = await compile(variantSource, { library: libraryBytes });
  if (!variant.ok) throw new Error('smlrl reuse variant could not be built');
  const reused = await testReusedModules(sourceBytes, first.preprocessed, [first, variant], libraryBytes);
  console.log(`INFO reused instance: smlrpp=${reused.ppReusable ? 'stable' : 'unstable'}, `
    + `smlrc=${reused.compilerReusable ? 'stable' : 'not reusable'}, `
    + `smlrl=${reused.linkerReusable ? 'stable' : 'not reusable'}`);
  failed ||= !reused.ppReusable || reused.compilerReusable || reused.linkerReusable;
}

const invalid = new TextEncoder().encode('int main(void) {\n  return + ;\n}\n');
const invalidResult = await compile(invalid, { library: libraryBytes });
const invalidDetected = !invalidResult.ok && invalidResult.errors.some((error) => error.line === 2);
console.log(`${invalidDetected ? 'PASS' : 'FAIL'} invalid source: line 2 rejected`);
failed ||= !invalidDetected;

const invalidDirective = new TextEncoder().encode('#if 1\nint value;\n');
const directiveResult = await compile(invalidDirective, { library: libraryBytes });
const directiveDetected = !directiveResult.ok
  && directiveResult.errors.some((error) => error.stage === 'smlrpp' && error.line === 3);
console.log(`${directiveDetected ? 'PASS' : 'FAIL'} invalid directive: line 3 rejected despite exit 0`);
failed ||= !directiveDetected;

if (failed) process.exitCode = 1;
