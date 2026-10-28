export interface StoredImage {
    sourceKey: string;
    url?: string;
    /** 元のファイル名(拡張子含む)。イメージ種別の判定とエクスポート時のファイル名に使う。リネームしても変わらない。 */
    name: string;
    bytes: ArrayBuffer;
    savedAt: number;
    /** ライブラリ一覧での表示名。未設定なら name をそのまま表示する。 */
    displayName?: string;
    /** 同一アーカイブから展開した複数ディスクをまとめるグループID。単体イメージでは未設定。 */
    group?: string;
    /** グループの表示名。同一グループの全レコードが同じ値を持つ(リネーム時は全件更新)。 */
    groupName?: string;
    /** グループ内の並び順(アーカイブ内の出現順)。 */
    groupIndex?: number;
}
/** 表示名/グループ情報など、UI側で付けたメタ情報のみを抜き出した型。 */
export type ImageMeta = Pick<StoredImage, 'displayName' | 'group' | 'groupName' | 'groupIndex'>;
/** 本体を含まない一覧用レコード。 */
export type ImageIndex = Omit<StoredImage, 'bytes'> & {
    size: number;
};
/** 版上げの待機開始と解除を通知する。 */
export declare function onUpgradeBlocked(handler: (blocked: boolean) => void): void;
export declare function get(sourceKey: string): Promise<StoredImage | undefined>;
export declare function put(image: StoredImage): Promise<void>;
/**
 * イメージ本体を書き戻す。表示名/グループ等のメタ情報は既存レコードのものを常に優先する。
 * put() は1レコード全置換のため、ゲスト側の書き込み保存や同じファイルの再取り込みで
 * ユーザーが付けた名前が消えるのを防ぐ用途で使う。索引があれば本体を読まずにメタ情報を取得する。
 */
export declare function putPreservingMeta(image: StoredImage): Promise<void>;
/**
 * 既存レコードのメタ情報(表示名/グループ)だけを更新する。イメージ本体は変更しない。
 * インラインのメタ情報と索引を共に更新し、古い読み手との互換性を保つ。
 */
export declare function updateMeta(sourceKey: string, meta: ImageMeta): Promise<void>;
/** キーの差分だけを修復し、移行済みレコードの本体は読まない。 */
export declare function listIndex(): Promise<ImageIndex[]>;
/** sourceKey が prefix で始まる全レコードを取得する。 */
export declare function getAllByPrefix(prefix: string): Promise<StoredImage[]>;
/** store内の全レコードを取得する。 */
export declare function getAllStored(): Promise<StoredImage[]>;
export declare function del(sourceKey: string): Promise<void>;
export { del as delete };
