/**
 * Dropbox共有リンクのホスト名を dl.dropboxusercontent.com に置換し、中継を挟まず
 * ブラウザから直接取得できるようにする。パスとクエリ(共有リンクのアクセス鍵 rlkey を
 * 含む)はそのまま保持し、ホスト名だけを差し替える(rlkeyを落とすと権限エラーになるため)。
 *
 * 実測(2026-08-18、FMSound側でブラウザのfetchにより確認。curl/Node fetchはCORSを
 * 強制しないためこの判定には使えない): `www.dropbox.com` のままだと `dl=0`/`dl=1`
 * いずれもACAOが無くCORSで失敗する(`TypeError: Failed to fetch`)。ホストを
 * `dl.dropboxusercontent.com` に置換すると、パス・クエリそのままで200・
 * content-type: application/zip・CORS通過で取得できる(`dl=1`への書き換えは不要、
 * 付けても結果は同じ)。実測したのは `/scl/fi/...` 形式のファイル共有リンク1本のみで、
 * 旧`/s/...`形式・フォルダ単位の共有・パスワード付き共有は未検証。それらは
 * この置換では救えない可能性があるが、fetchDiskBytes側で直接取得の失敗を検知して
 * 中継(DISK_PROXY_BASE)へ自動フォールバックするため、中継が設定されていれば
 * 従来どおり取得できる想定(中継が未設定でもDropboxが直接取得で通るようになる点は
 * この関数のみで完結し、中継設定の有無に依存しない)。
 *
 * `dl.dropboxusercontent.com` が既に指定されている場合はDROPBOX_HOSTSに一致しないため
 * 何もせず返す(冪等)。Dropbox以外のホストには一切触らない。
 */
export declare function rewriteDropboxUrl(url: string): string;
/**
 * バイト列がディスクイメージではなくHTML/XMLページに見えるかどうかを判定する。
 *
 * Google Driveの共有ページURL(`https://drive.google.com/file/d/<ID>/view?usp=sharing`)へ
 * ブラウザから直接fetchすると、GoogleはOriginをechoした `access-control-allow-origin` を
 * 付けて200でHTML閲覧ページを返す(2026-08-13 curl実測、content-type: text/html)。
 * fetch自体は成功(response.ok)してしまうため、Content-TypeとバイトのHTML/XML先頭シグネチャの
 * 両方で保険をかける。
 */
export declare function looksLikeHtml(bytes: Uint8Array, contentType?: string | null): boolean;
/**
 * 進捗コールバック付きでURLからディスクイメージのバイト列を取得する。
 *
 * 通常はまず指定URLへ直接fetchする(GitHub raw のようにCORS対応済みのURLに無駄な中継を挟まない
 * ため)。直接取得に失敗した場合のみ、中継サービス(VITE_DISK_PROXY)経由での再取得を試みる。
 * ただしOneDriveの共有リンクは実測で中継しても取得できないため中継を試さず即座に専用の
 * 案内を出し、中継が未設定の場合はGoogle Drive/Dropboxのみ「直接取得できません」と案内する
 * (それ以外は従来どおりCORS未対応の可能性を伝える)。
 *
 * Google Drive(PROXY_ONLY_HOSTS)の共有ページURLは、直接fetchしても中身ではなく
 * HTML閲覧ページが200で返ってくることが実測で判明している(GoogleがOriginをechoした
 * CORSヘッダ付きでHTMLを返すため、fetch自体は失敗しない)。そのため中継が設定されている
 * 場合、このホストは直接fetchを試さず最初から中継を使う(skipDirect)。
 * Dropboxはホスト名を rewriteDropboxUrl で dl.dropboxusercontent.com に置換すれば
 * 直接取得できることが実測できたため、skipDirectの対象からは外し、置換後のURLへ
 * 直接fetchを試みる(中継に渡すURLは利用者が入力した元のURL。中継はサーバ側から
 * 取得するため置換不要で、元の共有URLで実績がある)。
 * それでも(直接fetch成功時・中継利用時のいずれでも)取得結果がHTML/XMLに見える場合は
 * looksLikeHtml で検出し、ディスクイメージではないと案内する。
 */
export declare function fetchDiskBytes(url: string, onProgress?: (loaded: number, total: number | null) => void): Promise<Uint8Array>;
