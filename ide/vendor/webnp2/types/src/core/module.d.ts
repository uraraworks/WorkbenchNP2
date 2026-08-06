export interface DiskFile {
    name: string;
    bytes: Uint8Array;
}
export interface BootConfig {
    hdd?: DiskFile;
    fds: DiskFile[];
    latencyMs?: number;
    /** 拡張メモリ容量(MB)。本体メモリ640KBに加算される。省略時は1MB(DOS標準構成)。 */
    extMemMB?: number;
    /** CPUクロック倍率。1〜32の整数にクランプして clk_mult= として出力する。省略時はコア既定値。 */
    clkMult?: number;
    /** ユーザー登録済みのROM/素材ファイル。preRunでMEMFSのルート直下(/名前)へ注入する。 */
    roms?: DiskFile[];
}
export interface EmscriptenFS {
    writeFile(path: string, data: Uint8Array | string): void;
    readFile(path: string, opts?: {
        encoding?: 'binary' | 'utf8';
    }): Uint8Array;
    mkdir(path: string): void;
    createPreloadedFile(parent: string, name: string, url: string, canRead: boolean, canWrite: boolean): void;
    analyzePath(path: string): {
        exists: boolean;
    };
    stat(path: string): {
        mtime: Date | number;
        size: number;
    };
}
export type CCallType = 'number' | 'string' | 'array' | 'boolean' | null;
export type CCallFn = (ident: string, returnType: CCallType, argTypes: CCallType[], args: unknown[]) => unknown;
interface EmscriptenSDL2 {
    audioContext?: AudioContext;
}
interface EmscriptenModule {
    canvas?: HTMLCanvasElement;
    preRun?: Array<() => void>;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
    locateFile?: (path: string) => string;
    arguments?: string[];
    onRuntimeInitialized?: () => void;
    FS?: EmscriptenFS;
    ccall?: CCallFn;
    onAbort?: (what: unknown) => void;
    SDL2?: EmscriptenSDL2;
    HEAPU8?: Uint8Array;
    HEAPU32?: Uint32Array;
}
declare global {
    interface Window {
        Module?: EmscriptenModule;
        FS?: EmscriptenFS;
        ccall?: CCallFn;
        SDL2?: EmscriptenSDL2;
        HEAPU8?: Uint8Array;
        HEAPU32?: Uint32Array;
    }
}
/**
 * SDL2ポートが保持するAudioContextを取得する。
 * emnp21kai_sdl2.js内では `Module["SDL2"] = Module["SDL2"] || {}` として遅延生成され、
 * `var SDL2 = Module["SDL2"]` は関数スコープのローカル変数なのでグローバル `window.SDL2` には
 * 出てこない。念のため window.SDL2 もフォールバックとして見ておく。
 */
export declare function resolveAudioContext(): AudioContext | undefined;
/** 現在起動中かどうか。二重boot防止に使う。 */
export declare function isBooted(): boolean;
/**
 * NP2kai-wasm コアを起動する。
 * 二重起動はエラーにする（ページ全体をリロードして呼び直すこと）。
 */
export declare function boot(config: BootConfig, canvas: HTMLCanvasElement): Promise<EmscriptenFS>;
/** MEMFS 上のディスクイメージを読み出す。 */
export declare function readDiskFile(fs: EmscriptenFS, name: string): Uint8Array;
/**
 * MEMFS 上のディスクイメージの mtime/size を取得する(取得できなければ null)。
 * MEMFS は書き込みでノードの timestamp を更新するため、フルコピー無しの変更検知に使える。
 */
export declare function statDiskFile(fs: EmscriptenFS, name: string): {
    mtimeMs: number;
    size: number;
} | null;
/** マシンリセット (pccore_cfgupdate + pccore_reset)。 */
export declare function coreReset(): void;
/** バスマウスのキャプチャをトグルする。戻り値は新しい状態(1=キャプチャ中)。
 *  キャプチャ開始はブラウザのpointer lock要求になるため、ユーザー操作
 *  (クリックハンドラ等)の中から同期的に呼ぶこと。 */
export declare function coreMouseToggle(): number;
/** 現在のマウスキャプチャ状態(1=キャプチャ中)。 */
export declare function coreMouseCaptured(): number;
/** 実行中のFDドライブへイメージを挿抜する。path='' で排出。drive は 0..3。 */
export declare function coreSetFdd(drive: number, path: string): void;
/**
 * FDドライブが読み書きできる状態かを返す(0なら挿入遅延中)。drive は 0..3。
 *
 * coreSetFdd() の直後は NP2kai 側で 20 フレーム(約0.4秒)の挿入遅延が入り、その間
 * FDC は Not Ready を返す。この遅延は **エミュレート1フレームごと** に減るため、
 * 実時間で待っても足りるとは限らない(ポーズ中・スロットル中は特に)。挿入後すぐ
 * アクセスする側は setTimeout ではなくこれで準備完了を待つこと。
 */
export declare function coreFddReady(drive: number): number;
/** MEMFS 上の path へステートセーブする。戻り値は statsave.c の仕様に準じる。 */
export declare function coreStatSave(path: string): number;
/** MEMFS 上の path からステートロードする。戻り値は statsave.c の仕様に準じる。 */
export declare function coreStatLoad(path: string): number;
/** バスマウスの相対移動を累積させる。 */
export declare function coreMouseMove(dx: number, dy: number): void;
/** バスマウスの未消費の移動量(max(|x|,|y|))を取得する。ゲストがポーリングで吸い出すと減る。 */
export declare function coreMousePending(): number;
/** バスマウスのボタン状態を送る。button: 0=左/1=右、down=1で押下。 */
export declare function coreMouseButton(button: number, down: number): void;
/** PC-98スキャンコードを注入する。down=true でmake、false でbreak。 */
export declare function coreKey(code: number, down: boolean): void;
/** AudioWorklet外部音声経路の有効/無効。有効中はコアのSDLコールバックが無音を返す。 */
export declare function coreAudioExternal(enable: boolean): void;
/** コアのサンプリングレート(Hz)。JS側AudioContextはこのレートで作る。 */
export declare function coreAudioRate(): number;
/** 1回のrenderで得られるフレーム数(ステレオ1組=1フレーム)。0なら音声未初期化。 */
export declare function coreAudioChunkFrames(): number;
/**
 * コアのミックスを1チャンク吸い出して dst (chunkFrames*2 の Float32Array) へ
 * -1.0〜1.0 に正規化して書き込む。sound_pcmlock/unlock が1サイクル固定量消費のため、
 * dst は必ず coreAudioChunkFrames() ちょうどのフレーム数で渡すこと。
 */
export declare function coreAudioRenderInto(dst: Float32Array): boolean;
/**
 * PC-98キーボードBIOSリングバッファへ1エントリ(上位scan=0, 下位=SJISバイト等)を直接積む。
 * ゲスト側FEP無しで全角文字を入力するためのホスト側テキスト送信機能で使う。
 * 戻り値は 1=積めた/0=バッファ満杯。
 */
export declare function corePushKeyBuffer(entry: number): number;
/** SJIS 2バイト文字をアトミックに2エントリ積む。戻り値は 1=積めた/0=空きが2未満。 */
export declare function corePushKeyBufferPair(e1: number, e2: number): number;
/**
 * ゲスト常駐TSR(PASTE.COM)のメールボックス線形アドレスを取得する。
 * TSRが常駐していなければ -1。
 */
export declare function coreFindMailbox(): number;
/** メールボックスのリングバッファ空き(最大255)を取得する。 */
export declare function coreMailboxSpace(addr: number): number;
/** メールボックスへ1バイト書き込む。戻り値は 1=成功/0=満杯。 */
export declare function coreMailboxPut(addr: number, byte: number): number;
/** メールボックスの行書き込み中フラグを設定する(1=書き込み中)。 */
export declare function coreMailboxPending(addr: number, pending: number): void;
/**
 * テキスト画面(TVRAM)バッファのスナップショットを取得する。
 * レイアウトは webnp2_read_tvram()/webnp2_tvram_size() の仕様に準じる
 * (リトルエンディアン: [0]=cols, [1]=rows, [2..3]=カーソルセル番号int16, [4..]=セル配列)。
 * wasmメモリから独立したコピーを返すので、呼び出し後にコア側が書き換えても影響しない。
 */
export declare function coreReadTvram(): Uint8Array;
/** ドライブアクセスカウンタの並び。webnp2api.c の s_diskaccess と対応する。 */
export interface DiskAccessCounters {
    /** FDD1..FDD4 のアクセス回数(累積)。 */
    fdd: number[];
    /** HDD(全ドライブ合算)のアクセス回数(累積)。 */
    hdd: number;
}
/**
 * ドライブアクセスカウンタを読む。コアは read/write/readid/writeid のたびに
 * 該当ドライブのカウンタを進めるだけなので、呼び出し側は前回値との差分で
 * 「アクセスがあったか」を判定する(アクセスランプ用)。
 * コア未起動時など読めない場合は undefined を返す。
 */
export declare function coreDiskAccess(): DiskAccessCounters | undefined;
/**
 * デバッグ/解析用。PC-98メインRAM(webnp2_mem_ptr()/webnp2_mem_size())から
 * [addr, addr+len) の範囲を読み出す。範囲外を指定した場合はErrorを投げる。
 * wasmメモリから独立したコピーを返すので、呼び出し後にコア側が書き換えても影響しない。
 */
export declare function coreReadMemory(addr: number, len: number): Uint8Array;
/**
 * デバッグ用にPC-98メインRAMへ書き込む。webnp2_mem_ptr()はwasmヒープ内の
 * 実RAM先頭を返すため、HEAPU8の対応範囲へコピーすればゲストから即座に見える。
 * CPU状態との競合を避ける責任は呼出側にあり、通常はpause中に使用する。
 */
export declare function coreWriteMemory(addr: number, bytes: Uint8Array): void;
/** デバッガの一時停止状態を設定する。 */
export declare function coreDbgSetPaused(paused: boolean): void;
/** デバッガの一時停止状態を返す。 */
export declare function coreDbgPaused(): number;
/** 一時停止中にcount命令だけ実行し、実際の実行数を返す。 */
export declare function coreDbgStep(count: number): number;
/** デバッガレジスタ配列をwasmメモリから独立したコピーとして返す。 */
export declare function coreDbgReadRegs(): Uint32Array;
/** 逆アセンブル結果のNUL終端UTF-8文字列を静的バッファからコピーする。 */
export declare function coreDbgDisasm(seg: number, off: number, count: number): string;
/** ソフトウェアブレークポイントを設定する。indexは0..7。 */
export declare function coreDbgSetBreakpoint(index: number, seg: number, off: number, enabled: boolean): void;
/** 最大maxSteps命令を実行し、ヒットしたブレークポイントindex（無ヒットは-1）を返す。 */
export declare function coreDbgRunUntilBreakpoint(maxSteps: number): number;
export {};
