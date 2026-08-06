import { answerDriveErrorRetry, currentDosPrompt, DOS_DRIVE_ERROR_PATTERN } from './dos-prompt.mjs';

export { answerDriveErrorRetry } from './dos-prompt.mjs';

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
/** 上限は無限ループ防止のための保険。厳しくすると稀な連続失敗でそのまま落ちる。 */
const DRIVE_ERROR_RETRY_LIMIT = 8;
const DRIVE_ERROR_RETRY_INTERVAL = 1_000;

export async function waitForCurrentDosPrompt(engine, opts = {}) {
  const timeout = opts.timeout ?? 60_000;
  const limit = Date.now() + timeout;
  const recoverDriveErrors = opts.recoverDriveErrors ?? true;
  let driveErrorRetries = 0;
  let answeredDriveErrorText;
  let nextDriveErrorRetryAt = 0;
  let screen;
  while (Date.now() < limit) {
    screen = engine.getScreenText();
    opts.onScreen?.(screen);
    const prompt = currentDosPrompt(screen);
    if (screen.text !== opts.baseline && prompt !== null) {
      return { ...screen, cursorLine: prompt, driveErrorRetries };
    }
    if (DOS_DRIVE_ERROR_PATTERN.test(screen.text)) {
      // 応答直後も同じTVRAMが一時的に見えるため、同一画面へRを重ねて送らない。
      if (recoverDriveErrors && screen.text === answeredDriveErrorText && Date.now() < nextDriveErrorRetryAt) {
        await sleep(100);
        continue;
      }
      if (!recoverDriveErrors || driveErrorRetries >= DRIVE_ERROR_RETRY_LIMIT) {
        const error = new Error('DOSがドライブ未準備エラーの選択待ちになりました');
        error.code = 'DOS_DRIVE_ERROR';
        error.screen = screen;
        error.driveErrorRetries = driveErrorRetries;
        throw error;
      }
      await answerDriveErrorRetry(engine);
      driveErrorRetries++;
      answeredDriveErrorText = screen.text;
      nextDriveErrorRetryAt = Date.now() + DRIVE_ERROR_RETRY_INTERVAL;
      opts.onDriveErrorRetry?.(driveErrorRetries, screen);
      await sleep(100);
      continue;
    }
    answeredDriveErrorText = undefined;
    nextDriveErrorRetryAt = 0;
    await sleep(100);
  }
  const error = new Error('カーソル位置のDOSプロンプトを待機中にタイムアウトしました');
  error.screen = screen;
  error.driveErrorRetries = driveErrorRetries;
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
