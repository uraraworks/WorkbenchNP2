import assert from 'node:assert/strict';
import { pspFromLoadedSegment, segment16 } from './segment-arithmetic.mjs';

function word(value) {
  return Number.parseInt(value, 16);
}

export function parseExecLoadScreen(screen) {
  const target = screen.match(/E2 TARGET=([^\r\n]+)/i);
  const headerError = screen.match(/E2 HEADER ERROR AX=([0-9A-F]{4})/i);
  const execError = screen.match(/E0 4B01 ERROR AX=([0-9A-F]{4})/i);
  const loaded = screen.match(
    /E0 4B01 OK CS:IP=([0-9A-F]{4}):([0-9A-F]{4}) SS:SP=([0-9A-F]{4}):([0-9A-F]{4})/i,
  );
  const mz = screen.match(
    /E2 MZ20 SS=([0-9A-F]{4}) SP=([0-9A-F]{4}) IP=([0-9A-F]{4}) CS=([0-9A-F]{4})/i,
  );
  return {
    target: target?.[1].trim(),
    headerError: headerError?.[1].toUpperCase(),
    execError: execError?.[1].toUpperCase(),
    loaded: loaded && {
      cs: word(loaded[1]), ip: word(loaded[2]), ss: word(loaded[3]), sp: word(loaded[4]),
    },
    mz: mz && { ss: word(mz[1]), sp: word(mz[2]), ip: word(mz[3]), cs: word(mz[4]) },
  };
}

/**
 * ゲストが対象ファイルから独立に読んだMZヘッダと、DOS 4B01h返却値を照合する。
 * pspPrefixはホストがエミュレータRAMから直接読んだPSP先頭バイトである。
 */
export function validateMzExecLoad(screen, pspPrefix, expectedTarget, expectedHeader, stackTop) {
  const result = parseExecLoadScreen(screen);
  assert.equal(result.headerError, undefined, `対象のMZヘッダを読めませんでした AX=${result.headerError}`);
  assert.equal(result.target?.toUpperCase(), expectedTarget.toUpperCase(), 'ローダが開いた対象パスが不一致です');
  assert.ok(result.mz, '対象から20hバイト読んだMZヘッダ値が表示されていません');
  if (expectedHeader) {
    assert.deepEqual(result.mz, expectedHeader, 'ローダ表示のMZヘッダ値がホスト側の事前読取り値と一致しません');
  }

  if (result.execError) {
    assert.equal(result.execError, '0008', `4B01hがメモリ不足以外で失敗しました AX=${result.execError}`);
    return { kind: 'memory-error', errorAx: result.execError, header: result.mz };
  }

  assert.ok(result.loaded, '4B01h成功時のCS:IP / SS:SPが表示されていません');
  assert.equal(result.loaded.ip, result.mz.ip, '4B01hのIPがMZ e_ipと一致しません');
  // DOSは子のスタックへゼロワードを1つ積んでから返すため、返却SPはe_spちょうどではなく
  // 必ず2小さい(.COMでも規定のFFFEhに対しFFFChが返る)。定数2を根拠なく引かないよう、
  // 積まれた値が0000であること自体をstackTopで検証する。
  assert.equal(result.loaded.sp, segment16(result.mz.sp - 2), '4B01hのSPがMZ e_sp-2と一致しません');
  assert.deepEqual(Array.from(stackTop ?? []), [0x00, 0x00], 'SS:SPに積まれているワードが0000ではありません');

  const pspFromCs = pspFromLoadedSegment(result.loaded.cs, result.mz.cs);
  const pspFromSs = pspFromLoadedSegment(result.loaded.ss, result.mz.ss);
  assert.ok(pspFromCs >= 0x0050 && pspFromCs < 0xA000, `CSから求めたPSPが不正です: ${pspFromCs}`);
  assert.equal(pspFromSs, pspFromCs, 'CS/e_csとSS/e_ssから求めたPSPが一致しません');
  assert.deepEqual(Array.from(pspPrefix), [0xCD, 0x20], '算出PSP先頭にINT 20hがありません');
  return { kind: 'loaded', psp: pspFromCs, header: result.mz, loaded: result.loaded };
}
