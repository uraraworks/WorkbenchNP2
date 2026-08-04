import { type DiskFile, type EmscriptenFS } from '../core/module.ts';
import { type FatEntry } from './fat.ts';
export type DiskSlot = 'hdd' | 'fd1' | 'fd2';
/** ia32デバッガが公開するCPUレジスタ。セグメントレジスタもUINT32として返す。 */
export interface Registers {
    eax: number;
    ecx: number;
    edx: number;
    ebx: number;
    esp: number;
    ebp: number;
    esi: number;
    edi: number;
    eip: number;
    eflags: number;
    cs: number;
    ds: number;
    es: number;
    ss: number;
    fs: number;
    gs: number;
    cr0: number;
}
/** 逆アセンブル1行。addrは先頭offから命令長を積算したオフセット。 */
export interface DisasmLine {
    addr: number;
    len: number;
    bytes: number[];
    text: string;
}
/**
 * ディスク書き込み用テキストエンコーダ。ASCIIはそのまま、改行は 0x0D 0x0A (CRLF) に、
 * それ以外は encodeSjisUnits で1文字ずつ Shift_JIS へ変換する。
 * encodeSjisUnits 自体は改行を 0x0D 単体(Enterキー注入用)に変換するため、
 * ディスクファイル向けにはここで改行だけ別扱いする。
 * (bridge.ts の disk_write_file / put_file 双方から使う共通実装)
 */
export declare function encodeTextForDisk(content: string): {
    bytes: Uint8Array;
    skipped: string[];
};
/** Uint8Array を base64 文字列へ変換する(チャンク分割でスタック超過を回避)。 */
export declare function bytesToBase64(bytes: Uint8Array): string;
/** base64 文字列を Uint8Array へ変換する。 */
export declare function base64ToBytes(base64: string): Uint8Array;
/** ゲストとのファイルやり取り(putFileToGuest/getFileFromGuest)の結果。 */
export interface GuestTransferResult {
    ok: boolean;
    message: string;
    /** ゲストで実行したコマンドと、その直後の画面末尾(検証用)。 */
    screen?: string;
}
/** キーマクロ1ステップ。runKeySequence に渡す配列の要素。 */
export type KeyStep = {
    type: 'press';
    keys: string;
    holdMs?: number;
} | {
    type: 'down';
    keys: string;
} | {
    type: 'up';
    keys: string;
} | {
    type: 'wait';
    ms: number;
} | {
    type: 'text';
    text: string;
} | {
    type: 'paste';
    text: string;
};
/** マウント中の1イメージの由来情報。 */
export interface MountedImage {
    slot: DiskSlot;
    name: string;
    sourceKey: string;
    url?: string;
}
export type WebNP2EventMap = {
    booted: {
        fs: EmscriptenFS;
    };
    bootError: {
        error: Error;
    };
    persisted: {
        slot: DiskSlot;
        name: string;
    };
    log: {
        level: 'info' | 'error';
        message: string;
    };
    fdChanged: {
        drive: 1 | 2;
        name?: string;
    };
    stateSaved: Record<string, never>;
    stateLoaded: Record<string, never>;
};
type Listener<T> = (detail: T) => void;
declare class TypedEmitter<EventMap extends Record<string, unknown>> {
    private listeners;
    on<K extends keyof EventMap>(type: K, listener: Listener<EventMap[K]>): () => void;
    emit<K extends keyof EventMap>(type: K, detail: EventMap[K]): void;
}
/**
 * WebNP2 コマンドバス。boot / persistNow / exportDisk / resetToOriginal / fullscreen を提供する。
 */
export declare class WebNP2 extends TypedEmitter<WebNP2EventMap> {
    private canvas;
    private fs;
    private mounted;
    private persistTimer;
    private boundOnVisibilityChange;
    private boundOnPageHide;
    /** ホスト側が推定するバスマウスのカーソル位置(0-639, 0-399)。null=未ホーミング(未確定)。 */
    private mousePos;
    constructor(canvas: HTMLCanvasElement);
    isBooted(): boolean;
    /** CPU実行の一時停止を切り替える。描画・イベント処理は継続する。 */
    dbgSetPaused(paused: boolean): void;
    /** CPUがデバッガによって一時停止中かを返す。 */
    dbgIsPaused(): boolean;
    /** 一時停止中に指定命令数だけ実行し、実際の実行数を返す。 */
    dbgStep(count: number): number;
    /** CPUレジスタを名前付きオブジェクトとして取得する。 */
    dbgReadRegs(): Registers;
    /** 逆アセンブル文字列を解析し、各行のaddrを命令長の積算で補う。 */
    dbgDisasm(seg: number, off: number, count: number): DisasmLine[];
    /** index 0..7のソフトウェアブレークポイントを設定する。 */
    dbgSetBreakpoint(index: number, seg: number, off: number, enabled: boolean): void;
    /** 最大命令数まで実行し、ヒットしたブレークポイントindex（無ヒットは-1）を返す。 */
    dbgRunUntilBreakpoint(maxSteps: number): number;
    getMountedImages(): MountedImage[];
    /** 現在マウント中のディスク一覧を返す(getMountedImagesの整形版)。 */
    listDisks(): Array<{
        slot: string;
        name: string;
        sourceKey: string;
    }>;
    /**
     * IndexedDBに保存済みのディスクイメージ一覧を返す(rom:/state: プレフィックスは除外)。
     * 拡張子からhdd/fdを判定する。savedAt降順。
     */
    listDiskLibrary(): Promise<Array<{
        sourceKey: string;
        name: string;
        size: number;
        savedAt: number;
        kind: 'hdd' | 'fd';
    }>>;
    /** URLからディスクイメージをfetchしてFDドライブへ挿入する。ファイル名はURLのbasename。 */
    insertFdFromUrl(drive: 1 | 2, url: string): Promise<{
        name: string;
    }>;
    /** IndexedDBのディスクライブラリからsourceKeyで指定したイメージをFDドライブへ挿入する。 */
    insertFdFromLibraryKey(drive: 1 | 2, sourceKey: string): Promise<{
        name: string;
    }>;
    /** 未フォーマットの空FDを生成してFDドライブへ挿入する。 */
    insertBlankFd(drive: 1 | 2): Promise<{
        name: string;
    }>;
    /**
     * マウント中イメージのバイト列をbase64で返す。5MBを超える場合はErrorを投げる
     * (HDDイメージなど巨大なものはUIのダウンロードボタンを使うよう案内する)。
     */
    exportDiskBase64(slot: DiskSlot): Promise<{
        name: string;
        base64: string;
        size: number;
    }>;
    /**
     * コアを起動する。config には hdd/fd1/fd2 の由来情報 (sourceKey/url) を渡す。
     */
    boot(params: {
        hdd?: {
            file: DiskFile;
            sourceKey: string;
            url?: string;
            alreadyPersisted?: boolean;
        };
        fd1?: {
            file: DiskFile;
            sourceKey: string;
            url?: string;
            alreadyPersisted?: boolean;
        };
        fd2?: {
            file: DiskFile;
            sourceKey: string;
            url?: string;
            alreadyPersisted?: boolean;
        };
        latencyMs?: number;
        extMemMB?: number;
        clkMult?: number;
        /** 登録済みROM/素材ファイル。読み取り専用扱いで、mount管理・永続化ループの対象にはしない。 */
        roms?: DiskFile[];
    }): Promise<void>;
    private startPersistLoop;
    private stopPersistLoop;
    private onVisibilityChange;
    /** persistNow の再入ガード。タイマーと visibilitychange が重なると二重保存になるため。 */
    private persisting;
    /** マウント中の各イメージのうち変化したものだけ IndexedDB へ保存する。 */
    persistNow(): Promise<void>;
    private persistNowInner;
    private snapshotOf;
    private hasChanged;
    /** 現在のイメージをダウンロードさせる。 */
    exportDisk(which: DiskSlot): Promise<void>;
    /** IndexedDB の保存を削除し、ページをリロードして配布元から再フェッチさせる。 */
    resetToOriginal(which: DiskSlot): Promise<void>;
    /** canvas をフルスクリーン表示する。 */
    fullscreen(): Promise<void>;
    /** マシンをリセットする (pccore_cfgupdate + pccore_reset)。 */
    resetMachine(): void;
    /**
     * 実行中の FD ドライブへイメージを挿入する。既存スロットがマウント中なら先に永続化してから差し替える。
     * IndexedDB に同 sourceKey の保存があればそちらを優先ロードする（前回の続き優先）。
     */
    insertFd(drive: 1 | 2, file: DiskFile, sourceKey: string, url?: string): Promise<void>;
    /** 実行中の FD ドライブからイメージを排出する。 */
    ejectFd(drive: 1 | 2): Promise<void>;
    /** 'fd1'|'fd2' 以外(hdd等)が渡された場合にErrorを投げる。FAT操作はFDのみ対応。 */
    private assertFdSlot;
    /** 指定スロットにマウント中のイメージ名を返す。マウントが無ければError。 */
    private getSlotImageName;
    /** MEMFS上のディスクイメージを読み出し FAT ボリュームとして開く。 */
    private openSlotFat;
    /**
     * FAT操作で書き換えたイメージをMEMFSへ書き戻し、DOSのディスクキャッシュを捨てさせるために
     * 排出→再挿入(メディア交換)を行ってからIndexedDBへ永続化する。
     * ゲストがそのドライブへアクセス中に呼ぶとゲスト側のI/Oと競合し得るため、
     * MCPツールの説明では「ゲストが書き込み中でないタイミングで実行すること」と案内している。
     */
    private writeBackSlotImage;
    /** FD内のFAT12/16ディスクイメージのファイル一覧と空き容量を返す。path省略時はルート。 */
    diskListFiles(slot: 'fd1' | 'fd2', path?: string): Promise<{
        entries: FatEntry[];
        free: number;
        total: number;
    }>;
    /** FD内のFAT12/16ディスクイメージからファイルを読み出す。 */
    diskReadFile(slot: 'fd1' | 'fd2', path: string): Promise<Uint8Array>;
    /** FD内のFAT12/16ディスクイメージへファイルを書き込む(新規作成/上書き)。 */
    diskWriteFile(slot: 'fd1' | 'fd2', path: string, data: Uint8Array): Promise<void>;
    /** FD内のFAT12/16ディスクイメージからファイルを削除する。 */
    diskDeleteFile(slot: 'fd1' | 'fd2', path: string): Promise<void>;
    /** FD内のFAT12/16ディスクイメージにディレクトリを作成する(ファイルマネージャUI向け)。 */
    diskMakeDir(slot: 'fd1' | 'fd2', path: string): Promise<void>;
    /** sourceKey が現在いずれかのスロットにマウント中かどうかを返す。 */
    private isSourceKeyMounted;
    /** IndexedDB上のライブラリイメージを読み出し FAT ボリュームとして開く。 */
    private openLibraryFat;
    /** 変更系ライブラリ操作の前提チェック(マウント中/起動後HDD)。問題があればErrorを投げる。 */
    private assertLibraryWritable;
    /** ライブラリ(未マウント)イメージ内のファイル一覧と空き容量を返す。マウント中でも読み取りは許可する。 */
    libraryListFiles(sourceKey: string, path?: string): Promise<{
        entries: FatEntry[];
        free: number;
        total: number;
    }>;
    /** ライブラリ(未マウント)イメージ内のファイルを読み出す。マウント中でも読み取りは許可する。 */
    libraryReadFile(sourceKey: string, path: string): Promise<Uint8Array>;
    /** ライブラリ(未マウント)イメージへファイルを書き込み、IndexedDBへ書き戻す。 */
    libraryWriteFile(sourceKey: string, path: string, data: Uint8Array): Promise<void>;
    /** ライブラリ(未マウント)イメージからファイルを削除し、IndexedDBへ書き戻す。 */
    libraryDeleteFile(sourceKey: string, path: string): Promise<void>;
    /** ライブラリ(未マウント)イメージ内にディレクトリを作成し、IndexedDBへ書き戻す。 */
    libraryMakeDir(sourceKey: string, path: string): Promise<void>;
    /** 変更後のライブラリイメージ全体をIndexedDBへ書き戻す。 */
    private putLibraryImage;
    /**
     * FD経由のゲスト転送に使うFDが指定ドライブに無ければ、同梱のツールFD(FAT12フォーマット済み)を
     * 挿入して用意する。ブランクFD(insertBlankFd)は未フォーマットでFATとして使えないため使わない。
     * 既にマウント中ならそのイメージ名をそのまま返す(挿入しない)。
     */
    private ensureTransferFd;
    /** FDドライブ番号からゲスト側ドライブレターを推定する(HDD起動時の既定: FD1='B:', FD2='C:')。 */
    private guestDriveLetter;
    /**
     * ホストのテキスト/バイナリを、転送用FD経由でゲストの任意ドライブへ配置する。
     * 手順: (1) 転送用FDを用意 (2) FDへホストデータを書き込み (3) ゲストでCOPYを実行
     * (4) 画面に出る結果文字列で成功/失敗を判定する。HDDをホストが直接書き換えないため、
     * DOSのディスクキャッシュと衝突する危険を避けられる。
     * opts.path はゲスト側の宛先フルパス(例 "A:\\WORK\\FOO.TXT")。ファイル名は8.3形式のみ。
     */
    putFileToGuest(opts: {
        path: string;
        content?: string;
        bytes?: Uint8Array;
        drive?: 1 | 2;
        timeoutMs?: number;
    }): Promise<GuestTransferResult>;
    /**
     * ゲストで COPY を実行し、完了(または失敗)を画面から判定する。
     * 上書き確認が出たら自動で Yes と答える。答えないとゲストが入力待ちのまま
     * 止まり、以降の操作がすべて詰まってしまうため。
     */
    private runGuestCopy;
    /** 画面テキスト中の判定用パターンの出現回数を数える。 */
    private countPatterns;
    /**
     * ゲストの任意ドライブ上のファイルを、転送用FD経由でホストへ取り出す。
     * 手順: (1) 転送用FDを用意 (2) ゲストでCOPY実行 (3) 結果文字列判定
     * (4) ゲストの書き込みがMEMFS上のイメージへ反映されるのを少し待ってからホストがFATを読む。
     */
    getFileFromGuest(opts: {
        path: string;
        drive?: 1 | 2;
        encoding?: 'text' | 'base64';
        timeoutMs?: number;
    }): Promise<GuestTransferResult & {
        text?: string;
        base64?: string;
        size?: number;
    }>;
    /** セーブ用の未フォーマット1.25MB(2HD)ベタイメージを生成する。DOS側でFORMATが必要。 */
    createBlankFd(): DiskFile;
    private primaryEntry;
    /** 現在の実行状態を statsave しIndexedDBへ保存する。キーは主ディスク(hdd→fd1→fd2)のsourceKeyから決める。 */
    saveState(): Promise<void>;
    /** IndexedDBに保存済みのステートがあればMEMFSへ書き戻してからロードする。 */
    loadState(): Promise<void>;
    private validateSlot;
    /** 名前付きスロットへ現在の実行状態を statsave し保存する。キーは `state:<主ディスクsourceKey>:<slot>`。 */
    saveStateSlot(slot: string): Promise<void>;
    /** 名前付きスロットからIndexedDBに保存済みのステートをMEMFSへ書き戻してロードする。 */
    loadStateSlot(slot: string): Promise<void>;
    /** 保存済みのステートスロット一覧を、保存日時の新しい順で返す。 */
    listStateSlots(): Promise<Array<{
        slot: string;
        savedAt: number;
    }>>;
    /**
     * 画面テキストが変化し、その後 stableMs の間変化が止まるまで待つ。
     * ロード完了やコマンド終了検出など、待つべき文字列が未知な場合に固定sleepの代わりに使う。
     * stableMs は既定800ms(最大5000ms)、timeoutMs は既定15000ms(最大60000ms)にクランプ。
     * 一度も変化が無いままタイムアウトした場合は changed:false を返す。
     */
    waitScreenChange(opts?: {
        stableMs?: number;
        timeoutMs?: number;
    }): Promise<{
        changed: boolean;
        text: string;
    }>;
    /** テキストVRAMを読み出し、SJISデコード済みの画面テキストとカーソル位置を返す。 */
    getScreenText(): {
        text: string;
        lines: string[];
        cursor: {
            row: number;
            col: number;
        } | null;
    };
    /**
     * デバッグ/解析用。PC-98メインRAMの[addr, addr+len)をBase64文字列で取得する。
     * 範囲チェックはcoreReadMemory側(0<=addr, addr+len<=メインRAMサイズ)で行う。
     */
    readMemoryBase64(addr: number, len: number): {
        addr: number;
        len: number;
        base64: string;
    };
    /** デバッグ用にPC-98メインRAMへ書き込む。CPU停止中の利用を前提とする。 */
    writeMemoryBase64(addr: number, base64: string): {
        addr: number;
        len: number;
    };
    /** PC-98スキャンコードを1回注入する。 */
    sendKey(code: number, down: boolean): void;
    private sleep;
    /**
     * バスマウスの相対移動を、コアが一度に飲み込める量(±64)に分割して送る。
     * 各ステップ後、コアが移動量を消費し切る(webnp2_mouse_pending()が0になる)まで
     * 最大300ms待つ(10ms間隔)。ゲスト側がマウスを読まないソフトでハングしないよう、
     * 0にならなくても諦めて次のステップへ進む。
     */
    private mouseStep;
    /**
     * バスマウスを画面外まで大きく動かして左上へ押し付ける(ホーミング)。
     * PC-98バスマウスは相対移動のみでカーソル位置はゲスト側が保持するため、
     * 絶対座標指定はここを基準に相対移動を積み上げて行う。
     */
    mouseHome(): Promise<void>;
    /**
     * マウスカーソルを画面座標(x,y)へ移動する。x,yは0-639/0-399にクランプされる。
     * 現在位置が未確定(未ホーミング)なら先に mouseHome() する。
     * 戻り値は移動後のホスト側推定位置。
     */
    mouseMoveTo(x: number, y: number): Promise<{
        x: number;
        y: number;
    }>;
    /** 現在のホスト側推定マウス位置を返す。未ホーミングなら null。 */
    getMousePosition(): {
        x: number;
        y: number;
    } | null;
    /**
     * マウスクリックを送る。x,y指定があれば先に mouseMoveTo する。
     * button既定は'left'、count既定1(最大3、ダブル/トリプルクリック用)。
     */
    mouseClick(opts?: {
        x?: number;
        y?: number;
        button?: 'left' | 'right';
        count?: number;
    }): Promise<void>;
    /** from から to へドラッグする(移動→押下→移動→解放)。button既定'left'。 */
    mouseDrag(from: {
        x: number;
        y: number;
    }, to: {
        x: number;
        y: number;
    }, button?: 'left' | 'right'): Promise<void>;
    /**
     * 画面テキスト(getScreenText().lines)からneedleを含む位置(行・列)を検索する。
     * colは文字インデックス(全角文字を含む行でもlinesは既にデコード済み文字列のため)。
     * opts.all=falseまたは省略時は最初の1件のみ、trueなら全件を返す。大文字小文字は区別する。
     */
    findScreenText(needle: string, opts?: {
        all?: boolean;
    }): Array<{
        row: number;
        col: number;
        text: string;
    }>;
    /**
     * 画面テキスト中のneedleを見つけてクリックする。occurrence(既定0=最初)番目の一致を使う。
     * テキストセルサイズ(横8px×縦16px、80x25で640x400)から x = col*8+4, y = row*16+8 を計算する。
     * 見つからなければ found:false を返す。
     */
    clickScreenText(needle: string, opts?: {
        button?: 'left' | 'right';
        occurrence?: number;
    }): Promise<{
        found: boolean;
        x?: number;
        y?: number;
    }>;
    /**
     * '+'区切りのキーコンボ文字列("CTRL+C" 等)を修飾キーコード列とメインキーコードへ解決する。
     * 解決できない場合は Error を投げる。
     */
    private resolveCombo;
    /**
     * "CTRL+C" や "ENTER" のようなキーコンボを送る。
     * '+'区切りの最後のトークンがメインキー、それ以前は修飾キー(NAMED_KEYSに存在するもののみ)。
     */
    sendKeys(combo: string): Promise<void>;
    /**
     * キー操作のマクロを順番に実行する(press/down/up/wait/text/paste)。
     * 長押し(holdMs指定のpress)や押しっぱなし→他操作→離す、といったキーシーケンスの再現に使う。
     * ステップ単体は最大10秒待ちにクランプ、シーケンス全体の累積待ち時間は60秒を超えるとErrorを投げる。
     * 例外発生時も、down で押しっぱなしのままのキーはすべて try/finally で自動的に up する。
     */
    runKeySequence(steps: KeyStep[]): Promise<{
        executed: number;
    }>;
    /** 文字列を1文字ずつキー入力として送る。解決できない文字はスキップしログ通知する。 */
    typeText(text: string): Promise<void>;
    /**
     * ホスト側からテキストを送信する。ゲスト常駐TSR(PASTE.COM)のメールボックスが
     * 見つかればそちら経由(TSR経路)、無ければ従来のキーバッファ直接注入(キーバッファ経路)
     * を自動的に使い分ける。
     */
    pasteText(text: string): Promise<{
        sent: number;
        skipped: string[];
    }>;
    /**
     * TSR経路: SJISバイト列をメールボックスのリングバッファへ書き込む。
     * DOSが旧ハンドラ内で入力待ちブロック中だと次の入力要求まで読まれないため、
     * 書き込み後に空きが全量(255)へ戻っていなければCR(0x0D)を1つキーバッファへ送り、
     * 現在の入力待ちを完了させて次の要求でTSRに拾わせる。
     */
    private pasteTextViaMailbox;
    /**
     * キーバッファ経路(従来): SJISバイト列(1バイト=1エントリ、上位scan=0)を
     * PC-98キーボードBIOSリングバッファへ直接積む。ゲスト側FEP無しで全角文字を
     * 入力できる。バッファは16エントリしかないため、満杯時は20ms待って再試行する
     * バックプレッシャで長文を流す。
     */
    private pasteTextViaKeyBuffer;
    /**
     * 画面テキストに指定文字列が現れるまでポーリングして待つ。固定sleepの代わりに使う。
     * timeoutMs は 60000ms にクランプ。タイムアウト時は found:false と最後に読んだテキストを返す。
     */
    waitScreenText(contains: string, timeoutMs?: number): Promise<{
        found: boolean;
        text: string;
    }>;
    /**
     * ゲストへペースト用TSR(PASTE.COM)入りツールFDを一時挿入し実行して、
     * 全角ペーストのTSR経路を有効化する。既に有効ならFD挿入せず即成功を返す。
     * mount管理には登録しない(一時挿入のため)。
     */
    setupPasteHelper(opts?: {
        drive?: 1 | 2;
        command?: string;
    }): Promise<{
        ok: boolean;
        message: string;
    }>;
    /** boot完了時、IndexedDBに保存済みのステートがあればMEMFSへ先に書き戻しておく（実際のロードはユーザー操作で行う）。 */
    private restoreStateIfPresent;
}
export {};
