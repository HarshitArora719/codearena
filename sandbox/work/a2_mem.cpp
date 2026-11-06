#include <vector>
int main(){
  std::vector<char*> v;
  while(1){ char* p=new char[1<<20]; for(int i=0;i<(1<<20);i+=4096) p[i]=1; v.push_back(p); }
}
