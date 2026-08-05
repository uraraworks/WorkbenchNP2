import { createWebNP2 } from './vendor/webnp2/webnp2-embed.js';
import { bootFreeDos, waitForCurrentDosPrompt } from './freedos-session.mjs';

const engine = createWebNP2(document.querySelector('#screen'));
let freeDos;
const api = {
  engine,
  getScreenText: () => engine.getScreenText(),
  getMountedImages: () => engine.getMountedImages(),
  isCpuPaused: () => engine.dbgIsPaused(),
  bootWithProgramFd: async (name, bytes) => {
    await api.ready;
    return bootFreeDos(engine, {
      freeDos, freeDosKey: 'c-runner:freedos',
      programFd: new Uint8Array(bytes), programName: name, programKey: `c-runner:${name}`,
    });
  },
  pasteDosCommand: (command) => engine.pasteText(`${command}\r`),
  waitForPrompt: (baseline) => waitForCurrentDosPrompt(engine, { baseline, timeout: 60_000 }),
};

api.ready = (async () => {
  const response = await fetch('./freedos/fd98_2hd.xdf');
  if (!response.ok) throw new Error(`FreeDOS: HTTP ${response.status}`);
  freeDos = new Uint8Array(await response.arrayBuffer());
})();

window.pc98c = api;
