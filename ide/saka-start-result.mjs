import assert from 'node:assert/strict';

const DOS_ERROR = /(?:Bad command|File not found|Not enough memory|Program too big|Cannot execute)/i;

/** canvasのカーソル点滅だけを起動成功と誤認せず、GVRAMへの実描画を要求する。 */
export function validateSakaVisualStart(entryState, runningState) {
  assert.ok(entryState?.gvram?.sha256, 'エントリ停止時のGVRAMハッシュがありません');
  assert.ok(runningState?.gvram?.sha256, '実行後のGVRAMハッシュがありません');
  assert.notEqual(runningState.gvram.sha256, entryState.gvram.sha256,
    '実行後もGVRAMが変化していません');
  assert.ok(runningState.gvram.nonzero > 0, '実行後GVRAMに描画済み画素がありません');
  assert.doesNotMatch(runningState.screen ?? '', DOS_ERROR, 'DOSエラー画面を起動成功と判定しました');
  return {
    before: entryState.gvram.sha256,
    after: runningState.gvram.sha256,
    nonzero: runningState.gvram.nonzero,
    canvasChanged: entryState.canvas?.sha256 !== runningState.canvas?.sha256,
  };
}
