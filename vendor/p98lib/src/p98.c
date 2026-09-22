/*
 * p98.c - p98.h の実装。
 *
 * 設計方針(詳細は docs/design.md):
 *  - 速度が要る処理(ポートI/O・VRAMのrep stosb一括書き込み)は生の asm() ブロックで書く。
 *    SmallerC(huge model)の asm() は文字列を「そのまま」出力するだけで、Cの変数を
 *    自動でオペランドに束縛してくれない。そこで asm ブロックは
 *      (a) 関数引数を [bp+8]/[bp+12]/... で読む(スタック相対。huge modelでも
 *          スタックはSSベースの素直な実アドレスなので安全)
 *      (b) VRAMセグメントは引数からESへ直接ロードする(DS経由の巻き戻しが要らない)
 *    の2パターンだけに限定し、Cのグローバル変数をasmから直接触らない
 *    (huge modelはグローバル変数アクセスのたびにコンパイラがDSを積み直す
 *    独自の正規化をしており、asm側でそれを模倣するのは危険なので避けた)。
 *  - 引数のスタックオフセット(+8,+12,...)は当てずっぽうではなく、
 *    SmallerC自身がコンパイル結果に出す "; loc x : (@N)" コメントを実際に
 *    出力させて確認した値(huge modelでは各引数が型によらず4バイトスロットを
 *    占める)。tools/build.mjs のビルド検証、および docs/design.md 参照。
 *  - unityビルド廃止(2026-09、docs/design.md参照)に伴い、p98__outb()だけは
 *    本物の別ファイル(src/p98_asm.asm)のNASMへ切り出し、tools/build.mjsが
 *    ライブラリのCオブジェクト・ユーザーのCオブジェクトとは別にアセンブルして
 *    リンク段で合流させる。残りのプリミティブは引き続きasm()ブロックのまま
 *    (全部を移す必要はなく、経路が動くことを示すのがスコープ)。
 */
#include "p98.h"

/* ---- ハードウェア定数(WebNP2-wiki Graphics.md / Timing-and-Interrupts.md) ---- */
#define P98_PORT_VSYNC      0x60
#define P98_PORT_GDC_GRAPH  0xA2
#define P98_PORT_MODE16     0x6A
#define P98_PORT_DISP_PAGE  0xA4
#define P98_PORT_DRAW_PAGE  0xA6
#define P98_PORT_GRCG_MODE  0x7C
#define P98_PORT_GRCG_TILE  0x7E
#define P98_PORT_PAL_INDEX  0xA8
#define P98_PORT_PAL_GREEN  0xAA
#define P98_PORT_PAL_RED    0xAC
#define P98_PORT_PAL_BLUE   0xAE

/* キーボード。2026-09、IRQ1直接受信方式からBIOS(INT 18h)方式へ切替
 * (docs/design.md参照)。理由: 生のIRQ1割り込みでは「押しっぱなしで
 * break→makeが繰り返し来る」キーリピートを根本的に止められないことが
 * 実測で分かったため。BIOSのキーセンス(AH=04h)は状態を読むだけで
 * リピートの影響を受けない。
 *
 * INT 18h AH=04h(キーセンス、実測で確定。docs/design.md/verify-log.md参照):
 *  - AL=グループ番号(0-15)を渡すと、AHにそのグループの8スキャンコード分の
 *    押下状態がビットで返る。group=scancode>>3, bit=scancode&7, 1=押している
 *  - 作者が1996年当時に書いたSAKA.ASM/SHUTING.ASMのソースに
 *    実例があり、そこから読み取った規則をnp2kai上のsendKey注入で独立に
 *    実測して確認した(全数ではなく2キーぶんのサンプル実測。他はSAKA.ASM/
 *    SHUTING.ASMの実例と整合)
 *  - この呼び出しはキーバッファを消費しない。文字入力は別途AH=00h/01hを使う
 */
#define P98_KBD_GROUPS        16

#define P98_SEG_PLANE_B     0xA800
#define P98_SEG_PLANE_R     0xB000
#define P98_SEG_PLANE_G     0xB800
#define P98_SEG_PLANE_I     0xE000

#define P98_BYTES_PER_LINE  80
#define P98_PLANE_BYTES     32000  /* 80 * 400 */
#define P98_SCREEN_W        640
#define P98_SCREEN_H        400

/* テキスト画面(WebNP2-wiki Text-VRAM.md、実測で確認済み)。
 * 文字コード面=0xA0000、属性面=0xA2000、1セル2バイト、80x25=2000セル。
 * p98_init()/p98_quit()でのテキスト画面消去・カーソル制御に使う
 * (docs/design.md「テキスト画面とカーソルの後始末」節参照)。 */
#define P98_SEG_TVRAM_CHAR  0xA000
#define P98_TVRAM_CELLS     2000

/* 表示ページ/描画ページはポート0xA4/0xA6の「バンク切り替え」方式(実測で確認済み。
 * docs/design.md「表示ページ/描画ページ(0xA4/0xA6)は…」節、docs/verify-log.md
 * probe_flip参照)。0xA8000等のセグメントは常に「今CPUから見えている面」を指し、
 * ソフト側でページ番号に応じたオフセットを足す必要は無い(むしろ足すと
 * プレーン間隔0x8000バイトと衝突して隣のプレーンを壊す。過去に試して誤りだと
 * 判明した仮説と同じ計算になるため、意図的に何も足さない)。 */

/* =====================================================================
 * 低レベル asm プリミティブ
 * ===================================================================== */

/* out port, val (1バイト)。実装は src/p98_asm.asm (別ファイルのNASM) にあり、
 * tools/build.mjs がライブラリのCオブジェクトとは別にアセンブル・リンクする
 * (unityビルド廃止。詳細はdocs/design.md)。 */
extern void p98__outb(unsigned port, unsigned char val);

/* dst=(dst&~mask)|(bits&mask) をES:[bx]への1回の読み書きで行う。実装は
 * src/p98_asm.asm。p98_draw_sprite() の内側ループ(1バイトごとの合成)用に
 * 追加した(p98__outbと同じ「別ファイルのNASM→ELFオブジェクト」経路)。 */
extern void p98__blend_bits(unsigned seg, unsigned off, unsigned char bits, unsigned char mask);

/* EGCによる本来のスプライト転送(p98_draw_sprite_vram, src/p98.c)用。
 * 実装は src/p98_asm.asm。p98__blend_bitsと同じ「別ファイルのNASM」経路。
 *
 * p98__copy_far_to_vram()(Cのポインタをfar pointer化してVRAMへrep movsbする
 * プリミティブ)は2026-09に撤去した: 大きい静的配列のアドレスをfar pointer
 * へ変換する処理が、ライブラリ内の無関係な静的データの増減で配置が変わると
 * 壊れる(無関係なメモリを読む)ことが分かったため(docs/design.md「配置
 * 依存の不具合」節参照)。VRAMアップロードは全経路をp98__pokeb()による
 * 1バイトずつの直接書き込みへ寄せてあり、Cのポインタをasm側へfar pointerと
 * して渡す経路は本ライブラリから無くなっている。 */
extern void p98__egc_row(unsigned seg, unsigned srcOff, unsigned dstOff, unsigned wordCount);

/* 4プレーンぶんを1ワードずつ(=1プレーンあたり2バイト)まとめて書く。実装は
 * src/p98_asm.asm。p98_vram_upload()/p98_vram_reupload()のアップロード自体が
 * 「プレーンごと・1バイトごとにp98__pokeb()をfar call」していて遅い
 * (32x32マスク付きで実測9.56ms、tests/probe_vram_upload_bench.c)ことへの
 * 対策として2026-09に追加した。far callの回数を「バイト数×4プレーン」から
 * 「ワード数」まで1/8に減らす。
 *
 * 4プレーンのセグメント値はasm側に即値で持たせてある(Cのポインタを
 * asmへ渡さない方針=p98__copy_far_to_vram撤去の理由を崩さないため。上記
 * p98__egc_rowコメント・docs/design.md参照)。**asm側の即値(0xA800/0xB000/
 * 0xB800/0xE000)は、下のP98_SEG_PLANE_B/R/G/Iの定義と同じ値であること。
 * ずれるとVRAMへ違うプレーンの内容が書かれて壊れる(この一次検査は
 * tests/probe_vram_upload_bytes.cが捕まえる)。** */
extern void p98__pokew4(unsigned off, unsigned wB, unsigned wR, unsigned wG, unsigned wI);

/* 背景ページ→画面ページのまるごとコピー(p98_copy_bgpage_to_screen()用)。
 * 実装はsrc/p98_asm.asm。1ワードごとの「OUT(背景ページ)→読む→
 * OUT(画面ページ)→書く」ループをasm側に落とし、far call回数を
 * 画面全体でも1回(この呼び出し自体)にする(docs/design.md参照)。 */
extern void p98__egc_copy_page(unsigned seg, unsigned srcOff, unsigned dstOff,
                                unsigned wordCount, unsigned char bgPage, unsigned char screenPage);

/* in port (1バイト、ゼロ拡張して返す) */
static unsigned char p98__inb(unsigned port) {
    asm("mov dx, [bp+8]");
    asm("in al, dx");
    asm("movzx eax, al");
}

/* seg:off から count バイトを val で埋める(rep stosb)。GRCG有効中に呼べば
 * 1回の呼び出しで4プレーン分を一気に書ける。 */
static void p98__fillmem(unsigned seg, unsigned off, unsigned count, unsigned char val) {
    asm("mov ax, [bp+8]");
    asm("mov es, ax");
    asm("mov di, [bp+12]");
    asm("mov cx, [bp+16]");
    asm("mov al, [bp+20]");
    asm("rep stosb");
}

/* seg:off の1バイトを読む */
static unsigned char p98__peekb(unsigned seg, unsigned off) {
    asm("mov ax, [bp+8]");
    asm("mov es, ax");
    asm("mov bx, [bp+12]");
    asm("mov al, [es:bx]");
    asm("movzx eax, al");
}

/* seg:off へ1バイト書く */
static void p98__pokeb(unsigned seg, unsigned off, unsigned char val) {
    asm("mov ax, [bp+8]");
    asm("mov es, ax");
    asm("mov bx, [bp+12]");
    asm("mov al, [bp+16]");
    asm("mov [es:bx], al");
}

/* seg:off の1ワード(2バイト)を読む。背景ページ差分復帰(EGC)専用
 * (p98__egc_restore_rect参照)。peekb/pokebと同じ安全なパターン
 * (引数はスタック相対[bp+N]、VRAMセグメントはESへ直接ロード)のまま、
 * al/axをax/eaxに変えただけ。 */
static unsigned p98__peekw(unsigned seg, unsigned off) {
    asm("mov ax, [bp+8]");
    asm("mov es, ax");
    asm("mov bx, [bp+12]");
    asm("mov ax, [es:bx]");
    asm("movzx eax, ax");
}

/* seg:off へ1ワード(2バイト)書く */
static void p98__pokew(unsigned seg, unsigned off, unsigned val) {
    asm("mov ax, [bp+8]");
    asm("mov es, ax");
    asm("mov bx, [bp+12]");
    asm("mov ax, [bp+16]");
    asm("mov [es:bx], ax");
}

/* DS:DX = seg:off を INT n (nは即値ではなく AH=0x25 / AL=vecno で渡す形) へ設定する。
 * vecno と off は AX の下位ワードとしてまとめて渡す都合上、呼び出し側で
 * AH=0x25 を組み立ててから呼ぶ(p98__set_vector参照)。 */
static void p98__set_vector(unsigned char vecno, unsigned seg, unsigned off) {
    asm("push ds");
    asm("mov dx, [bp+16]");   /* off */
    asm("mov ax, [bp+12]");   /* seg */
    asm("mov ds, ax");
    asm("mov al, [bp+8]");    /* vecno */
    asm("mov ah, 0x25");
    asm("int 0x21");
    asm("pop ds");
}

/* AH=0x35 AL=vecno の割り込みベクタ取得。戻り値の下位16bit=offset。 */
static unsigned p98__get_vector_off(unsigned char vecno) {
    asm("mov al, [bp+8]");
    asm("mov ah, 0x35");
    asm("int 0x21");
    asm("mov ax, bx");
    asm("movzx eax, ax");
}

/* 同上、セグメント側。 */
static unsigned p98__get_vector_seg(unsigned char vecno) {
    asm("mov al, [bp+8]");
    asm("mov ah, 0x35");
    asm("int 0x21");
    asm("mov ax, es");
    asm("movzx eax, ax");
}

/* AH=0x42 (グラフィック/テキスト画面モード切替)。CH=mode。 */
static void p98__int18_mode(unsigned char mode) {
    asm("mov ch, [bp+8]");
    asm("mov cl, 0");
    asm("mov ah, 0x42");
    asm("int 0x18");
}

/* AHだけを立ててINT 18hを呼ぶ(引数無し版)。カーソル表示(AH=0x11)/
 * 非表示(AH=0x12)用(WebNP2-wiki Text-VRAM.md「カーソルを動かす・消す」参照、
 * 作者が1996年に書いたSHUTING.ASMの実例(AH=0x12でカーソルを消す)とも一致)。
 * p98__int18_modeと同じ「引数はスタック相対」パターン。 */
static void p98__int18_ah(unsigned char ah) {
    asm("mov ah, [bp+8]");
    asm("int 0x18");
}

/* テキスト画面(文字コード面、0xA0000)を空白(0x0020)で埋める。
 * 属性面(0xA2000)は触らない(Text-VRAM.md: 属性面を0x00で埋めると
 * 表示ビット(bit0)が落ちて画面が真っ黒になる、という注意があるため。
 * 文字コード面だけを0x0020で埋める分には既存の属性がそのまま活きる)。 */
static void p98__clear_text_screen(void) {
    unsigned i;
    for (i = 0; i < P98_TVRAM_CELLS; i++) {
        p98__pokew(P98_SEG_TVRAM_CHAR, (unsigned)(i * 2), 0x0020);
    }
}

/* AH=0x02 (1文字コンソール出力、DL=char)。PC-98のDOSコンソールドライバは
 * ANSI風のエスケープシーケンスをここで解釈する。ファンクションキー行
 * (画面24行目)の表示/非表示切替に使う(下記p98__hide_fkey_line参照)。
 * huge modelのグローバル文字列(const char*)をポインタ経由で読むのは
 * コンパイラのDS正規化がそのまま担当するため、asm側は引数のDLだけを
 * スタック相対で読む安全なパターンのまま(design.md参照)。 */
static void p98__dos_putc(char c) {
    asm("mov dl, [bp+8]");
    asm("mov ah, 0x02");
    asm("int 0x21");
}

static void p98__dos_puts(const char *s) {
    while (*s) {
        p98__dos_putc(*s);
        s++;
    }
}

/* ファンクションキー行(画面24行目)の表示/非表示。実測で確認済み
 * (docs/design.md「ファンクションキー行を消す」節参照。作者が書いた
 * KEYSHOOT.C/SAKA.ASMの実例`ESC[>1h`/`ESC[>1l`と一致):
 *   - `ESC[>1h`を送ると、24行目の文字コード面が空白に、属性面も
 *     ちょうど0xE1(表示・下線無し)に揃う。単に文字コード面を消すだけでは
 *     下線属性(0xE5)が残ってしまい、空白+下線が横一列に並んだ「白い帯」に
 *     見える問題があったが、このエスケープはDOS側が属性まで含めて
 *     きちんと処理してくれる。
 *   - `ESC[>1l`を送ると、消す前の文字・属性(ラベル文字列と下線パターン)が
 *     **1バイトも違わず元通り**になる(実測で確認)。p98libが自前で
 *     退避しなくても、DOS側が状態を覚えていてくれる。
 * このためファンクションキー行は(カーソルや文字コード面の空白埋めとは
 * 違い)自前でのVRAM直接操作ではなく、このDOSエスケープシーケンスを使う
 * ことにした(実測で選んだ結果。詳細はdocs/design.md参照)。 */
static void p98__hide_fkey_line(void) {
    p98__dos_puts("\x1B[>1h");
}

static void p98__show_fkey_line(void) {
    p98__dos_puts("\x1B[>1l");
}

/* =====================================================================
 * ライブラリ状態
 * ===================================================================== */

static const unsigned p98__plane_seg[4] = { P98_SEG_PLANE_B, P98_SEG_PLANE_R, P98_SEG_PLANE_G, P98_SEG_PLANE_I };

static unsigned char p98__inited = 0;
static p98_sprite_backend_t p98__sprite_backend = P98_SPRITE_CPU;
static unsigned char p98__draw_page = 1; /* 0=最初から表示している側, 1=裏 */
static unsigned long p98__frame_count = 0;

/* p98_init()がテキスト画面を消してカーソルを隠すかどうか。既定は1(消す)。
 * テキストを重ねて使いたい利用者は、p98_init()より前に0を渡して無効化できる
 * (docs/design.md「テキスト画面とカーソルの後始末」節参照)。 */
static unsigned char p98__hide_text_on_init = 1;

/* 背景ページ+差分復帰モード(2026-09、docs/design.md参照)。
 * p98_flip()によるダブルバッファリングとは兼用できない
 * (両方ともポート0xA6を使ってページを切り替える点は同じだが、意味が違う:
 * flipモードは「表示・描画の両方を毎フレーム入れ替える」、bgpageモードは
 * 「表示ページは固定し、描画先(0xA6)だけを画面/背景の間で行き来させる」)。 */
static p98_render_mode_t p98__render_mode = P98_RENDER_FLIP;
static p98_draw_target_t p98__draw_target = P98_TARGET_SCREEN;
static unsigned char p98__screen_page = 0; /* bgpageモードで常に表示し続けるページ */
static unsigned char p98__bg_page = 1;     /* bgpageモードで「背景の原本」として使うページ(表示しない) */

/* p98_draw_sprite_diff() が直前に描いた矩形(バイト境界に外側へ切り上げ済み)。
 * 次回の呼び出しでこの矩形だけを背景ページから画面ページへ復元してから描く。 */
static unsigned char p98__diff_valid = 0;
static int p98__diff_byte_x = 0;
static int p98__diff_y = 0;
static int p98__diff_byte_w = 0;
static int p98__diff_h = 0;

/* p98_init() で退避する状態 */
static unsigned char p98__saved_pal_g[16];
static unsigned char p98__saved_pal_r[16];
static unsigned char p98__saved_pal_b[16];
static unsigned p98__saved_int23_seg;
static unsigned p98__saved_int23_off;

/* Ctrl+C (INT 23h) を無害化するハンドラ。何もせず戻るだけ。
 * huge model の __interrupt 関数は全レジスタを push/pop し、iret で終わる
 * (retf ではない)ことをコンパイル結果で確認済み。 */
static void __interrupt p98__ctrlc_handler(void) {
}

/* =====================================================================
 * キーボード(BIOS INT 18h方式。IRQ1直接受信は廃止。docs/design.md参照)
 * ===================================================================== */

/* 128スキャンコード分の押下状態(1bit/code)。BIOSのキーセンス(AH=04h)を
 * p98_poll()で全16グループぶん読み、スナップショットとして持つ。 */
static unsigned char p98__key_cur_down[P98_KBD_GROUPS];    /* 直近のp98_poll()時点 */
static unsigned char p98__key_prev_down[P98_KBD_GROUPS];   /* 前回のp98_poll()時点 */
static unsigned char p98__key_pressed_snap[P98_KBD_GROUPS];/* cur & ~prev(このpollで新規に押されたビット) */

/* AH=04h キーセンス。AL=グループ番号(0-15)。戻り値(AH)の各ビットが
 * group*8+bit のスキャンコードの押下状態(1=押している)。実測で確認済み
 * (docs/verify-log.md参照。作者の1996年のソース(SAKA.ASM/SHUTING.ASM)の
 * 実例とも一致)。バッファは消費しない。 */
static unsigned char p98__kbd_sense(unsigned char group) {
    asm("mov al, [bp+8]");
    asm("mov ah, 0x04");
    asm("int 0x18");
    asm("movzx eax, ah");
}

/* AH=01h キーの有無を覗く(消費しない)。戻り値: 0=無し、それ以外=有り。 */
static unsigned p98__kbd_peek(void) {
    asm("mov ah, 0x01");
    asm("int 0x18");
    asm("mov al, bh");
    asm("movzx eax, al");
}

/* AH=00h キーを1件取り出す(無ければ待つ。呼ぶ前に必ずp98__kbd_peek()で
 * 確認すること)。AH=スキャンコード、AL=文字コードがAXにまとまって返るので、
 * 下位8bit(AL)だけを返す。 */
static unsigned p98__kbd_get(void) {
    asm("mov ah, 0x00");
    asm("int 0x18");
    asm("movzx eax, al");
}

/* BIOSのタイプアヘッドバッファを空にする。p98_quit()で必ず呼ぶ:
 * キーセンス(AH=04h)はバッファを消費しないため、押しっぱなしにしていた
 * キーのmake/breakがBIOSの16件バッファに残ったままp98_quit()を抜けると、
 * 戻った先のCOMMAND.COM(や他のプログラム)がそれを入力として読んでしまう
 * (実測で確認した副作用。docs/verify-log.md参照)。 */
static void p98__kbd_drain(void) {
    int guard = 0;
    while (p98__kbd_peek() != 0 && guard < 32) {
        p98__kbd_get();
        guard++;
    }
}

static void p98__key_reset_state(void) {
    int i;
    for (i = 0; i < P98_KBD_GROUPS; i++) {
        p98__key_cur_down[i] = 0;
        p98__key_prev_down[i] = 0;
        p98__key_pressed_snap[i] = 0;
    }
}

/* =====================================================================
 * 公開API
 * ===================================================================== */

int p98_init(void) {
    int i;
    unsigned long handler_addr;
    unsigned handler_seg, handler_off;

    if (p98__inited) return 0;

    p98__key_reset_state();

    /* テキスト画面を消し、カーソル・ファンクションキー行を隠す(既定。
     * docs/design.mdの「テキスト画面とカーソルの後始末」「ファンクション
     * キー行を消す」節参照)。FreeDOS起動時のメッセージ等がグラフィック画面と
     * 重なって見えてしまう問題への対策。テキスト画面の“中身”(文字コード面)は
     * 退避しない(戻せない。p98_quit()側のコメント・docs/design.md参照)。
     * ファンクションキー行はDOS側が状態を覚えてくれるため中身も戻る
     * (p98__hide_fkey_line参照)。カーソル・ファンクションキー行は
     * 必ずp98_quit()で元に戻す。 */
    if (p98__hide_text_on_init) {
        p98__clear_text_screen();
        p98__int18_ah(0x12); /* カーソルを消す */
        p98__hide_fkey_line();
    }

    /* パレットを退避(WebNP2-wiki: 0xA8/0xAA/0xAC/0xAEは読み出せる、と実測記載あり) */
    for (i = 0; i < 16; i++) {
        p98__outb(P98_PORT_PAL_INDEX, (unsigned char)i);
        p98__saved_pal_g[i] = p98__inb(P98_PORT_PAL_GREEN);
        p98__saved_pal_r[i] = p98__inb(P98_PORT_PAL_RED);
        p98__saved_pal_b[i] = p98__inb(P98_PORT_PAL_BLUE);
    }

    /* INT 23h(Ctrl+C)を退避してから無害化ハンドラへ差し替える */
    p98__saved_int23_off = p98__get_vector_off(0x23);
    p98__saved_int23_seg = p98__get_vector_seg(0x23);

    handler_addr = (unsigned long)(void*)p98__ctrlc_handler;
    handler_seg = (unsigned)(handler_addr >> 4);
    handler_off = (unsigned)(handler_addr & 0xFUL);
    p98__set_vector(0x23, handler_seg, handler_off);

    /* キーボードはBIOS(INT18h)方式に切り替えたため、ベクタ横取り・PIC操作・
     * EOI処理は一切行わない(docs/design.md参照)。 */

    /* 640x400 16色・グラフィック表示 */
    p98__int18_mode(0xC0);         /* 400ライン・表画面 */
    p98__outb(P98_PORT_MODE16, 1); /* 16色モード */

    p98__draw_page = 1;
    p98__outb(P98_PORT_DRAW_PAGE, 1);
    p98__outb(P98_PORT_DISP_PAGE, 0);
    p98__outb(P98_PORT_GDC_GRAPH, 0x0D); /* グラフィック表示開始 */

    p98__render_mode = P98_RENDER_FLIP;
    p98__draw_target = P98_TARGET_SCREEN;
    p98__diff_valid = 0;

    p98__frame_count = 0;
    p98__inited = 1;
    return 0;
}

int p98_init_bgpage(void) {
    int rc = p98_init(); /* パレット退避・Ctrl+C無害化・画面モード設定を丸ごと再利用する */
    if (rc != 0) return rc;

    /* p98_init()はflip前提(描画ページ=1・表示ページ=0)のまま返るため、
     * bgpageモードではここで「表示ページ=描画ページ=0固定、ページ1は
     * 背景の原本」という運用に確定させる。以後p98_flip()は呼んではいけない
     * (呼んでも何もしない。docs/design.md参照)。 */
    p98__render_mode = P98_RENDER_BGPAGE;
    p98__screen_page = 0;
    p98__bg_page = 1;
    p98__draw_target = P98_TARGET_SCREEN;
    p98__diff_valid = 0;

    p98__draw_page = 0;
    p98__outb(P98_PORT_DRAW_PAGE, 0);
    p98__outb(P98_PORT_DISP_PAGE, 0);
    return 0;
}

p98_render_mode_t p98_get_render_mode(void) {
    return p98__render_mode;
}

void p98_set_draw_target(p98_draw_target_t target) {
    if (p98__render_mode != P98_RENDER_BGPAGE) return; /* flipモードでは無意味 */
    p98__draw_target = target;
    p98__outb(P98_PORT_DRAW_PAGE,
              (unsigned char)(target == P98_TARGET_BACKGROUND ? p98__bg_page : p98__screen_page));
}

void p98_quit(void) {
    int i;
    if (!p98__inited) return;

    /* GRCG/EGC(ポート0x7C)を念のため無効化する。p98_draw_sprite()の
     * EGC経路は正常時は必ず自分で無効化して抜けるが、万一有効なまま
     * (異常系や将来の変更で)p98_quit()に来ても、以後の普通のVRAM書き込みが
     * 化けたままにならないようにする保険(docs/design.md参照)。 */
    p98__outb(0x7C, 0x00);

    p98__outb(P98_PORT_GDC_GRAPH, 0x0C); /* グラフィック表示終了 */
    p98__outb(P98_PORT_DISP_PAGE, 0);
    p98__outb(P98_PORT_DRAW_PAGE, 0);
    p98__int18_mode(0xC0);               /* 400ライン・表画面へ戻す */

    /* カーソル・ファンクションキー行を必ず元(表示)に戻す
     * (p98__hide_text_on_initの値に関わらず常に呼ぶ。既に表示されている
     * 場合は無害な冪等操作)。
     *
     * カーソル復帰を外すとp98_quit()直後(COMMAND.COMへ戻る前)は
     * カーソルが非表示のままになる(tests/p98_broken_cursor_noshow.cと
     * tests/probe_cursor.cで確認)。ただし**COMMAND.COMがプロンプトを
     * 表示する際に自分でカーソルを表示に戻すため**、DOSプロンプトへ戻った
     * 後で見ると復帰し忘れていても区別が付かない(当初「復帰を忘れると
     * waitForCurrentDosPromptが永久にタイムアウトする」と予想したが、
     * 実測で外れた。docs/design.md参照)。 */
    p98__int18_ah(0x11);
    p98__show_fkey_line();

    for (i = 0; i < 16; i++) {
        p98__outb(P98_PORT_PAL_INDEX, (unsigned char)i);
        p98__outb(P98_PORT_PAL_GREEN, p98__saved_pal_g[i]);
        p98__outb(P98_PORT_PAL_RED, p98__saved_pal_r[i]);
        p98__outb(P98_PORT_PAL_BLUE, p98__saved_pal_b[i]);
    }

    p98__set_vector(0x23, p98__saved_int23_seg, p98__saved_int23_off);

    /* BIOSのタイプアヘッドバッファを空にする。押しっぱなしのキーがあると
     * ここでバッファに溜まったままの可能性があり、空にせずに戻ると
     * COMMAND.COM(や次に動くプログラム)がそれを入力として読んでしまう
     * (実測で確認した副作用。docs/verify-log.md参照)。 */
    p98__kbd_drain();

    p98__render_mode = P98_RENDER_FLIP;
    p98__diff_valid = 0;
    p98__inited = 0;
}

void p98_wait_vsync(void) {
    while (p98__inb(P98_PORT_VSYNC) & 0x20) { }
    while (!(p98__inb(P98_PORT_VSYNC) & 0x20)) { }
}

void p98_flip(void) {
    if (p98__render_mode == P98_RENDER_BGPAGE) return; /* 背景ページモードとは兼用不可(docs/design.md参照)。何もしない */
    {
        unsigned char new_display = p98__draw_page;
        unsigned char new_draw = (unsigned char)(p98__draw_page ^ 1);
        p98__outb(P98_PORT_DISP_PAGE, new_display);
        p98__outb(P98_PORT_DRAW_PAGE, new_draw);
        p98__draw_page = new_draw;
        p98__frame_count++;
    }
}

unsigned long p98_frames(void) {
    return p98__frame_count;
}

void p98_clear(int color) {
    unsigned char b = (color & 1) ? 0xFF : 0x00;
    unsigned char r = (color & 2) ? 0xFF : 0x00;
    unsigned char g = (color & 4) ? 0xFF : 0x00;
    unsigned char i = (color & 8) ? 0xFF : 0x00;

    p98__outb(P98_PORT_GRCG_MODE, 0x80);
    p98__outb(P98_PORT_GRCG_TILE, b);
    p98__outb(P98_PORT_GRCG_TILE, r);
    p98__outb(P98_PORT_GRCG_TILE, g);
    p98__outb(P98_PORT_GRCG_TILE, i);
    p98__fillmem((unsigned)P98_SEG_PLANE_B, 0, P98_PLANE_BYTES, 0xFF);
    p98__outb(P98_PORT_GRCG_MODE, 0x00);
}

/* 1バイト内の[bitLo, bitHi]の範囲(0=左端~7=右端の並びで、bit7が左端)を
 * colorのプレーンbitに応じて塗り、範囲外は既存の値を保つ。 */
static void p98__blend_byte(unsigned seg, unsigned off, int color, int planeBitIndex, unsigned char mask) {
    unsigned char old = p98__peekb(seg, off);
    unsigned char want = (color & (1 << planeBitIndex)) ? 0xFF : 0x00;
    unsigned char updated = (unsigned char)((old & ~mask) | (want & mask));
    p98__pokeb(seg, off, updated);
}

void p98_fill_rect(int x, int y, int w, int h, int color) {
    int x0, y0, x1, y1;
    int row;
    unsigned seg_b, seg_r, seg_g, seg_i;

    if (w <= 0 || h <= 0) return;
    x0 = x;
    y0 = y;
    x1 = x + w;
    y1 = y + h;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > P98_SCREEN_W) x1 = P98_SCREEN_W;
    if (y1 > P98_SCREEN_H) y1 = P98_SCREEN_H;
    if (x0 >= x1 || y0 >= y1) return; /* 完全に画面外 */

    seg_b = (unsigned)P98_SEG_PLANE_B;
    seg_r = (unsigned)P98_SEG_PLANE_R;
    seg_g = (unsigned)P98_SEG_PLANE_G;
    seg_i = (unsigned)P98_SEG_PLANE_I;

    for (row = y0; row < y1; row++) {
        int leftByte = x0 >> 3;
        int rightByte = (x1 - 1) >> 3;
        unsigned rowOff = (unsigned)(row * P98_BYTES_PER_LINE);

        if (leftByte == rightByte) {
            unsigned char mask = (unsigned char)(0xFF >> (x0 & 7));
            mask &= (unsigned char)(0xFF << (7 - ((x1 - 1) & 7)));
            unsigned off = rowOff + (unsigned)leftByte;
            p98__blend_byte(seg_b, off, color, 0, mask);
            p98__blend_byte(seg_r, off, color, 1, mask);
            p98__blend_byte(seg_g, off, color, 2, mask);
            p98__blend_byte(seg_i, off, color, 3, mask);
        } else {
            unsigned char leftMask = (unsigned char)(0xFF >> (x0 & 7));
            unsigned char rightMask = (unsigned char)(0xFF << (7 - ((x1 - 1) & 7)));
            int midCount = rightByte - leftByte - 1;
            unsigned leftOff = rowOff + (unsigned)leftByte;
            unsigned rightOff = rowOff + (unsigned)rightByte;

            p98__blend_byte(seg_b, leftOff, color, 0, leftMask);
            p98__blend_byte(seg_r, leftOff, color, 1, leftMask);
            p98__blend_byte(seg_g, leftOff, color, 2, leftMask);
            p98__blend_byte(seg_i, leftOff, color, 3, leftMask);

            if (midCount > 0) {
                unsigned char b = (color & 1) ? 0xFF : 0x00;
                unsigned char r = (color & 2) ? 0xFF : 0x00;
                unsigned char g = (color & 4) ? 0xFF : 0x00;
                unsigned char i = (color & 8) ? 0xFF : 0x00;
                unsigned midOff = rowOff + (unsigned)(leftByte + 1);

                p98__outb(P98_PORT_GRCG_MODE, 0x80);
                p98__outb(P98_PORT_GRCG_TILE, b);
                p98__outb(P98_PORT_GRCG_TILE, r);
                p98__outb(P98_PORT_GRCG_TILE, g);
                p98__outb(P98_PORT_GRCG_TILE, i);
                p98__fillmem(seg_b, midOff, (unsigned)midCount, 0xFF);
                p98__outb(P98_PORT_GRCG_MODE, 0x00);
            }

            p98__blend_byte(seg_b, rightOff, color, 0, rightMask);
            p98__blend_byte(seg_r, rightOff, color, 1, rightMask);
            p98__blend_byte(seg_g, rightOff, color, 2, rightMask);
            p98__blend_byte(seg_i, rightOff, color, 3, rightMask);
        }
    }
}

void p98_set_palette(int index, int r, int g, int b) {
    p98__outb(P98_PORT_PAL_INDEX, (unsigned char)(index & 0x0F));
    p98__outb(P98_PORT_PAL_GREEN, (unsigned char)(g & 0x0F));
    p98__outb(P98_PORT_PAL_RED, (unsigned char)(r & 0x0F));
    p98__outb(P98_PORT_PAL_BLUE, (unsigned char)(b & 0x0F));
}

/* =====================================================================
 * スプライト(CPU合成。docs/design.md参照)
 * ===================================================================== */

/* p98_draw_sprite() の横1ドットシフトの方式について(実測で確認・docs/design.md):
 * 「8通りの事前シフト済みビットマップを持つ」方式と比較検討し、今回は
 * 「描画のたびにCPUでシフトして合成する」方式を採用した。理由:
 *   - 事前シフト方式はデータサイズが約8倍(w方向に+1バイト×8パターン)になり、
 *     このスコープ(データ形式もここで初めて決める段階)ではまだ実データの
 *     点数・サイズ感が読めないため、まずメモリ効率の良い方式で組んで
 *     tools/verify.mjsの速度計測(本ドキュメント末尾)で「CPU合成のまま
 *     どこまで持つか」を数値化し、次回のEGC高速化の判断材料にする方針にした。
 *   - シフト自体はソース側の1バイトを読むたびに `>>` と `<<` を1回ずつ行うだけ
 *     (キャリー処理はソース1バイトにつき1回)で、事前シフト方式でも結局
 *     「どのシフト済みデータを選ぶか」の分岐が要ることを考えると、実装の
 *     複雑さの差ほど自明な有利さが無いと判断した。
 * どちらが実際に速いかの直接比較は今回は行っていない(未確認。次回EGC版との
 * 比較時に、必要ならこの判断も再検証する)。
 *
 * 内側ループ(1バイトごとのマスク合成)は p98__blend_bits (src/p98_asm.asm) へ
 * 切り出し、read-modify-write を1回のasm呼び出しで済ませている。
 */
/* =====================================================================
 * EGC(2026-09後半、実測で確認できた範囲のみ使用。docs/design.md参照)
 * =====================================================================
 *
 * WebNP2-wiki Graphics.mdのEGC節で「未検証」とされていたマスク(0x4A8)と
 * シフト(0x4AC)を実測した(使い捨てプローブ、コミットには残していない。
 * 詳細な実験内容と結果はdocs/verify-log.md参照)。分かったこと:
 *   - マスク(0x4A8)は、どのWM値・読み出しの有無の組み合わせでも
 *     ビット単位の合成として機能しなかった(全ビット上書き/無効化/
 *     ゼロ化のいずれかで、意図した部分マスクにはならなかった)。
 *   - シフト(0x4AC)は「ワード単位(mov ax,[..]/mov [..],ax)の書き込み」
 *     でのみ効果があり、値は「レジスタ値-1」ぶん左シフトする(0と1は
 *     どちらも「シフト無し」)。ただし1ワード書き込みの**奇数側アドレスの
 *     バイトは一切更新されず**、ワードをまたいだキャリー(繰り上がり)も
 *     発生しなかった。VRAM上に常駐させたデータからrep movswで読む方式も
 *     試したが、EGC有効中の読み出しが実際の格納値を返さなかった
 *     (常に0になった)。
 * これらの結果、**マスク+シフトを組み合わせた「任意の4プレーン別データを
 * シフトしながらマスク合成する」という当初期待した使い方は、この
 * np2kai実装では再現できなかった。**
 *
 * 一方で、wikiが既に確認していた「1回のCPU書き込みで4プレーンすべてに
 * 同じ値が書ける」(WM=0x0000、プレーン全選択)という基本機能は実測でも
 * 問題無く再現できた。そこで今回のEGC経路は、この確実に効く機能**だけ**を
 * 使い、シフト計算(ソフトウェア)の結果、
 *   - マスクが全ビット不透明(0xFF)で、
 *   - 4プレーンの合成結果が全プレーンで同一の値になる
 *     (単色スプライトの内部等、実際のゲームでもよくあるケース)
 * バイトに限り、4回の p98__blend_bits 呼び出し(1プレーンずつ)を
 * 1回のEGC書き込み(4プレーン同時)に置き換える。それ以外
 * (透明ドットを含む・プレーンごとに異なる色のバイト)は、確実性を優先して
 * 従来のCPU経路(p98__blend_bits)のままにする。
 */
static void p98__egc_outw(unsigned port, unsigned val) {
    /* wiki: 「いずれも16ビットのレジスタですが、下位・上位を1バイトずつ
     * 書いてもかまいません」との実測記載どおり、既存の(実績のある)
     * p98__outb を2回呼ぶだけにし、新規のワード出力asmは増やさない。 */
    p98__outb(port, (unsigned char)(val & 0xFF));
    p98__outb((unsigned)(port + 1), (unsigned char)(val >> 8));
}

/* 有効化順序は固定(wiki実測): 0x7Cのbit7を先に立て、0x6Aを2回書く。 */
static void p98__egc_enable(void) {
    p98__outb(0x7C, 0x80);
    p98__outb(0x6A, 0x07);
    p98__outb(0x6A, 0x05);
    p98__egc_outw(0x4A0, 0xFF00); /* 4プレーンすべてに書く(wiki実測) */
    p98__egc_outw(0x4A2, 0x0000); /* パターン源: CPU書き込み値そのまま */
    p98__egc_outw(0x4A4, 0x0000); /* WM=0: CPU値をそのまま書く(wiki実測) */
    p98__egc_outw(0x4A8, 0xFFFF); /* マスク: このEGC経路では常に「全ビット
                                    * 不透明」のバイトにしか使わないため、
                                    * マスクレジスタ自体は無効(全通過)の
                                    * ままにする(実測でビット単位の効果が
                                    * 確認できなかったため、当てにしない)。 */
    p98__egc_outw(0x4AC, 0x0000); /* シフト無し(このEGC経路はソフトウェアで
                                    * シフト済みの1バイトを渡すだけなので、
                                    * EGC自身のシフト機能は使わない)。 */
    p98__egc_outw(0x4AE, 0x0007); /* wiki実測の既定値をそのまま使う */
}

/* 使い終わったら必ず戻す(wiki: 戻し忘れると以降の普通の書き込みが
 * EGCを通ったままになる)。 */
static void p98__egc_disable(void) {
    p98__outb(0x7C, 0x00);
}

static void p98__draw_sprite_impl(const p98_sprite_t *spr, int x, int y, p98_sprite_backend_t backend) {
    int srcStride;
    int shift;
    int startByte;
    int destByteCount;
    int row;
    int egcActive = 0;

    if (!spr || spr->w <= 0 || spr->h <= 0) return;
    if (y + spr->h <= 0 || y >= P98_SCREEN_H) return;

    srcStride = (spr->w + 7) >> 3;
    shift = ((x % 8) + 8) % 8;
    startByte = (x - shift) >> 3; /* 負になり得る(整数除算は shift済みなので割り切れる) */
    destByteCount = srcStride + (shift ? 1 : 0);

    for (row = 0; row < spr->h; row++) {
        int scrY = y + row;
        unsigned rowOff;
        int db;

        if (scrY < 0 || scrY >= P98_SCREEN_H) continue;
        rowOff = (unsigned)(scrY * P98_BYTES_PER_LINE);

        for (db = 0; db < destByteCount; db++) {
            int destByteIdx = startByte + db;
            int srcLo = db;      /* 現在の出力バイトの上位ビットへ寄与するソースバイト */
            int srcHi = db - 1;  /* 前のソースバイトの下位ビットが今回の出力バイトの下位側へ回り込む */
            unsigned char maskLo, maskHi, maskByte;
            unsigned char bits[4];
            unsigned off;
            int p;

            if (destByteIdx < 0 || destByteIdx >= P98_BYTES_PER_LINE) continue;

            maskLo = (srcLo >= 0 && srcLo < srcStride) ? spr->mask[row * srcStride + srcLo] : 0;
            maskHi = (srcHi >= 0 && srcHi < srcStride) ? spr->mask[row * srcStride + srcHi] : 0;
            maskByte = (unsigned char)((shift ? (maskLo >> shift) : maskLo) | (shift ? (unsigned char)(maskHi << (8 - shift)) : 0));
            if (maskByte == 0) continue; /* このバイトは全ドット透明 */

            off = rowOff + (unsigned)destByteIdx;
            for (p = 0; p < 4; p++) {
                const unsigned char *plane = spr->planes[p];
                unsigned char lo = (srcLo >= 0 && srcLo < srcStride) ? plane[row * srcStride + srcLo] : 0;
                unsigned char hi = (srcHi >= 0 && srcHi < srcStride) ? plane[row * srcStride + srcHi] : 0;
                bits[p] = (unsigned char)((shift ? (lo >> shift) : lo) | (shift ? (unsigned char)(hi << (8 - shift)) : 0));
            }

            if (backend == P98_SPRITE_EGC && maskByte == 0xFF
                && bits[0] == bits[1] && bits[1] == bits[2] && bits[2] == bits[3]) {
                if (!egcActive) { p98__egc_enable(); egcActive = 1; }
                p98__pokeb(p98__plane_seg[0], off, bits[0]);
            } else {
                if (egcActive) { p98__egc_disable(); egcActive = 0; }
                for (p = 0; p < 4; p++) {
                    p98__blend_bits(p98__plane_seg[p], off, bits[p], maskByte);
                }
            }
        }
    }

    if (egcActive) p98__egc_disable();
}

void p98_draw_sprite(const p98_sprite_t *spr, int x, int y) {
    p98__draw_sprite_impl(spr, x, y, p98__sprite_backend);
}

void p98_draw_sprite_ex(const p98_sprite_t *spr, int x, int y, p98_sprite_backend_t backend) {
    p98__draw_sprite_impl(spr, x, y, backend);
}

/* p98_init()より前に呼ぶこと(p98_init()の中で1回だけ参照される)。
 * enable=0でテキスト画面消去・カーソル非表示を無効化する(利用者が
 * テキストを重ねて使いたい場合向け。既定は有効=1)。 */
void p98_set_hide_text_on_init(int enable) {
    p98__hide_text_on_init = (unsigned char)(enable ? 1 : 0);
}

void p98_set_sprite_backend(p98_sprite_backend_t backend) {
    p98__sprite_backend = backend;
}

p98_sprite_backend_t p98_get_sprite_backend(void) {
    return p98__sprite_backend;
}

/* =====================================================================
 * 背景ページ+差分復帰(EGC活用、2026-09)
 *
 * 使い捨てプローブ(tests/probe_egc_crosspage.c、コミットには残していない)
 * で、次のことを実測して確認した: commit bfa527bで確認した「EGCのシフト・
 * マスクは読んでから書けば機能する」手順(access=0,fgbg=0,ope=0x08F0,
 * mask=0xFFFF,bg=0,sft=0[シフト無し])は、**読みと書きの間にページ切替
 * (ポート0xA6)を挟んでも機能する**。具体的には、ページ1のB/R/G/Iプレーンへ
 * 別々の値(0xAA55/0x55AA/0xF00F/0x0FF0)を書いておき、ページ1へ切り替えて
 * 1ワード読み、ページ0へ切り替えて1ワード書く、という手順で、ページ0の
 * 4プレーンに元の値が正しくコピーされることを確認した。つまりEGCの
 * シフトパイプラインのラッチは、ページバンク切替(0xA6)とは独立した
 * 別のハードウェアであり、「背景ページを読んで、画面ページへ書く」という
 * VRAM→VRAMコピーが1ワードあたり1回の読み+1回の書き(+ページ切替2回)で
 * 実現できる。
 * =====================================================================
 */

/* 矩形(byteX,y)-(byteX+byteW,y+h)を「背景ページ→画面ページ」へコピーする。
 * byteX/byteWはバイト単位、byteWは偶数(ワード単位)であること(呼び出し側
 * =p98_draw_sprite_diff()が外側へ切り上げて保証する)。EGCの有効化/無効化を
 * 矩形1回ぶんまとめて行う。 */
static void p98__egc_restore_rect(int byteX, int y, int byteW, int h) {
    int row, col;
    int wordCount = byteW >> 1;
    if (byteW <= 0 || h <= 0) return;

    p98__outb(0x7C, 0x80);
    p98__outb(0x6A, 0x07);
    p98__outb(0x6A, 0x05);
    p98__egc_outw(0x4A0, 0x0000); /* access: 全プレーン有効(負論理0=有効) */
    p98__egc_outw(0x4A2, 0x0000); /* fgbg */
    p98__egc_outw(0x4A4, 0x08F0); /* ope: シフトモード+転送元そのまま(bfa527b実測) */
    p98__egc_outw(0x4A8, 0xFFFF); /* mask: 全ビット */
    p98__egc_outw(0x4AA, 0x0000); /* bg */
    p98__egc_outw(0x4AC, 0x0000); /* sft: srcbit=dstbit=0(シフト無し、バイト境界に揃えてある前提) */
    p98__egc_outw(0x4AE, 0x000F); /* leng: 1ワード分 */

    for (row = 0; row < h; row++) {
        unsigned rowOff = (unsigned)((y + row) * P98_BYTES_PER_LINE + byteX);
        for (col = 0; col < wordCount; col++) {
            unsigned off = rowOff + (unsigned)(col * 2);
            unsigned val;
            p98__outb(P98_PORT_DRAW_PAGE, p98__bg_page);
            val = p98__peekw(P98_SEG_PLANE_B, off);
            p98__outb(P98_PORT_DRAW_PAGE, p98__screen_page);
            p98__pokew(P98_SEG_PLANE_B, off, val);
        }
    }

    p98__outb(0x7C, 0x00); /* 使い終わったら必ず戻す */
    /* 読み書きの最後は画面ページのはずだが、念のため確定させておく
     * (この後すぐp98_draw_sprite()が画面ページへ描く前提のため)。 */
    p98__outb(P98_PORT_DRAW_PAGE, p98__screen_page);
}

void p98_draw_sprite_diff(const p98_sprite_t *spr, int x, int y) {
    if (p98__render_mode != P98_RENDER_BGPAGE) {
        /* 背景ページが無いモードでは復元できないため、普通に描くだけに
         * フォールバックする(呼び出し側のコードを分岐させずに済む)。 */
        p98_draw_sprite(spr, x, y);
        return;
    }
    if (!spr || spr->w <= 0 || spr->h <= 0) return;

    if (p98__diff_valid) {
        p98__egc_restore_rect(p98__diff_byte_x, p98__diff_y, p98__diff_byte_w, p98__diff_h);
    }

    p98_draw_sprite(spr, x, y);

    {
        int x0 = x, y0 = y, x1 = x + spr->w, y1 = y + spr->h;
        if (x0 < 0) x0 = 0;
        if (y0 < 0) y0 = 0;
        if (x1 > P98_SCREEN_W) x1 = P98_SCREEN_W;
        if (y1 > P98_SCREEN_H) y1 = P98_SCREEN_H;
        if (x0 < x1 && y0 < y1) {
            int byteX = x0 >> 3;
            int byteX1 = (x1 + 7) >> 3;      /* 外側(右)へ切り上げ */
            int byteW = byteX1 - byteX;
            if (byteW & 1) byteW++;           /* ワード境界(偶数バイト)へ切り上げ */
            if (byteX + byteW > P98_BYTES_PER_LINE) byteW = P98_BYTES_PER_LINE - byteX;
            p98__diff_byte_x = byteX;
            p98__diff_y = y0;
            p98__diff_byte_w = byteW;
            p98__diff_h = y1 - y0;
            p98__diff_valid = (byteW > 0) ? 1 : 0;
        } else {
            p98__diff_valid = 0;
        }
    }
}

/* 背景ページの内容を画面ページへ丸ごとコピーする(2026-09、docs/design.md
 * 「背景ページ→画面ページのまるごとコピー」節参照)。P98_RENDER_BGPAGEモード
 * でないときは何もしない(復元元が無いため)。
 *
 * 画面全体(P98_BYTES_PER_LINE×P98_SCREEN_H=80×400=32000バイト=16000ワード)は
 * ページ内でオフセットが連続している(行の継ぎ目に隙間が無い)ため、
 * srcOff=dstOff=0・wordCount=16000を1回p98__egc_copy_page()へ渡すだけで
 * 画面全体をカバーできる。EGCの設定はp98__egc_restore_rect()と同じ
 * (access=0,fgbg=0,ope=0x08F0,mask=0xFFFF,bg=0,sft=0,leng=0x000F)。 */
void p98_copy_bgpage_to_screen(void) {
    unsigned wordCount;
    if (p98__render_mode != P98_RENDER_BGPAGE) return;

    p98__outb(0x7C, 0x80);
    p98__outb(0x6A, 0x07);
    p98__outb(0x6A, 0x05);
    p98__egc_outw(0x4A0, 0x0000); /* access: 全プレーン有効(負論理0=有効) */
    p98__egc_outw(0x4A2, 0x0000); /* fgbg */
    p98__egc_outw(0x4A4, 0x08F0); /* ope: シフトモード+転送元そのまま(p98__egc_restore_rectと同じ) */
    p98__egc_outw(0x4A8, 0xFFFF); /* mask: 全ビット */
    p98__egc_outw(0x4AA, 0x0000); /* bg */
    p98__egc_outw(0x4AC, 0x0000); /* sft: srcbit=dstbit=0(バイト境界に揃っている) */
    p98__egc_outw(0x4AE, 0x000F); /* leng: 1ワード分 */

    wordCount = (unsigned)((P98_BYTES_PER_LINE * P98_SCREEN_H) / 2);
    p98__egc_copy_page((unsigned)P98_SEG_PLANE_B, 0, 0, wordCount, p98__bg_page, p98__screen_page);

    p98__outb(0x7C, 0x00); /* 使い終わったら必ず戻す */
    /* 読み書きの最後は画面ページのはずだが、念のため確定させておく
     * (p98__egc_restore_rect()と同じ理由)。 */
    p98__outb(P98_PORT_DRAW_PAGE, p98__screen_page);
}

/* =====================================================================
 * EGCによる本来のスプライト転送(2026-09後半、docs/design.md参照)
 *
 * p98__egc_restore_rect() が使っているope=0x08F0(シフトモード+転送元そのまま)
 * を、行ごとの矩形コピーではなくスプライトの1行転送そのものに本来の形で
 * 使う経路。実測で確認した以下の性質を前提にする:
 *   - leng(0x4AE)は「合計ドット予算」として働き、シフトで先頭・末尾に
 *     はみ出す分は書き込み先の元の値が保護される(EGC有効化は
 *     p98_draw_sprite_vram()呼び出し1回につき1回だけでよい)。
 *   - opeの下位8bit(0xF0=そのまま/0xC0=AND/0xFC=OR)は、シフトモードの
 *     bit(0x0800)を保ったままope/sft/lengの再設定だけでパスを切り替えられる
 *     (EGC自体=ポート0x7Cを2パスの間で無効化してはいけない)。
 * ===================================================================== */

/* VRAM置き場(P98_VRAM_STORE_OFF起点、1プレーンあたりP98_VRAM_STORE_SIZE
 * バイト)のバンプ割り当て。個別解放はできず、p98_vram_reset()で先頭へ
 * 戻すことだけできる(design方針。ヘッダのコメント参照)。 */
static unsigned p98__vram_used = 0;

/* 現在CPUから見えている描画ページを返す(flipモードはp98__draw_page、
 * bgpageモードはp98__draw_targetに応じてscreen/bgのどちらか)。
 * p98_vram_upload()がページ0・1の両方へ書いた後、元のページへ確実に
 * 戻すために使う。 */
static unsigned char p98__current_draw_page(void) {
    if (p98__render_mode == P98_RENDER_BGPAGE) {
        return (p98__draw_target == P98_TARGET_BACKGROUND) ? p98__bg_page : p98__screen_page;
    }
    return p98__draw_page;
}

/* bytes(+末尾1ワードの余裕)ぶんを置き場から切り出す。余裕を必ず残すのは、
 * p98_draw_sprite_vram()のEGC転送がdstbit!=0のとき1行あたり1ワード
 * 多く「転送元」を読み出すことがあり(leng=合計ドット予算のため書き込みは
 * 保護されるが、読み出し自体はワード単位で行われる。実測で確認済み)、
 * 最後に確保したブロックの末尾がP98_VRAM_STORE_SIZE(=768、オフセット
 * 32768)を超えて読み出されないようにするため。 */
static int p98__vram_alloc(unsigned bytes, unsigned *outOff) {
    unsigned need = (unsigned)(bytes + 2);
    if ((unsigned)(p98__vram_used + need) > P98_VRAM_STORE_SIZE) return -1;
    *outOff = p98__vram_used;
    p98__vram_used = (unsigned)(p98__vram_used + need);
    return 0;
}

void p98_vram_reset(void) {
    p98__vram_used = 0;
}

int p98_vram_free_bytes(void) {
    return (int)(P98_VRAM_STORE_SIZE - p98__vram_used);
}

/* 絵(4プレーン)をVRAMへ書き込む。opaque(全ドット不透明)ならプレーンの
 * 内容をそのまま書けばよいが、透明ドットがある場合は
 * planes[p][i] & mask[i] にしてから書く。
 *
 * なぜANDが要るか: EGCの2パス方式は「パス1でAND転送して透明ドットぶん
 * だけ背景を0にし、パス2でOR転送で絵を重ねる」という手順で、これは
 * マスクが0(透明)の位置では絵のビットも0であることに依存する。CPU経路
 * (p98__blend_bits)はマスクでビット単位に選択するのでこの前提を必要と
 * しないが、素材によっては透明部分に0以外のビットが残っていることが
 * あり、その場合そのままVRAMへ書くとパス2のORで背景に絵のゴミが乗って
 * しまい、CPU経路と結果がずれる。
 *
 * 2026-09の実測(tests/probe_vram_upload_bytes.c参照): 以前はここで
 * 「plane[i]&mask[i](opaqueならplane[i]そのまま)をメインメモリの静的な
 * 作業用バッファへ組み立てるか、あるいはspr->planes[p]のアドレスを
 * そのまま、huge modelのfar pointerに変換してまとめてcopy_far_to_vram()へ
 * 渡す」実装だったが、この「大きい静的配列のアドレスをfar pointerへ
 * 変換する」処理が、ライブラリ内の無関係な静的データの増減で配置が
 * 変わると壊れることが分かった(作業用バッファを読み出せば中身は正しい
 * =AND計算自体は正しいのに、そのアドレスをfar pointer化して
 * copy_far_to_vram()へ渡すとDOSの環境ブロック相当の無関係なメモリを
 * 読んでしまう)。walk2(samples/walk2.c)の見た目が無関係な変更で
 * 変わったのはこれが原因だった(非opaque経路で先に発見したが、opaque
 * 経路も同じp98__copy_far_to_vram()を使っていた以上、同じ地雷を抱えて
 * いた。たまたまその時点の配置では症状が出ていなかっただけ)。
 *
 * 対策として、作業用バッファは持たず、opaque/非opaqueとも
 * plane[i](&mask[i])を1バイトずつp98__pokeb()で直接VRAMへ書く。
 * p98__pokeb()はコンパイル時定数のセグメント(p98__plane_seg[p])と
 * 計算済みオフセットだけを使い、「大きい静的配列のアドレスをfar pointerに
 * 変換する」という壊れていた操作を経由しない(このファイルの他のVRAM
 * 書き込み(p98__blend_bits等)で既に使われている、実績のある経路と同じ)。
 * これにより p98__copy_far_to_vram() は呼び出し元が無くなり、撤去した
 * (src/p98_asm.asmから_p98__copy_far_to_vramも削除済み)。
 *
 * この書き方は元のrep movsb(まとめて転送)よりアップロード自体は遅く
 * なっている。walk2はコマが変わるたびにp98_vram_reupload()で置き直す
 * ため、そのコストをtests/probe_vram_upload_bench.c/docs/verify-log.mdで
 * 実測してある。 */
/* 2026-09後半、4プレーンぶんを1バイトずつp98__pokeb()でfar callしていた
 * (呼び出し回数=バイト数×4プレーン)のを、p98__pokew4()で「4プレーン×
 * 1ワード(2バイト)」を1回のfar callへまとめる形に変えた(実測9.56ms→
 * 詳細はdocs/design.md/docs/verify-log.md参照)。Cのポインタをasmへ渡す
 * 経路は復活させておらず、4プレーンぶんの2バイトはCでunsignedへ組み立てて
 * から渡す(p98__pokew4の引数はコンパイル時定数のセグメントと計算済み
 * オフセット・値のみで、ポインタは含まない)。
 *
 * spr->w は16の倍数固定(p98_vram_upload()の入口チェック)なので、
 * rowBytes=words*2は常に偶数、pixBytes(=rowBytes*h)も常に偶数になり、
 * 実際には奇数バイトの余りは発生しない。ただし将来の変更で崩れても
 * 静かに1バイト読み落とさないよう、念のため奇数側のフォールバック
 * (p98__pokebで1バイトずつ)を残してある。 */
static void p98__vram_write_pixel_words(unsigned dstOff, const p98_sprite_t *spr, int pixBytes, unsigned char opaque) {
    const unsigned char *pB = spr->planes[0];
    const unsigned char *pR = spr->planes[1];
    const unsigned char *pG = spr->planes[2];
    const unsigned char *pI = spr->planes[3];
    const unsigned char *mask = spr->mask;
    int wordCount = pixBytes >> 1;
    int i;

    for (i = 0; i < wordCount; i++) {
        int b0 = i * 2, b1 = b0 + 1;
        unsigned char m0 = opaque ? 0xFF : mask[b0];
        unsigned char m1 = opaque ? 0xFF : mask[b1];
        unsigned wB = (unsigned)(unsigned char)(pB[b0] & m0) | ((unsigned)(unsigned char)(pB[b1] & m1) << 8);
        unsigned wR = (unsigned)(unsigned char)(pR[b0] & m0) | ((unsigned)(unsigned char)(pR[b1] & m1) << 8);
        unsigned wG = (unsigned)(unsigned char)(pG[b0] & m0) | ((unsigned)(unsigned char)(pG[b1] & m1) << 8);
        unsigned wI = (unsigned)(unsigned char)(pI[b0] & m0) | ((unsigned)(unsigned char)(pI[b1] & m1) << 8);
        p98__pokew4((unsigned)(dstOff + (unsigned)(i * 2)), wB, wR, wG, wI);
    }
    if (pixBytes & 1) {
        int b = wordCount * 2;
        unsigned char m = opaque ? 0xFF : mask[b];
        unsigned off = (unsigned)(dstOff + (unsigned)b);
        p98__pokeb(p98__plane_seg[0], off, (unsigned char)(pB[b] & m));
        p98__pokeb(p98__plane_seg[1], off, (unsigned char)(pR[b] & m));
        p98__pokeb(p98__plane_seg[2], off, (unsigned char)(pG[b] & m));
        p98__pokeb(p98__plane_seg[3], off, (unsigned char)(pI[b] & m));
    }
}

static void p98__vram_upload_pixels(unsigned pixOff, const p98_sprite_t *spr, int pixBytes, unsigned char opaque) {
    unsigned dstOff = (unsigned)(P98_VRAM_STORE_OFF + pixOff);

    p98__outb(P98_PORT_DRAW_PAGE, 0);
    p98__vram_write_pixel_words(dstOff, spr, pixBytes, opaque);
    p98__outb(P98_PORT_DRAW_PAGE, 1);
    p98__vram_write_pixel_words(dstOff, spr, pixBytes, opaque);
}

/* 反転マスク(~spr->mask)を4プレーン(同一内容)へ、ページ0・ページ1の
 * 両方へ書く。p98_draw_sprite_vram()のパス1(ope=AND)がこの反転マスクで
 * 「これから描くドットぶんだけ背景を0にする」ために使う。
 *
 * p98__vram_write_pixel_words()と同じ理由でp98__pokew4()にまとめている
 * (4プレーンとも同じ値になるため、4引数すべてに同じワードを渡す)。 */
static void p98__vram_write_mask_words(unsigned dstOff, const unsigned char *mask, int pixBytes) {
    int wordCount = pixBytes >> 1;
    int i;

    for (i = 0; i < wordCount; i++) {
        int b0 = i * 2, b1 = b0 + 1;
        unsigned char v0 = (unsigned char)~mask[b0];
        unsigned char v1 = (unsigned char)~mask[b1];
        unsigned w = (unsigned)v0 | ((unsigned)v1 << 8);
        p98__pokew4((unsigned)(dstOff + (unsigned)(i * 2)), w, w, w, w);
    }
    if (pixBytes & 1) {
        int b = wordCount * 2;
        unsigned char v = (unsigned char)~mask[b];
        unsigned off = (unsigned)(dstOff + (unsigned)b);
        p98__pokeb(p98__plane_seg[0], off, v);
        p98__pokeb(p98__plane_seg[1], off, v);
        p98__pokeb(p98__plane_seg[2], off, v);
        p98__pokeb(p98__plane_seg[3], off, v);
    }
}

static void p98__vram_store_inverted_mask(unsigned maskOff, const unsigned char *mask, int pixBytes) {
    unsigned dstOff = (unsigned)(P98_VRAM_STORE_OFF + maskOff);

    p98__outb(P98_PORT_DRAW_PAGE, 0);
    p98__vram_write_mask_words(dstOff, mask, pixBytes);
    p98__outb(P98_PORT_DRAW_PAGE, 1);
    p98__vram_write_mask_words(dstOff, mask, pixBytes);
}

/* sprのmaskがpixBytesぶん全バイト0xFF(=全ドット不透明)かどうか。 */
static unsigned char p98__vram_is_opaque(const p98_sprite_t *spr, int pixBytes) {
    int i;
    for (i = 0; i < pixBytes; i++) {
        if (spr->mask[i] != 0xFF) return 0;
    }
    return 1;
}

int p98_vram_upload(const p98_sprite_t *spr, p98_vram_sprite_t *out) {
    int words, rowBytes, pixBytes;
    unsigned pixOff, maskOff = 0;
    unsigned char opaque;
    unsigned char curPage;

    if (!spr || !out || spr->w <= 0 || spr->h <= 0) return -1;
    if (spr->w % 16 != 0) return -1;

    words = spr->w / 16;
    rowBytes = words * 2; /* = spr->w/8。mask/planeの1行バイト数(ceil(w/8))と
                            * 幅が16の倍数なので一致する */
    pixBytes = rowBytes * spr->h;

    opaque = p98__vram_is_opaque(spr, pixBytes);

    if (p98__vram_alloc((unsigned)pixBytes, &pixOff) != 0) return -2;
    if (!opaque) {
        if (p98__vram_alloc((unsigned)pixBytes, &maskOff) != 0) return -2;
    }

    p98__egc_disable(); /* アップロードは普通のCPU書き込みなので念のため無効化 */
    curPage = p98__current_draw_page();

    p98__vram_upload_pixels(pixOff, spr, pixBytes, opaque);

    if (!opaque) {
        p98__vram_store_inverted_mask(maskOff, spr->mask, pixBytes);
    }

    p98__outb(P98_PORT_DRAW_PAGE, curPage);

    out->src = spr;
    out->w = spr->w;
    out->h = spr->h;
    out->words = words;
    out->pixOff = pixOff;
    out->maskOff = maskOff;
    out->opaque = opaque;
    return 0;
}

int p98_vram_reupload(p98_vram_sprite_t *vs, const p98_sprite_t *spr) {
    int words, rowBytes, pixBytes;
    unsigned char opaque;
    unsigned char curPage;

    if (!vs || !spr || spr->w <= 0 || spr->h <= 0) return -1;
    if (spr->w != vs->w || spr->h != vs->h) return -1;
    if (spr->w % 16 != 0) return -1;

    words = spr->w / 16;
    if (words != vs->words) return -1;
    rowBytes = words * 2;
    pixBytes = rowBytes * spr->h;

    opaque = p98__vram_is_opaque(spr, pixBytes);
    if (opaque != vs->opaque) return -1;

    p98__egc_disable();
    curPage = p98__current_draw_page();

    p98__vram_upload_pixels(vs->pixOff, spr, pixBytes, opaque);

    if (!opaque) {
        p98__vram_store_inverted_mask(vs->maskOff, spr->mask, pixBytes);
    }

    p98__outb(P98_PORT_DRAW_PAGE, curPage);
    vs->src = spr;
    return 0;
}

void p98_draw_sprite_vram(const p98_vram_sprite_t *vs, int x, int y) {
    int dstbit, wordX, leng, sft, destWords, row;
    unsigned rowStride, dstBase;

    if (!vs) return;
    if (x < 0 || x + vs->w > P98_SCREEN_W) {
        /* 横方向のクリップはこの経路では扱わない(置き場が行単位の単純な
         * バンプ割り当てで、部分転送のためのオフセット計算をサポート
         * していないため)。見た目をCPU経路と常に一致させるため、
         * クリップが要るケースはそのままp98_draw_sprite()へ戻す。 */
        if (vs->src) p98_draw_sprite(vs->src, x, y);
        return;
    }
    if (vs->w <= 0 || vs->h <= 0) return;

    dstbit = x & 15;
    wordX = x >> 4;
    leng = vs->w - 1;      /* leng=転送ドット数-1(合計ドット予算) */
    sft = dstbit << 4;     /* srcbit=0固定(置き場は常にワード境界から始まる) */
    destWords = vs->words + (dstbit ? 1 : 0);
    rowStride = (unsigned)(vs->words * 2);

    p98__outb(0x7C, 0x80);
    p98__outb(0x6A, 0x07);
    p98__outb(0x6A, 0x05);
    p98__egc_outw(0x4A0, 0x0000); /* access: 全プレーン書き込み */
    p98__egc_outw(0x4A2, 0x0000); /* fgbg */
    p98__egc_outw(0x4A8, 0xFFFF); /* mask: 全ビット */
    p98__egc_outw(0x4AA, 0x0000); /* bg */
    p98__egc_outw(0x4AC, (unsigned)sft);
    p98__egc_outw(0x4AE, (unsigned)leng);

    if (!vs->opaque) {
        /* パス1: 反転マスクをAND転送し、これから描くドットぶんだけ背景を
         * 0にする。ope/sft/lengの再設定だけでパスを切り替え、EGC自体
         * (ポート0x7C)は無効化しない(実測: 切ると設定が失われる)。 */
        p98__egc_outw(0x4A4, 0x08C0); /* ope: シフトモード+AND */
        for (row = 0; row < vs->h; row++) {
            int scrY = y + row;
            unsigned srcOff;
            if (scrY < 0 || scrY >= P98_SCREEN_H) continue; /* 縦方向は行単位でクリップ */
            srcOff = (unsigned)(P98_VRAM_STORE_OFF + vs->maskOff + (unsigned)row * rowStride);
            dstBase = (unsigned)((unsigned)scrY * P98_BYTES_PER_LINE + (unsigned)wordX * 2);
            p98__egc_row(P98_SEG_PLANE_B, srcOff, dstBase, (unsigned)destWords);
        }
    }

    /* パス2(不透明なら唯一のパス): 絵を転送する。不透明時はope=そのまま
     * (0x08F0)、透明ドットがある場合はパス1で0にした跡へOR(0x08FC)する。 */
    p98__egc_outw(0x4A4, vs->opaque ? 0x08F0 : 0x08FC);
    for (row = 0; row < vs->h; row++) {
        int scrY = y + row;
        unsigned srcOff;
        if (scrY < 0 || scrY >= P98_SCREEN_H) continue;
        srcOff = (unsigned)(P98_VRAM_STORE_OFF + vs->pixOff + (unsigned)row * rowStride);
        dstBase = (unsigned)((unsigned)scrY * P98_BYTES_PER_LINE + (unsigned)wordX * 2);
        p98__egc_row(P98_SEG_PLANE_B, srcOff, dstBase, (unsigned)destWords);
    }

    p98__outb(0x7C, 0x00); /* 使い終わったら必ず無効化する */
}

void p98_draw_sprite_vram_diff(const p98_vram_sprite_t *vs, int x, int y) {
    if (p98__render_mode != P98_RENDER_BGPAGE) {
        /* p98_draw_sprite_diff()と同じ理由でフォールバックする
         * (背景ページが無いモードでは復元できないため)。 */
        p98_draw_sprite_vram(vs, x, y);
        return;
    }
    if (!vs || vs->w <= 0 || vs->h <= 0) return;

    if (p98__diff_valid) {
        p98__egc_restore_rect(p98__diff_byte_x, p98__diff_y, p98__diff_byte_w, p98__diff_h);
    }

    p98_draw_sprite_vram(vs, x, y);

    /* 以下はp98_draw_sprite_diff()と全く同じ矩形計算(差分復帰の状態変数を
     * 共有する)。描画部分だけp98_draw_sprite_vram()に差し替えてある。 */
    {
        int x0 = x, y0 = y, x1 = x + vs->w, y1 = y + vs->h;
        if (x0 < 0) x0 = 0;
        if (y0 < 0) y0 = 0;
        if (x1 > P98_SCREEN_W) x1 = P98_SCREEN_W;
        if (y1 > P98_SCREEN_H) y1 = P98_SCREEN_H;
        if (x0 < x1 && y0 < y1) {
            int byteX = x0 >> 3;
            int byteX1 = (x1 + 7) >> 3;      /* 外側(右)へ切り上げ */
            int byteW = byteX1 - byteX;
            if (byteW & 1) byteW++;           /* ワード境界(偶数バイト)へ切り上げ */
            if (byteX + byteW > P98_BYTES_PER_LINE) byteW = P98_BYTES_PER_LINE - byteX;
            p98__diff_byte_x = byteX;
            p98__diff_y = y0;
            p98__diff_byte_w = byteW;
            p98__diff_h = y1 - y0;
            p98__diff_valid = (byteW > 0) ? 1 : 0;
        } else {
            p98__diff_valid = 0;
        }
    }
}

/* =====================================================================
 * キーボード公開API
 * ===================================================================== */

void p98_poll(void) {
    int g;
    for (g = 0; g < P98_KBD_GROUPS; g++) {
        unsigned char mask = p98__kbd_sense((unsigned char)g);
        p98__key_pressed_snap[g] = (unsigned char)(mask & (unsigned char)~p98__key_prev_down[g]);
        p98__key_prev_down[g] = mask;
        p98__key_cur_down[g] = mask;
    }
}

int p98_key_down(int scancode) {
    if (scancode < 0 || scancode > 127) return 0;
    return (p98__key_cur_down[scancode >> 3] >> (scancode & 7)) & 1;
}

int p98_key_pressed(int scancode) {
    if (scancode < 0 || scancode > 127) return 0;
    return (p98__key_pressed_snap[scancode >> 3] >> (scancode & 7)) & 1;
}

int p98_key_getch(void) {
    if (p98__kbd_peek() == 0) return 0;
    return (int)p98__kbd_get();
}
