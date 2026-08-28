#!/usr/bin/env node

// 開発用起動ディスクの生成CLI: 同梱のFreeDOS(98)起動イメージへ HOSTDRV.COM を追加し、
// AUTOEXEC.BAT へ常駐コマンドを追記した「コピー」を作る。原本(fd98_2hd.xdf)は変更しない。
// 本体(addHostdrv)は hostdrv.mjs にある。ここでもう一枚 .xdf を生成してリポジトリへ積む
// 方式は採らない: 原本と同じ1.2MBのベースイメージを重複して持たずに済み、HOSTDRV.COM
// (1KB程度の同梱バイナリ)を唯一のソースとして保てるため。ブラウザ側は
// ide/browser-toolchain.mjs の buildHostdrvBootImage() が同じ addHostdrv() を実行時に呼ぶ。

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addHostdrv } from './hostdrv.mjs';

export { addHostdrv } from './hostdrv.mjs';

const DEFAULT_BASE = fileURLToPath(new URL('../ide/freedos/fd98_2hd.xdf', import.meta.url));
const DEFAULT_HOSTDRV = fileURLToPath(new URL('../ide/freedos/HOSTDRV.COM.bin', import.meta.url));

function usage() {
  console.error('Usage: node build-hostdrv-fd.mjs -o <out.xdf> [--base <base.xdf>] [--hostdrv <HOSTDRV.COM>] [--drive D]');
}

function parseArgs(args) {
  let output; let base = DEFAULT_BASE; let hostdrv = DEFAULT_HOSTDRV; let drive = 'D';
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '-o' || arg === '--base' || arg === '--hostdrv' || arg === '--drive') {
      if (index + 1 >= args.length) throw new Error(`${arg} requires a value`);
      const value = args[++index];
      if (arg === '-o') output = value;
      else if (arg === '--base') base = value;
      else if (arg === '--hostdrv') hostdrv = value;
      else drive = value;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }
  if (!output) throw new Error('-o <out.xdf> is required');
  return { output, base, hostdrv, drive };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage();
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  try {
    const [baseImage, hostdrvCom] = await Promise.all([
      readFile(options.base), readFile(options.hostdrv),
    ]);
    const output = addHostdrv(new Uint8Array(baseImage.buffer, baseImage.byteOffset, baseImage.byteLength),
      new Uint8Array(hostdrvCom.buffer, hostdrvCom.byteOffset, hostdrvCom.byteLength), { drive: options.drive });
    await writeFile(options.output, output);
    console.log(`wrote ${options.output} (HOSTDRV.COM + AUTOEXEC.BAT: HOSTDRV ${options.drive.toUpperCase()})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
