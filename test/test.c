#include <stdio.h>

int main(int argc, char *argv[])
{
    int forgotten = 1;

    printf("Hello, World!\n");

    for (int i = 1; i < argc; i++) {
        printf("%s ", argv[i]);
    }
    putchar(10);
    return 0;
}