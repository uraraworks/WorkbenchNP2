export type CursorPos = {
    row: number;
    col: number;
} | null;
export type ScreenEvent = {
    type: 'line';
    text: string;
} | {
    type: 'pending';
    text: string;
} | {
    type: 'clear';
} | {
    type: 'takeover';
} | {
    type: 'gap';
};
export declare function diffScreens(prevLines: string[] | null, prevCursor: CursorPos, nextLinesRaw: string[], nextCursor: CursorPos): ScreenEvent[];
/**
 * 最下行が「ファンクションキー表示行」のように固定表示されている画面かを判定する。
 * 実機(FreeDOS(98))では最下行(row 24)に常時 "C1 CU CA S1 SU ..." が出ており、
 * これを入力行と取り違えると実効カーソルが常に最下行になり全てが壊れる。
 * 判定: 最下行が非空で、カーソルが表示されていて最下行より上にある。
 * (カーソルが最下行に来るアプリはこの条件に当たらない。一度立ったら呼び出し側で保持する)
 * 戻り値は無視すべき下端の行数(0 か 1)。
 */
export declare function detectStatusRows(lines: string[], cursor: CursorPos): number;
/** 下端 statusRows 行を取り除いた画面を返す(カーソルが範囲外なら null 扱い)。 */
export declare function stripStatusRows(lines: string[], cursor: CursorPos, statusRows: number): {
    lines: string[];
    cursor: CursorPos;
};
/**
 * ポーリング1回ぶんの画面を受け取りイベントを返す、状態つきの薄いラッパ。
 * - 最下行の固定表示(ファンクションキー行)を検出して除外する
 * - 「ゲストがスクロール中に読んだ」画面(行の一部だけ古い)で誤って gap/takeover を出さないよう、
 *   同じ画面が2回続けて読めてから処理する(最大 maxHold 回まで待ち、それでも落ち着かなければ処理する)
 */
export declare class ScreenOutputTracker {
    private readonly maxHold;
    private prev;
    private prevKey;
    private candidate;
    private held;
    private statusRows;
    private inTakeover;
    constructor(maxHold?: number);
    push(lines: string[], cursor: CursorPos): ScreenEvent[];
    private commit;
}
