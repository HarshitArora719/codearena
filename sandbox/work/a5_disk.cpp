#include <cstdlib>
int main(){ system("dd if=/dev/zero of=/work/big bs=1M count=10 2>&1 || echo WRITE_FAILED"); }
