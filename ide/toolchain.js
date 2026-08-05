import { parseListing } from '../toolchain/listing.mjs';
import { makeFd } from '../toolchain/makefd.mjs';
import { normalizeDosTextSource } from '../toolchain/dos-text.mjs';

function decodeListing(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** ブラウザでも1アセンブルごとに新しいNASMインスタンスを生成する。 */
async function assembleFile(url, listing = false) {
  const sourceResponse = await fetch(url);
  if (!sourceResponse.ok) throw new Error(`${url}: HTTP ${sourceResponse.status}`);
  const sourceBytes = new Uint8Array(await sourceResponse.arrayBuffer());
  const normalized = normalizeDosTextSource(sourceBytes);
  const sourceText = new TextDecoder('utf-8').decode(normalized.source);
  const createNasm = window.createNasm;
  if (typeof createNasm !== 'function') throw new Error('wasm NASMがロードされていません');
  const errors = [];
  const module = await createNasm({
    print: () => {},
    printErr: (line) => errors.push(String(line)),
    locateFile: (name) => new URL(`../toolchain/nasm-wasm/${name}`, location.href).href,
  });
  module.FS.writeFile('/in.asm', normalized.source);
  const args = ['-f', 'bin'];
  if (listing) args.push('-l', '/out.lst');
  args.push('-o', '/out.bin', '/in.asm');
  const exitCode = module.callMain(args) ?? 0;
  if (exitCode !== 0) throw new Error(errors.join('\n') || `NASM exited with status ${exitCode}`);
  const output = new Uint8Array(module.FS.readFile('/out.bin'));
  const sourceNormalization = { dosEofBytesRemoved: normalized.dosEofBytesRemoved };
  if (!listing) return { sourceText, output, sourceNormalization };
  const listingText = decodeListing(new Uint8Array(module.FS.readFile('/out.lst')));
  return { sourceText, output, map: parseListing(listingText, output), sourceNormalization };
}

export function assembleHello() {
  return assembleFile('../samples/hello.asm', true);
}

export function assembleDebugLoader() {
  return assembleFile('./debug-loader.asm');
}

export function assembleSecondRun() {
  return assembleFile('../samples/second-run.asm');
}

export function makeProgramFd(output, loader, secondRun) {
  return makeFd([
    { name: 'E0LOAD', ext: 'COM', data: loader },
    { name: 'TARGET', ext: 'COM', data: output },
    { name: 'SECOND', ext: 'COM', data: secondRun },
  ]);
}
