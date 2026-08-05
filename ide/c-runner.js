import { createWebNP2 } from './vendor/webnp2/webnp2-embed.js';
import { bootFreeDos, waitForCurrentDosPrompt } from './freedos-session.mjs';

const engine = createWebNP2(document.querySelector('#screen'));
const api = {
  engine,
  getScreenText: () => engine.getScreenText(),
  isCpuPaused: () => engine.dbgIsPaused(),
  insertProgramFd: (name, bytes) => engine.insertFd(
    1, { name, bytes: new Uint8Array(bytes) }, `c-runner:${name}`,
  ),
  pasteDosCommand: (command) => engine.pasteText(`${command}\r`),
  waitForPrompt: (baseline) => waitForCurrentDosPrompt(engine, { baseline, timeout: 60_000 }),
};

api.ready = (async () => {
  const response = await fetch('./freedos/fd98_2hd.xdf');
  if (!response.ok) throw new Error(`FreeDOS: HTTP ${response.status}`);
  await bootFreeDos(engine, {
    freeDos: new Uint8Array(await response.arrayBuffer()),
    freeDosKey: 'c-runner:freedos',
  });
})();

window.pc98c = api;
