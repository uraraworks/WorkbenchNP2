export type ReadMem = (addr: number, len: number) => Uint8Array;
export declare const CONHOOK_VECTOR_ADDR: number;
export declare const CONHOOK_HEADER_OFFSET = 259;
export interface ConhookPoll {
    /** TSR が見つかったか */
    resident: boolean;
    /** 前回から増えたバイト列(失った分は含まれない) */
    bytes: Uint8Array;
    /** 取りこぼしたバイト数(バッファを一周以上された) */
    lost: number;
    /** この呼び出しで初めて見つけた(基準を取っただけで bytes は空) */
    attached: boolean;
}
export declare class ConhookReader {
    private base;
    private last;
    /** ヘッダの物理アドレスと内容を返す。TSR でなければ null。 */
    private header;
    /** TSR が常駐しているかだけを調べる(基準は動かさない)。 */
    isResident(read: ReadMem): boolean;
    poll(read: ReadMem): ConhookPoll;
}
