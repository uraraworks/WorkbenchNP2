import { currentDosPrompt, DOS_DRIVE_ERROR_PATTERN } from './dos-prompt.mjs';

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export async function waitForCurrentDosPrompt(engine, opts = {}) {
  const timeout = opts.timeout ?? 60_000;
  const limit = Date.now() + timeout;
  let screen;
  while (Date.now() < limit) {
    screen = engine.getScreenText();
    opts.onScreen?.(screen);
    if (DOS_DRIVE_ERROR_PATTERN.test(screen.text)) {
      const error = new Error('DOSがドライブ未準備エラーの選択待ちになりました');
      error.code = 'DOS_DRIVE_ERROR';
      error.screen = screen;
      throw error;
    }
    const prompt = currentDosPrompt(screen);
    if (screen.text !== opts.baseline && prompt !== null) return { ...screen, cursorLine: prompt };
    await sleep(100);
  }
  const error = new Error('カーソル位置のDOSプロンプトを待機中にタイムアウトしました');
  error.screen = screen;
  throw error;
}

export async function bootFreeDos(engine, options) {
  const boot = {
    fd1: { file: { name: 'freedos.xdf', bytes: options.freeDos }, sourceKey: options.freeDosKey },
    latencyMs: 40,
    extMemMB: 1,
  };
  if (options.programFd) {
    boot.fd2 = {
      file: { name: options.programName, bytes: options.programFd }, sourceKey: options.programKey,
    };
  }
  await engine.boot(boot);
  return waitForCurrentDosPrompt(engine, { timeout: options.timeout, onScreen: options.onScreen });
}
