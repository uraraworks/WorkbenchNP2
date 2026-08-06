import { normalizeDosTextSource } from '../toolchain/dos-text.mjs';

/** ブラウザでも1アセンブルごとに新しいNASMインスタンスを生成する。 */
async function assembleFile(url) {
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
  args.push('-o', '/out.bin', '/in.asm');
  const exitCode = module.callMain(args) ?? 0;
  if (exitCode !== 0) throw new Error(errors.join('\n') || `NASM exited with status ${exitCode}`);
  const output = new Uint8Array(module.FS.readFile('/out.bin'));
  const sourceNormalization = { dosEofBytesRemoved: normalized.dosEofBytesRemoved };
  return { sourceText, output, sourceNormalization };
}

export function assembleDebugLoader() {
  return assembleFile('./debug-loader.asm');
}
