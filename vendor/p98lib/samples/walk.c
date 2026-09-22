/* p98lib の使い勝手を点検するための、動くデモ。
 *
 * 内容: 背景(横1本のバンド+装飾矩形2つ)の上を、方向キーでキャラクタ
 * (8x8の単色シルエット)が動く。SPACEキーで色が変わる。ESCで終了する。
 *
 * 実装方針(意図的に単純にした): 毎フレーム「背景を全部描き直す→キャラを
 * 現在位置に描く→p98_flip()」を繰り返す(差分だけを更新する「dirty rect」
 * 方式は使わない)。理由は docs/design.md の「使い勝手で気づいた点」参照:
 * p98lib は背景の退避・復元を一切面倒みてくれないため、利用者が自分で
 * 「キャラが動いたら元の場所を背景で上書きする」処理を書く必要がある。
 * 今回は最も単純な対策(毎フレーム背景を全部描き直す)を採ったが、これは
 * 矩形塗りだけの軽い背景だから成立する方法であり、背景が複雑・重い場合には
 * 別の対策(差分更新やオフスクリーン合成)が要るはずで、p98libはそちらを
 * 支援するAPIを持たない。
 *
 * スプライトの色を変える方法: p98_sprite_t のフィールドを実行時に書き換える
 * のではなく、色ごとに static const の p98_sprite_t を用意して切り替える
 * (理由は同じく docs/design.md 参照。SmallerC huge modelでの実行時の構造体
 * フィールド代入は今回のスコープの他のコードで一度も使っておらず、
 * 未検証のパターンを新規に持ち込みたくなかったため安全側に倒した)。
 *
 * scancode は docs/design.md の実測済みの対応表をそのまま使う:
 *   UP=0x3A, RIGHT=0x3C, DOWN=0x3D, LEFT=0x3B (group7)
 *   SPACE=0x34 (group6)
 *   ESC=0x00 (group0)
 */
#include "p98.h"

#define SCREEN_W 640
#define SCREEN_H 400

#define CHAR_W 8
#define CHAR_H 8
#define STEP   24  /* 8の倍数(=1バイト境界)に揃えている。必須ではないが、
                     * VRAMを直接見て検証する tools/verify.mjs 側の計算を
                     * 単純にするための、このデモ独自の都合。 */

#define BAND_Y     16
#define BAND_H     CHAR_H
#define BAND_COLOR 10 /* 赤+輝度 */

#define SC_UP    0x3A
#define SC_RIGHT 0x3C
#define SC_DOWN  0x3D
#define SC_LEFT  0x3B
#define SC_SPACE 0x34
#define SC_ESC   0x00

/* 8x8、MSBが左端。適当な「顔」っぽい形にしてあるだけで、絵の意味は無い。 */
static const unsigned char CHAR_SHAPE[CHAR_H] = {
    0x3C, 0x7E, 0xFF, 0xDB, 0xFF, 0x66, 0x3C, 0x18
};
static const unsigned char CHAR_ZERO[CHAR_H] = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

/* 色ごとに静的な p98_sprite_t を用意する(実行時のフィールド代入はしない)。
 * planes[0..3] = 青・赤・緑・輝度。color のビットが立っている面だけ
 * CHAR_SHAPE(=maskと同じ形)を、立っていない面は CHAR_ZERO を渡す。 */
static const p98_sprite_t SPR_WHITE   = { CHAR_W, CHAR_H, { CHAR_SHAPE, CHAR_SHAPE, CHAR_SHAPE, CHAR_SHAPE }, CHAR_SHAPE }; /* 15 */
static const p98_sprite_t SPR_MAGENTA = { CHAR_W, CHAR_H, { CHAR_SHAPE, CHAR_SHAPE, CHAR_ZERO,  CHAR_ZERO  }, CHAR_SHAPE }; /* 3: 青+赤 */
static const p98_sprite_t SPR_CYAN    = { CHAR_W, CHAR_H, { CHAR_ZERO,  CHAR_ZERO,  CHAR_SHAPE, CHAR_SHAPE }, CHAR_SHAPE }; /* 12: 緑+輝度 */
static const p98_sprite_t SPR_YELLOW  = { CHAR_W, CHAR_H, { CHAR_ZERO,  CHAR_SHAPE, CHAR_SHAPE, CHAR_ZERO  }, CHAR_SHAPE }; /* 6: 赤+緑 */

static const p98_sprite_t * const CHAR_SPRITES[4] = { &SPR_WHITE, &SPR_MAGENTA, &SPR_CYAN, &SPR_YELLOW };

static void draw_background(void) {
    p98_clear(0);
    p98_fill_rect(0, BAND_Y, SCREEN_W, BAND_H, BAND_COLOR);
    p98_fill_rect(300, 150, 120, 80, 5);  /* 装飾: 青+緑 */
    p98_fill_rect(450, 250, 100, 70, 12); /* 装飾: 緑+輝度 */
}

int main(void) {
    int cx = 16, cy = BAND_Y;
    int colorIdx = 0;
    unsigned int frame = 0; /* 移動を4フレームに1回へ間引くためのカウンタ */
    int running = 1;

    p98_init();

    while (running) {
        p98_wait_vsync();
        p98_poll();
        frame++;

        /* SPACEの色替えはp98_key_pressed(押した瞬間のみ)のままにする。
         * p98_key_downにすると押しっぱなしで高速に色が変わり続けてしまう。 */
        if (p98_key_pressed(SC_SPACE)) {
            colorIdx = (colorIdx + 1) % 4;
        }
        /* 移動はp98_key_down(押している間ずっと真)にし、押しっぱなしで
         * 歩き続けられるようにした。ただし毎VSYNCで16px動くと速すぎるため、
         * 4フレームに1回だけ移動判定する。 */
        if (frame % 4 == 0) {
            if (p98_key_down(SC_RIGHT) && cx + STEP <= SCREEN_W - CHAR_W) cx += STEP;
            if (p98_key_down(SC_LEFT)  && cx - STEP >= 0)                cx -= STEP;
            if (p98_key_down(SC_DOWN)  && cy + STEP <= SCREEN_H - CHAR_H) cy += STEP;
            if (p98_key_down(SC_UP)    && cy - STEP >= 0)                 cy -= STEP;
        }
        if (p98_key_down(SC_ESC)) running = 0;

        draw_background();
        p98_draw_sprite(CHAR_SPRITES[colorIdx], cx, cy);
        p98_flip();
    }

    p98_quit();
    return 0;
}
