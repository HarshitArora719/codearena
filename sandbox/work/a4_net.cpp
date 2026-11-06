#include <cstdlib>
int main(){ system("bash -c 'echo > /dev/tcp/1.1.1.1/80' 2>&1 || echo NO_NETWORK"); }
