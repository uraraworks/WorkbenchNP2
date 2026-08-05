import { stat } from 'node:fs/promises';
import { DOS_PROMPT_PATTERN } from './dos-prompt.mjs';

export { DOS_PROMPT_PATTERN } from './dos-prompt.mjs';
export const LAUNCHER_ESCAPES = [
  { name: 'NEC コマンドメニュー', pattern: /(?:コマンド[　 ]*メニュー|メニューの終了|Menu v)/, keys: ['F9'] },
  { name: 'ファイラー FD', pattern: /(?:FD Version|by A\.Idei)/i, keys: ['Q', 'Y'] },
];
export const MENU_PATTERN = new RegExp(LAUNCHER_ESCAPES.map((entry) => entry.pattern.source).join('|'), 'i');
export const PROMPT_OR_MENU_PATTERN = new RegExp(`${DOS_PROMPT_PATTERN.source}|${MENU_PATTERN.source}`, 'i');
export const HDD_FD_DRIVE_CANDIDATES = ['B', 'C', 'D', 'E', 'F'];

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export async function externalCase(id, label, envName, imageName) {
  const path = process.env[envName];
  if (!path) return { id, label, envName, skip: `${envName}未指定` };
  try {
    const info = await stat(path);
    if (!info.isFile()) return { id, label, envName, skip: '指定先が通常ファイルではありません' };
    return { id, label, envName, path, imageName, size: info.size, promptTimeout: 300_000 };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { id, label, envName, skip: '指定ファイルが存在しません' };
    }
    throw error;
  }
}

function readScreen(page, harnessName) {
  return page.evaluate((name) => window[name].engine.getScreenText().text, harnessName);
}

export async function waitForText(page, harnessName, pattern, timeout, message) {
  const limit = Date.now() + timeout;
  let lastText = '';
  while (Date.now() < limit) {
    lastText = await readScreen(page, harnessName);
    if (pattern.test(lastText)) return lastText;
    await sleep(200);
  }
  console.error(`[TVRAM DUMP] ${message}\n${lastText}\n[/TVRAM DUMP]`);
  throw new Error(message);
}

/** HDDを単独起動した後、既知ランチャがあればDOSプロンプトまで離脱する。 */
export async function leaveHddLauncher(page, scenario, harnessName) {
  const first = await readScreen(page, harnessName);
  const launcher = LAUNCHER_ESCAPES.find((entry) => entry.pattern.test(first));
  if (launcher && !DOS_PROMPT_PATTERN.test(first)) {
    for (const key of launcher.keys) {
      await page.evaluate(({ name, keyName }) => window[name].engine.sendKeys(keyName),
        { name: harnessName, keyName: key });
      await sleep(500);
    }
    await waitForText(
      page, harnessName, DOS_PROMPT_PATTERN, 60_000,
      `${scenario.label}の${launcher.name}からDOSプロンプトへ抜けられませんでした`,
    );
  }
}

export async function insertProbeFd(page, harnessName) {
  await page.evaluate((name) => window[name].insertProbeFd(), harnessName);
  await sleep(1000);
}

/** E-2互換の一括処理。E-3診断は離脱後の状態を測るため上記2段階を個別に使う。 */
export async function prepareHddForProbe(page, scenario, harnessName) {
  await leaveHddLauncher(page, scenario, harnessName);
  await insertProbeFd(page, harnessName);
}

/** B:〜F:を同じ手順で試し、コールバックが返した最初の成功結果を採用する。 */
export async function findHddProbeDrive(page, scenario, harnessName, attempt) {
  const tried = [];
  for (const letter of HDD_FD_DRIVE_CANDIDATES) {
    const result = await attempt(letter);
    if (result !== null && result !== undefined && result !== false) return { letter, result };
    tried.push(letter);
  }
  const last = await readScreen(page, harnessName);
  console.error(`[TVRAM DUMP] ${scenario.label} ドライブ探索失敗(試行: ${tried.join(', ')})\n${last}\n[/TVRAM DUMP]`);
  throw new Error(`${scenario.label}: プローブFDのドライブレターを特定できませんでした`);
}
