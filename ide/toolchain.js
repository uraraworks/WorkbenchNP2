import { parseListing } from '../toolchain/listing.mjs';
import { makeFd } from '../toolchain/makefd.mjs';

function decodeListing(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}

/** ブラウザでも1アセンブルごとに新しいNASMインスタンスを生成する。 */
export async function assembleHello() {
  const sourceResponse = await fetch('../samples/hello.asm');
  if (!sourceResponse.ok) throw new Error(`hello.asm: HTTP ${sourceResponse.status}`);
  const sourceBytes = new Uint8Array(await sourceResponse.arrayBuffer());
  const sourceText = new TextDecoder('utf-8').decode(sourceBytes);
  const createNasm = window.createNasm;
  if (typeof createNasm !== 'function') throw new Error('wasm NASMがロードされていません');
  const errors = [];
  const module = await createNasm({
    print: () => {},
    printErr: (line) => errors.push(String(line)),
    locateFile: (name) => new URL(`../toolchain/nasm-wasm/${name}`, location.href).href,
  });
  module.FS.writeFile('/in.asm', sourceBytes);
  const exitCode = module.callMain([
    '-f', 'bin', '-DPC98DEV_IDE=1', '-l', '/out.lst', '-o', '/out.bin', '/in.asm',
  ]) ?? 0;
  if (exitCode !== 0) throw new Error(errors.join('\n') || `NASM exited with status ${exitCode}`);
  const output = new Uint8Array(module.FS.readFile('/out.bin'));
  const listing = decodeListing(new Uint8Array(module.FS.readFile('/out.lst')));
  return { sourceText, output, map: parseListing(listing, output) };
}

export function makeProgramFd(output) {
  return makeFd([{ name: 'HELLO', ext: 'COM', data: output }]);
}
