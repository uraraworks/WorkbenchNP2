#include <stdio.h>

/* toolchain/compile-core.mjs の opts.extraLinkInputs (別ファイルの.asmをELFオブジェクト化して
   リンクする経路)の実行検証用サンプル。asm_marker()の実体は samples/link-probe-lib.asm にあり、
   このCファイル単体ではリンクできない(未定義シンボル)ことを意図している。 */
extern unsigned int asm_marker(void);

int main(void)
{
    unsigned int value;

    value = asm_marker();
    printf("LINKPROBE marker=%04x\n", value);

    return 0;
}
