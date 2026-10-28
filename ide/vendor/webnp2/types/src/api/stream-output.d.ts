import type { ScreenEvent } from './screen-diff.ts';
export declare class StreamOutputParser {
    private cells;
    private col;
    private lead;
    private esc;
    private csi;
    private takeover;
    private sawPrintable;
    private skipToLf;
    private lastPending;
    private lineRow;
    private maxRow;
    private evs;
    private linesThisPush;
    /** 現在の入力行の内容を与える(screen 方式から stream 方式へ切り替える時に使う)。 */
    seed(text: string): void;
    /** バイト列を流し込み、確定した行・入力中の行などをイベントで返す。 */
    push(bytes: ArrayLike<number>): ScreenEvent[];
    /** バイト列の途中を失った。 */
    gap(): ScreenEvent[];
    private lineText;
    private flushPending;
    private put;
    private newline;
    private enterTakeover;
    private doClear;
    private feed;
    private feedEsc;
    private csiFinal;
}
