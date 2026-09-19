#include <stdio.h>

#define SIZE 100000UL

char big[SIZE];

int main(void)
{
    unsigned long i;
    unsigned checksum;

    for (i = 0; i < SIZE; i++) {
        big[i] = (char)(i & 0xFF);
    }

    /* 64KB(65536)境界をまたぐ位置に印を付ける */
    big[0] = 0x11;
    big[65535] = 0x22;
    big[65536] = 0x33;
    big[SIZE - 1] = 0x44;

    checksum = 0;
    for (i = 0; i < SIZE; i++) {
        checksum = (checksum + (unsigned char)big[i]) & 0xFFFF;
    }

    printf("HUGEPROBE head=%02x b64k-1=%02x b64k=%02x tail=%02x sum=%04x size=%lu\n",
        (unsigned char)big[0], (unsigned char)big[65535], (unsigned char)big[65536],
        (unsigned char)big[SIZE - 1], checksum, SIZE);

    return 0;
}
