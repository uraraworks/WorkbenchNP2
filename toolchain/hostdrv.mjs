// addHostdrv() 本体。Node専用API(node:fs等)を一切importしないブラウザ安全なモジュール。
// ide/browser-toolchain.mjs からそのままfetchしたバイト列を渡して呼べる。
// Node CLIとしての入出力(ファイル読み書き・引数解析)は build-hostdrv-fd.mjs 側に置く。

import { addFiles, readRootFile } from './fdadd.mjs';

const AUTOEXEC_EOF = 0x1a;

function decodeAutoexec(bytes) {
  // DOSテキストのEOFマーカー(0x1A)以降は読み飛ばす。CRLFはそのまま保持する。
  let end = bytes.indexOf(AUTOEXEC_EOF);
  if (end < 0) end = bytes.length;
  return String.fromCharCode(...bytes.subarray(0, end));
}

/**
 * FreeDOS(98)起動イメージのコピーへ HOSTDRV.COM を追加し、AUTOEXEC.BAT の末尾へ
 * `HOSTDRV <drive>` を追記する。既に追記済みなら二重に足さない(冪等)。
 * 入力imageは変更しない。
 * @param {Uint8Array} image
 * @param {Uint8Array} hostdrvCom
 * @param {{drive?: string}} [options]
 * @returns {Uint8Array}
 */
export function addHostdrv(image, hostdrvCom, options = {}) {
  const drive = (options.drive ?? 'D').toUpperCase();
  if (!/^[A-Z]$/.test(drive)) throw new Error(`drive must be a single letter A-Z: ${drive}`);
  if (!(hostdrvCom instanceof Uint8Array) || hostdrvCom.byteLength === 0) {
    throw new TypeError('hostdrvCom must be a non-empty Uint8Array');
  }

  const autoexecBytes = readRootFile(image, 'AUTOEXEC', 'BAT');
  if (!autoexecBytes) throw new Error('AUTOEXEC.BAT not found in base image');
  const command = `HOSTDRV ${drive}`;
  const currentText = decodeAutoexec(autoexecBytes);
  const alreadyPresent = currentText.split(/\r\n|\r|\n/).some((line) => line.trim() === command);
  const newText = alreadyPresent ? currentText : `${currentText.replace(/[\r\n]+$/, '')}\r\n${command}\r\n`;
  const newAutoexec = new Uint8Array(newText.length);
  for (let i = 0; i < newText.length; i++) newAutoexec[i] = newText.charCodeAt(i);

  return addFiles(image, [
    { name: 'HOSTDRV', ext: 'COM', data: hostdrvCom },
    { name: 'AUTOEXEC', ext: 'BAT', data: newAutoexec },
  ]);
}
