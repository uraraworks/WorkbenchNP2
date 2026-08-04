/** 名前付きキー(修飾キー・特殊キー・ファンクションキー等)のスキャンコード表。 */
export declare const NAMED_KEYS: Record<string, number>;
/**
 * ASCII文字からPC-98配列での打鍵情報(スキャンコード + shift要否)を返す。
 * マッチしなければ undefined。
 */
export declare function charToKey(ch: string): {
    code: number;
    shift: boolean;
} | undefined;
