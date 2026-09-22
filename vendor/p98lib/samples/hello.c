/* p98lib の最小サンプル。画面を初期化し、色5の矩形を1つ描いて
 * flipし、しばらくVSYNCを数えたあとquitする。 */
#include "p98.h"

int main(void) {
    int i;

    p98_init();
    p98_clear(0);
    p98_fill_rect(100, 50, 200, 80, 5);
    p98_flip();

    for (i = 0; i < 60; i++) {
        p98_wait_vsync();
    }

    p98_quit();
    return 0;
}
