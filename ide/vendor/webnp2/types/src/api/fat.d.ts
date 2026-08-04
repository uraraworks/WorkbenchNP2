/**
 * 利用者向けのディスク操作エラー。UIで言語別のメッセージへ差し替えられるよう
 * コードを持たせる(message自体は開発時/ブリッジ経由での確認用のフォールバック)。
 * 内部整合性の異常(不正なBPB等)は従来どおり素のErrorのままにしてある。
 */
export type DiskErrorCode = 'd88NotEditable' | 'hddInvalidHeader' | 'hddNoFatPartition' | 'mountedUseSlotApi' | 'hddEditBeforeBootOnly' | 'hddSlotUnsupported' | 'invalidShortName';
export declare class DiskError extends Error {
    readonly code: DiskErrorCode;
    readonly params: Record<string, string | number>;
    constructor(code: DiskErrorCode, message: string, params?: Record<string, string | number>);
}
export interface FatEntry {
    name: string;
    size: number;
    isDir: boolean;
    cluster: number;
    mtime: number;
}
interface FatVolumeInternal {
    image: Uint8Array;
    imageOffset: number;
    bytesPerSector: number;
    sectorsPerCluster: number;
    reservedSectors: number;
    numFats: number;
    rootEntries: number;
    sectorsPerFat: number;
    totalSectors: number;
    fatType: 'FAT12' | 'FAT16';
    fatStartByte: number;
    rootStartByte: number;
    rootDirBytes: number;
    dataStartByte: number;
    totalClusters: number;
    bytesPerCluster: number;
}
/** 内部用の不透明ハンドル。openFat() の戻り値をそのまま他の関数へ渡すこと。 */
export type FatVolume = FatVolumeInternal;
/**
 * ディスクイメージのブートセクタからBPBを読み取り、FatVolumeを構築する。
 * offset はイメージ先頭からブートセクタまでのバイトオフセット(既定0)。
 */
export declare function openFat(image: Uint8Array, offset?: number): FatVolume;
/**
 * 拡張子に応じてディスクイメージを開く。
 * - .thd/.nhd/.hdi/.hdd: HDDヘッダを飛ばし、PC-98パーティションテーブルから
 *   最初のFATパーティションを探して開く。
 * - .fdi: FDIヘッダ(offset+8=ヘッダサイズLE32, offset+12=FDDサイズLE32)を読み取り、
 *   妥当ならそのヘッダサイズをoffsetとしてopenFatを呼ぶ。不正なら既定4096固定にフォールバックする。
 * - .d88: 編集非対応としてErrorを投げる。
 * - それ以外(.xdf/.hdm/.dup/.fdd等): ベタイメージとしてoffset=0でopenFatを呼ぶ。
 */
export declare function openDiskImage(image: Uint8Array, fileName: string): FatVolume;
/**
 * PC-98 2HD(1.2MB)のFAT12フォーマット済みベタイメージを新規生成する。
 * DOS側でのFORMATが不要な、そのままFATとして読み書きできるブランクFDを返す。
 */
export declare function createFormattedFd(): Uint8Array;
/**
 * FAT16でフォーマット済みのブランクHDDイメージ(T98 .thd形式)を新規生成する。
 *
 * 単一パーティションをディスク全体に取り、DOSからデータドライブとして
 * そのまま読み書きできる状態にする。ただし第0シリンダに置くIPLは
 * シグネチャのみで実際のブートコードは持たないため、このHDD単体では起動できない。
 * FD等からDOSを起動したうえでデータ用ドライブとして使う想定。
 */
export declare function createFormattedHdd(): Uint8Array;
/** path='' または '/' でルート。指定ディレクトリ直下のエントリ一覧を返す。 */
export declare function fatList(vol: FatVolume, path: string): FatEntry[];
export declare function fatReadFile(vol: FatVolume, path: string): Uint8Array;
export declare function fatWriteFile(vol: FatVolume, path: string, data: Uint8Array): void;
/**
 * ディレクトリを新規作成する。クラスタを1つ確保して先頭に「.」「..」エントリを書き、
 * 親ディレクトリに ATTR_DIRECTORY 属性のエントリを追加する。
 * ルート直下に作成する場合、".." の startCluster は 0 (ルートを指す慣習) とする。
 */
export declare function fatMakeDir(vol: FatVolume, path: string): void;
export declare function fatDeleteFile(vol: FatVolume, path: string): void;
export declare function fatFreeSpace(vol: FatVolume): {
    total: number;
    free: number;
};
export {};
