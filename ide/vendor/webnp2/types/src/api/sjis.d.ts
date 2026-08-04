export interface EncodeSjisResult {
    bytes: number[];
    skipped: string[];
}
export interface EncodeSjisUnitsResult {
    /** 1要素=1文字分のバイト列(1バイトまたはSJISペアの2バイト)。ペアは分断せずに積むこと。 */
    units: number[][];
    skipped: string[];
}
/**
 * 文字列をPC-98キーボードBIOSリングバッファへ積むためのバイト列(1バイト=1エントリ)に変換する。
 * - '\n'/'\r' は 0x0D (Enter) に変換する。連続する "\r\n" は1つの0x0Dにまとめる。
 * - ASCII 0x20-0x7E はそのまま1バイト。
 * - 半角カナ (U+FF61-U+FF9F) は 0xA1-0xDF。
 * - それ以外は SJIS 2バイトへのリバースマップ検索。見つからない文字は skipped に集めてスキップする。
 */
export declare function encodeSjis(text: string): EncodeSjisResult;
/**
 * encodeSjis の文字単位版。SJIS 2バイト文字はキーバッファへアトミックに積む必要が
 * あるため(先行バイトだけ先にゲストへ消費されるとDBCSペアが崩れて化ける)、
 * 呼び出し側はユニット単位で webnp2_push_key_buffer(_pair) を使い分ける。
 */
export declare function encodeSjisUnits(text: string): EncodeSjisUnitsResult;
