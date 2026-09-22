/*
 * p98.h - PC-98(386以上) 向け最小グラフィックライブラリ
 *
 * 対象: WebNP2(NP2kai) + FreeDOS(98)、WorkbenchNP2 の SmallerC huge model。
 * 仕様の根拠: WebNP2-wiki (Graphics.md / Timing-and-Interrupts.md 等) と
 * 実機ではなくエミュレータ上での実測。詳細は docs/design.md を参照。
 *
 * スコープ: 画面初期化・VSYNC待ち・ページ交換・GRCGによる塗り・パレット設定・
 * キーボード。スプライトは docs/design.md に API の形だけを設計として
 * 書いてある(未実装)。
 */
#ifndef P98_H
#define P98_H

/* 640x400 16色モードを開始する。元の画面モード・パレット・書き換える
 * 割り込みベクタ(INT 23h)を退避し、Ctrl+C による異常終了時に画面が
 * グラフィックモードのまま固まらないよう INT 23h を無害化する。
 *
 * ---- テキスト画面とカーソルの後始末(2026-09、docs/design.md参照) ----
 * 既定では、p98_init() は**テキスト画面(文字コード面)を空白で消し、
 * カーソルも消す**。FreeDOS起動時のメッセージ等がグラフィック画面と
 * 重なって見えてしまう問題への対策(作者が1996年に書いたSHUTING.ASMも
 * INT 18h AH=12hでカーソルを消している)。
 *   - 消すのは**文字コード面(0xA0000)だけ**。属性面(0xA2000)は触らない
 *     (WebNP2-wiki Text-VRAM.md: 属性面を0で埋めると表示ビットが落ちて
 *     画面が真っ黒になるため)。
 *   - **消したテキストの中身は退避しない(p98_quit()でも戻らない)。**
 *     退避・復元するのはカーソルの表示/非表示だけ。
 *   - テキストを重ねて使いたい場合は p98_set_hide_text_on_init(0) を
 *     p98_init() より前に呼んで無効化できる(既定は有効=消す)。
 *
 * 戻り値: 成功時0、失敗時0以外(現状は常に成功する)。
 */
int p98_init(void);

/* p98_init() で変更した状態(画面モード・パレット・INT 23h ベクタ)を
 * すべて元へ戻す。p98_init() を呼んでいない状態で呼んではいけない。
 *
 * テキスト画面については、**カーソルの表示は必ず元(表示)に戻す**
 * (p98_set_hide_text_on_init()の設定に関わらず常に行う、無害な冪等操作)。
 * これは単なる見た目の問題ではなく、WorkbenchNP2 ide/dos-prompt.mjs の
 * currentDosPrompt() がカーソル位置を頼りにDOSプロンプトを検出しているため、
 * カーソルを表示に戻し忘れると**呼び出し元(検証ハーネス等)がDOSプロンプトへ
 * 戻ったことを永久に検出できなくなる**(tests/p98_broken_cursor_noshow.cで
 * 実際に確認済み。docs/verify-log.md参照)。
 * 一方、**p98_init()で消したテキストの中身(文字コード面)は元に戻さない**
 * (退避していないため)。戻った直後の画面は空白のままで、その後はCOMMAND.COM
 * 等が自分の出力で上書きしていく。
 */
void p98_quit(void);

/* p98_init()がテキスト画面を消してカーソルを隠すかどうかを設定する
 * (p98_init()より前に呼ぶこと。p98_init()の中で1回だけ参照される)。
 * enable=0にすると、p98_init()はテキスト画面・カーソルに一切触れなくなる
 * (利用者がテキストを重ねて使いたい場合向け)。既定は1(消す)。
 * この設定に関わらず、p98_quit()は常にカーソルを表示に戻す(上記参照)。
 */
void p98_set_hide_text_on_init(int enable);

/* 次の垂直帰線が始まるまで待つ(ポーリング)。 */
void p98_wait_vsync(void);

/* 表示ページと描画ページを入れ替える。以後の p98_clear()/p98_fill_rect() は
 * 新しい描画ページ(= 直前まで表示していなかった側)に書く。
 *
 * 注意: p98_flip() 自体は「前のフレームで描いた内容」を新しい描画ページへ
 * 引き継がない(2ページはそれぞれ独立した内容を保持するだけ)。動く絵を
 * 描くシーンでは、呼び出し側が毎フレーム背景を描き直すか、自分で
 * dirty rect 管理をする必要がある(samples/walk.c、docs/design.md
 * 「動くデモと使い勝手で気づいた点」参照)。
 */
void p98_flip(void);

/* p98_init() 以降に p98_flip() を呼んだ回数。 */
unsigned long p98_frames(void);

/* 描画ページ全体を color (0-15) で塗る。 */
void p98_clear(int color);

/* 描画ページの矩形 (x, y, w, h) を color (0-15) で塗る。
 * 画面外・負のx/y・w<=0・h<=0 は画面内の範囲だけに切り詰める(クリップ)。
 * 完全に画面外の矩形は何もしない。
 */
void p98_fill_rect(int x, int y, int w, int h, int color);

/* パレット番号 index (0-15) の色を r,g,b (各0-15) に設定する。 */
void p98_set_palette(int index, int r, int g, int b);

/* ---- キーボード (p98_init()～p98_quit()の間だけ有効) ----
 * 実装はBIOS(INT 18h)方式(2026-09、IRQ1直接受信方式から切替。
 * docs/design.md参照。理由: 生のIRQ1では「押しっぱなしで本物のbreak→make
 * ペアが繰り返し来る」キーリピートを止められないことが実測で分かったため、
 * リピートの影響を受けないBIOSのキーセンス(AH=04h)へ切り替えた)。
 * ベクタ横取り・PIC操作は行わない。scancode は 0-127
 * (WebNP2-wiki Keyboard.md のスキャンコード表と同じ体系、bit7は使わない)。
 *
 * 制限(design.md/verify-log.md参照): p98_poll()を呼ぶ間隔より短い
 * 「ちょん押し」(1フレーム未満で離される押下)は取りこぼす。BIOSの
 * センスは「今その瞬間押しているか」を返すだけの状態読み取りで、
 * IRQ1直接受信方式にあったような「edgeビットを別に持って取りこぼしを防ぐ」
 * 対策ができないため。
 */

/* このフレーム分の入力を取り込む(スナップショット方式)。BIOSのキーセンス
 * (INT 18h AH=04h)を全16グループぶん読み、前回のp98_poll()との差分から
 * p98_key_pressed()を求める。毎フレーム1回、ループの先頭で呼ぶ想定。
 */
void p98_poll(void);

/* scancode を押している間ずっと真(1)。範囲外(0-127以外)は常に0。 */
int p98_key_down(int scancode);

/* 直前の p98_poll() から今回の p98_poll() までの間に、scancodeが新たに
 * 押された(前回は押されておらず、今回は押されている)なら真(1)。
 * 押しっぱなしにしてもp98_poll()の間隔をまたいで真になるのは最初の1回だけ
 * (BIOSのキーリピートの影響を受けない)。
 */
int p98_key_pressed(int scancode);

/* 文字入力をBIOSのキーバッファ(INT 18h AH=01h/00h)から1文字取り出す。
 * 無ければ0を返す(非ブロッキング)。SHIFT/CAPS/CTRL等の変換はBIOSが
 * 行った結果をそのまま返す(WebNP2-wiki Keyboard.md参照)。
 */
int p98_key_getch(void);

/* ---- スプライト(CPU合成のみ。EGCでの高速化は次回スコープ。docs/design.md参照) ----
 *
 * データ形式: 4プレーン(青・赤・緑・輝度)+マスクの1bpp(1ドット1ビット)ビットマップ。
 * 各プレーン・マスクとも共通のレイアウト:
 *   - 1行 = ceil(w/8) バイト、MSBが左端のドット(p98_fill_rect/GRCGと同じビット順)。
 *   - 行方向はパディング無しで詰めて並べる(1プレーンぶんの総バイト数 = ceil(w/8)*h)。
 *   - mask のビットが1の位置だけ画面へ書く(背景を壊さない)。0の位置は
 *     4プレーンとも背景をそのまま残す。
 * 4プレーン+別マスクという形式にした理由(1bppにした理由も含む、docs/design.md参照):
 *   - VRAM自体が4プレーン×1bppの構造なので、変換無しでそのままVRAMへ書ける。
 *   - マスクを「背景色をキーカラーにする」方式にしなかったのは、GRCGを介さない
 *     1バイト単位のread-modify-write(p98__peekb/pokeb系)で合成するため、
 *     キーカラー比較よりビットAND/ORの方がシンプルで速いため。
 */
typedef struct {
    int w;                          /* 幅(ドット数、1以上) */
    int h;                          /* 高さ(ドット数、1以上) */
    const unsigned char *planes[4]; /* [0]=青 [1]=赤 [2]=緑 [3]=輝度。各 ceil(w/8)*h バイト */
    const unsigned char *mask;      /* 1=描画する ceil(w/8)*h バイト */
} p98_sprite_t;

/* スプライトを描画ページの (x, y) (スプライトの左上が来る座標) へ描く。
 * x は1ドット単位で自由に指定できる(バイト境界に揃っている必要は無い)。
 * 画面外・負のx/y・スプライトが画面端からはみ出す場合は、はみ出した部分だけを
 * 描かず、画面内の部分だけ描く(p98_fill_rect と同様のクリップ)。
 * spr が NULL、または w<=0 || h<=0 の場合は何もしない。
 */
void p98_draw_sprite(const p98_sprite_t *spr, int x, int y);

/* ---- 描画バックエンド(CPU合成 / EGC。2026-09後半、docs/design.md参照) ----
 * P98_SPRITE_CPU: 常に p98__blend_bits(1バイト単位のread-modify-write)で
 *   4プレーンぶん個別に書く。全ケースで正しく動く既定値。
 * P98_SPRITE_EGC: 実測で確認できたEGCの「1回のCPU書き込みで4プレーン
 *   すべてに同じ値を書ける」機能を使い、透明ドットを含まず4プレーンの
 *   結果が全て同一になるバイト(単色スプライトの内部等)だけを高速化する。
 *   それ以外のバイト(マスクの穴・プレーンごとに異なる色)はCPU経路に
 *   自動でフォールバックするため、**見た目の結果はP98_SPRITE_CPUと
 *   常に一致する**(tools/verify.mjsの等価性検査で確認済み)。
 *   マスク・シフトレジスタ自体はEGCの機能として使っていない(実測で
 *   ビット単位のマスク合成が再現できなかったため。docs/design.md参照)。
 */
typedef enum { P98_SPRITE_CPU = 0, P98_SPRITE_EGC = 1 } p98_sprite_backend_t;

/* 以後の p98_draw_sprite() が使うバックエンドを切り替える(既定:CPU)。 */
void p98_set_sprite_backend(p98_sprite_backend_t backend);
p98_sprite_backend_t p98_get_sprite_backend(void);

/* p98_set_sprite_backend()の設定に関わらず、バックエンドを明示して描く
 * (検証用。両方のバックエンドを同じプログラム内で叩き分けられるように)。 */
void p98_draw_sprite_ex(const p98_sprite_t *spr, int x, int y, p98_sprite_backend_t backend);

/* ---- 背景ページ+差分復帰(EGC活用。2026-09、docs/design.md参照) ----
 *
 * p98_flip()によるダブルバッファリングとは**兼用できない**(どちらもポート
 * 0xA6でページを切り替える点は同じだが、意味が違う。flipは「表示・描画を
 * 毎フレーム入れ替える」、こちらは「表示ページを固定し、もう一方を
 * “背景の原本”として使う」)。p98_flip()の「動く絵を描くたびに背景の
 * 退避・復元を利用者が自分で書く必要がある」という制約(walk.cのサンプル・
 * design.mdの所見参照)を、EGCのVRAM→VRAMコピーで軽減するための経路。
 *
 * 使い方:
 *   1. p98_init()の代わりにp98_init_bgpage()で初期化する。
 *   2. p98_set_draw_target(P98_TARGET_BACKGROUND)にしてから、通常の
 *      p98_clear()/p98_fill_rect()/p98_draw_sprite()で背景を1回だけ
 *      背景ページへ描く。
 *   3. p98_set_draw_target(P98_TARGET_SCREEN)(既定)に戻し、以後は
 *      毎フレームp98_draw_sprite_diff()でキャラクタ等を描く。前回この
 *      関数が描いた矩形(バイト境界に外側へ切り上げた範囲)を背景ページ
 *      から画面ページへ復元してから、新しい位置へ描いてくれる。
 *
 * 制限:
 *   - p98_flip()はbgpageモードでは呼んではいけない(呼んでも何もしない)。
 *   - p98_draw_sprite_diff()が復元する範囲は、スプライトのx/y/w/hを
 *     バイト境界(8ドット)へ外側に切り上げた矩形。x/yがバイト境界に
 *     揃っていないスプライトでも動くが、切り上げた分だけ余分にコピーが
 *     発生する。
 *   - 同時に動かせるのは1体分(直前の1矩形)だけ。複数のスプライトを
 *     同時に動かす場合は、それぞれ別にp98_fill_rect等で背景ページ側の
 *     内容を工夫するか、次回以降のスコープで複数スロット対応を検討する
 *     (今回は単一スロットのみ)。
 */
typedef enum { P98_RENDER_FLIP = 0, P98_RENDER_BGPAGE = 1 } p98_render_mode_t;

/* p98_init()と同じ初期化に加え、背景ページ+差分復帰モードにする。 */
int p98_init_bgpage(void);

/* 現在の描画モード(既定はP98_RENDER_FLIP。p98_init_bgpage()した場合のみP98_RENDER_BGPAGE)。 */
p98_render_mode_t p98_get_render_mode(void);

typedef enum { P98_TARGET_SCREEN = 0, P98_TARGET_BACKGROUND = 1 } p98_draw_target_t;

/* 以後のp98_clear()/p98_fill_rect()/p98_draw_sprite()の描画先を切り替える。
 * P98_RENDER_BGPAGEモードでのみ意味を持つ(P98_RENDER_FLIPでは何もしない)。
 */
void p98_set_draw_target(p98_draw_target_t target);

/* 前回このAPIで描いた矩形を背景ページから画面ページへ復元してから、
 * sprを(x,y)へ描く。最初の呼び出し(前回の矩形が無い)では復元をしない。
 * P98_RENDER_FLIPモードで呼んだ場合はp98_draw_sprite()と同じ動作になる
 * (背景復元はできないためフォールバック)。
 */
void p98_draw_sprite_diff(const p98_sprite_t *spr, int x, int y);

/* 背景ページの内容を画面ページへ丸ごとコピーする(2026-09、docs/design.md
 * 「背景ページ→画面ページのまるごとコピー」節参照)。EGCのVRAM→VRAM転送を
 * 使い、画面全体(400行×80バイト)を1回のfar call(p98__egc_copy_page())で
 * コピーする。P98_RENDER_BGPAGEモードでないとき(p98_init_bgpage()を
 * 呼んでいないとき)は何もしない。
 * 「背景を作り直したときに画面へ反映する」用途を想定している
 * (draw_tiled_background()のような重い背景の敷き詰めを画面ページへも
 * 二重に行う代わりに、背景ページへ1回だけ敷いてこちらでコピーする)。
 * 速いかどうかはA/B実測が前提(docs/design.md・docs/verify-log.md参照。
 * 「まるごとコピー」は1ワードごとにページ切替のOUTが2回要るため、必ず
 * タイル敷き詰め自体より速いとは限らない)。 */
void p98_copy_bgpage_to_screen(void);

/* ---- EGCによる本来のスプライト転送(2026-09後半、docs/design.md参照) ----
 *
 * p98_draw_sprite()/p98_draw_sprite_diff()は1バイト単位のCPU read-modify-write
 * (p98__blend_bits)で合成しており、EGCはP98_SPRITE_EGCバックエンドの
 * 「4プレーンとも同一バイトになる場合だけ」の部分最適化に留まっていた。
 * こちらはEGCのシフトレジスタ(sft)とラスタ演算(ope)、および転送長(leng)を
 * 本来の使い方(1行=1回のワード転送で4プレーンへ同時に反映)で使う経路で、
 * 実測で確認した以下の性質を前提にしている:
 *   - leng(0x4AE)は「合計ドット予算」として働き、シフトで先頭(dstbitぶん)・
 *     末尾(予算超過ぶん)にはみ出す分は書き込み先の元の値が保護される。
 *   - opeの下位8bitはラスタ演算(転送元そのまま=0xF0/AND=0xC0/OR=0xFC)、
 *     bit11(0x0800)を足すとシフトモードになる。
 *   - 2パス(マスクAND→絵OR)の間はope/sft/lengの再設定だけで済み、
 *     EGC自体(ポート0x7C)を無効化してはいけない(実測で確認済み)。
 *
 * 置き場: 各プレーンの表示に使われない余り(オフセット32000〜32767、
 * 768バイト)へ、あらかじめ「絵」と(透明ドットがあれば)「反転マスク」を
 * ページ0・ページ1の両方へ書き込んでおく(EGCの転送元は必ずVRAM上に
 * 無ければならないため)。この768バイトという容量の制約上、
 *   - 幅は16の倍数であること(ceil不要にして行ごとのワード数を単純にするため)。
 *   - 確保は単純なバンプ割り当てで、個別解放はできない
 *     (p98_vram_reset()で先頭へ戻すことだけできる)。
 * 横方向にスプライトが画面端からはみ出す座標(x<0またはx+w>640)は、
 * このバンプ置き場の転送経路では対応しない(CPU経路のp98_draw_sprite()へ
 * 自動でフォールバックし、結果がCPU経路と一致することを優先する)。
 * p98_flip()(表裏入れ替え)とも、背景ページ+差分復帰方式とも併用できる
 * (アップロード時に両ページへ書いてあるため、どちらの描画ページに
 * 描いてもEGCの転送元は必ず揃っている)。
 */
#define P98_VRAM_STORE_OFF  32000
#define P98_VRAM_STORE_SIZE 768

typedef struct {
    const p98_sprite_t *src;  /* 横方向クリップ時にCPU経路へ戻すため保持。 */
    int w, h;
    int words;                /* 1行のワード数 = w/16 */
    unsigned pixOff;          /* 絵の先頭オフセット(P98_VRAM_STORE_OFFからの相対) */
    unsigned maskOff;         /* 反転マスクの先頭(opaque=0の時だけ使用) */
    unsigned char opaque;     /* 1=全ドット不透明(マスクを使わない) */
} p98_vram_sprite_t;

/* VRAM置き場のバンプ割り当てを先頭(0)へ戻す。p98_vram_upload()を何度も
 * 呼び直して使い回すプログラムの起動時、あるいはシーン切り替え時に呼ぶ。
 * 既にp98_draw_sprite_vram()等で使っているp98_vram_sprite_tは、
 * これを呼んだ後は無効になる(再アップロードするまで使わないこと)。 */
void p98_vram_reset(void);

/* sprをEGC転送用にVRAMの余り(768バイト/プレーン)へアップロードし、
 * outへ結果を書く。
 * 戻り値: 0=成功、-1=幅が16の倍数でない、-2=置き場の容量不足。
 * 失敗時はoutの内容を保証しない。 */
int p98_vram_upload(const p98_sprite_t *spr, p98_vram_sprite_t *out);

/* 既にp98_vram_upload()で確保済みのvsの領域(同じw/h/opaque)へ、
 * 別のspr(コマ替え後の絵)を上書きアップロードする。アニメーションの
 * コマ送りで毎回p98_vram_upload()を呼んで置き場を消費しないための経路。
 * w/h/opaque(全ドット不透明かどうか)のいずれかが一致しなければ-1、
 * 成功時は0。 */
int p98_vram_reupload(p98_vram_sprite_t *vs, const p98_sprite_t *spr);

/* p98_vram_upload()がこの先あと何バイト確保できるか(1プレーンあたり、
 * 768バイトの残量)。 */
int p98_vram_free_bytes(void);

/* vsをEGC経由で描画ページの(x,y)へ描く。x<0またはx+vs->w>640(横方向に
 * 画面端をはみ出す)場合はp98_draw_sprite(vs->src, x, y)へフォールバックする
 * (vs->srcがNULLなら何もしない)。縦方向は行ごとにクリップする
 * (画面外の行は読み書きとも行わない)。 */
void p98_draw_sprite_vram(const p98_vram_sprite_t *vs, int x, int y);

/* p98_draw_sprite_diff()のEGC版。作りは全く同じ(背景ページから前回の
 * 矩形を復元してから描き、今回の矩形を記録する)で、描画部分だけ
 * p98_draw_sprite_vram()を使う。差分矩形の状態はp98_draw_sprite_diff()と
 * 共有する。P98_RENDER_BGPAGEモードでない場合はp98_draw_sprite_vram()へ
 * フォールバックする。 */
void p98_draw_sprite_vram_diff(const p98_vram_sprite_t *vs, int x, int y);

/* ---- EGCマスクレジスタによる1パス転送について(2026-09、試して落とした) ----
 * 置き場に「絵」だけを置き、透明ドットの選別をEGCマスクレジスタ(0x4A8)
 * 側で毎ワード行う1パス方式を試作・実測したが、2パス方式(上記
 * p98_vram_upload/p98_draw_sprite_vram)の約0.27倍(約3.7倍遅い)という
 * 結果になったため撤去した。VRAM消費が半分で済む利点はあるが、
 * 現状は使わない。経緯・実測値・再開に要る情報はdocs/design.md参照。
 */

#endif /* P98_H */
