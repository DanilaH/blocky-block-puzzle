// D82 offline preparation by actual bounded-player outcomes. No runtime import.
#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <vector>
using U=uint64_t;
struct Op { int shape,x,y; U mask; };
struct Choice { int op,slot,value,lines; U board; };
struct Stats {
    int paths=0,dead=0,rewards=0,worstCover=0,sumCover=0,minClears=4,sumLines=0,sumOccupied=0;
};
struct Leaf { U board; std::vector<Choice> path; int lines,clears; bool reward,dead; };
struct Candidate { std::array<int,3> bag; Stats screen,tree; int screenRank; };
std::vector<Op> ops;
std::vector<std::vector<int>> byShape;
std::array<U,256> rowMasks{},columnMasks{};
uint64_t checks=0,transitions=0;
int pop(U n){return __builtin_popcountll(n);}
std::pair<U,int> step(U b){
    int rows=0,cols=255;
    for(int y=0;y<8;y++){int r=(b>>(8*y))&255;if(r==255)rows|=1<<y;cols&=r;}
    return {b&~(rowMasks[rows]|columnMasks[cols]),pop(rows)+pop(cols)};
}
bool augment(int y,U b,unsigned &seen,std::array<int,8>&match){
    unsigned row=(b>>(8*y))&255;
    for(int x=0;x<8;x++)if((row&(1<<x))&&!(seen&(1<<x))){
        seen|=1<<x;if(match[x]<0||augment(match[x],b,seen,match)){match[x]=y;return true;}
    }return false;
}
int cover(U b){std::array<int,8> match;match.fill(-1);int n=0;
    for(int y=0;y<8;y++){unsigned seen=0;n+=augment(y,b,seen,match);}return n;}
int geometry(U b){
    int edges=0,holes=0;
    for(int y=0;y<8;y++){
        int r=(b>>(8*y))&255,empty=(~r)&255,next=y<7?(b>>(8*(y+1)))&255:0;
        edges+=pop((r^(r<<1))&255)+pop(r^next);
        int above=y?((~(b>>(8*(y-1))))&255):0;
        int below=y<7?((~(b>>(8*(y+1))))&255):0;
        int near=((empty<<1)|(empty>>1)|above|below)&255;
        holes+=pop(empty&~near);
    }return -pop(b)*2-edges-holes*20;
}
std::array<int,3> slots(std::array<int,3> bag){return {bag[2],bag[0],bag[1]};}
std::vector<Choice> options(U b,const std::array<int,3>&ids,int used){
    std::vector<Choice> best;
    for(int slot=0;slot<3;slot++)if(!(used&(1<<slot)))for(int i:byShape[ids[slot]]){
        ++checks;if(b&ops[i].mask)continue;
        auto [n,lines]=step(b|ops[i].mask);++transitions;
        Choice c{i,slot,lines*200+geometry(n),lines,n};
        auto pos=std::find_if(best.begin(),best.end(),[&](const Choice&a){return c.value>a.value;});
        best.insert(pos,c);if(best.size()>5)best.pop_back();
    }
    if(!best.empty()){int cutoff=best[0].value-20;best.erase(std::remove_if(best.begin(),best.end(),[&](const Choice&c){return c.value<cutoff;}),best.end());}
    return best;
}
void add(Stats&s,U b,int lines,int clears,bool reward,bool dead){
    int c=reward?0:cover(b);s.paths++;s.dead+=dead;s.rewards+=reward;
    s.worstCover=std::max(s.worstCover,c);s.sumCover+=c;s.minClears=std::min(s.minClears,clears);
    s.sumLines+=lines;s.sumOccupied+=reward?0:pop(b);
}
Stats screen(U input,const std::array<int,3>&bag){
    Stats s;auto ids=slots(bag);
    for(double q:{0.,.25,.5,.75,.999999}){
        U b=input;int used=0,lines=0,clears=0;bool reward=false;
        for(int d=0;d<3;d++){
            auto choices=options(b,ids,used);if(choices.empty())break;
            auto c=choices[std::min(int(choices.size())-1,int(q*choices.size()))];
            b=c.board;used|=1<<c.slot;lines+=c.lines;clears+=c.lines>0;reward|=b==0;
        }add(s,b,lines,clears,reward,used!=7);
    }return s;
}
Stats tree(U input,const std::array<int,3>&bag,std::vector<Leaf>*leaves=nullptr){
    Stats s;auto ids=slots(bag);
    auto visit=[&](auto&&self,U b,int used,int lines,int clears,bool reward,std::vector<Choice> path)->void{
        auto next=used==7?std::vector<Choice>{}:options(b,ids,used);
        if(next.empty()){
            add(s,b,lines,clears,reward,used!=7);
            if(leaves)leaves->push_back({b,path,lines,clears,reward,used!=7});
            return;
        }
        for(auto c:next){auto p=path;p.push_back(c);self(self,c.board,used|(1<<c.slot),lines+c.lines,clears+(c.lines>0),reward||c.board==0,p);}
    };visit(visit,input,0,0,0,false,{});return s;
}
int compare(const Stats&a,const Stats&b){
    auto cmp=[](int x,int y){return (x>y)-(x<y);};int c;
    if((c=cmp(a.dead==0,b.dead==0)))return c;
    if((c=cmp(a.minClears>=1,b.minClears>=1)))return c;
    if((c=cmp(a.rewards==a.paths,b.rewards==b.paths)))return c;
    if((c=cmp(a.rewards*b.paths,b.rewards*a.paths)))return c;
    if((c=cmp(b.worstCover,a.worstCover)))return c;
    if((c=cmp(b.sumCover*a.paths,a.sumCover*b.paths)))return c;
    if((c=cmp(a.minClears,b.minClears)))return c;
    if((c=cmp(a.sumLines*b.paths,b.sumLines*a.paths)))return c;
    return cmp(b.sumOccupied*a.paths,a.sumOccupied*b.paths);
}
void printStats(const Stats&s){std::cout<<"{\"paths\":"<<s.paths<<",\"dead\":"<<s.dead<<",\"rewards\":"<<s.rewards
    <<",\"worstCover\":"<<s.worstCover<<",\"sumCover\":"<<s.sumCover<<",\"minClears\":"<<s.minClears
    <<",\"sumLines\":"<<s.sumLines<<",\"sumOccupied\":"<<s.sumOccupied<<'}';}
void printBag(const std::array<int,3>&bag){std::cout<<'['<<bag[0]<<','<<bag[1]<<','<<bag[2]<<']';}
int main(){
    int count;if(!(std::cin>>count))return 1;
    for(int i=0;i<count;i++){Op o;std::cin>>o.shape>>o.x>>o.y>>o.mask;if(!o.mask)return 2;ops.push_back(o);
        if(byShape.size()<=size_t(o.shape))byShape.resize(o.shape+1);
        byShape[o.shape].push_back(i);}
    for(int m=0;m<256;m++)for(int i=0;i<8;i++)if(m&(1<<i)){rowMasks[m]|=U(255)<<(8*i);columnMasks[m]|=U(0x0101010101010101)<<i;}
    int boards;std::cin>>boards;std::cout<<"{\"cases\":[";
    for(int k=0;k<boards;k++){
        U input;std::cin>>input;if(!input||step(input).first!=input)return 3;checks=transitions=0;
        std::vector<Candidate> pool;int bags=0;
        for(int a=0;a<int(byShape.size());a++)for(int b=a;b<int(byShape.size());b++)for(int c=b;c<int(byShape.size());c++){
            Candidate x{{a,b,c},{},{},0};x.screen=screen(input,x.bag);bags++;
            auto pos=std::find_if(pool.begin(),pool.end(),[&](const Candidate&p){return compare(x.screen,p.screen)>0;});
            pool.insert(pos,x);if(pool.size()>8)pool.pop_back();
        }
        for(size_t i=0;i<pool.size();i++){pool[i].screenRank=i;pool[i].tree=tree(input,pool[i].bag);}
        std::sort(pool.begin(),pool.end(),[](const Candidate&a,const Candidate&b){int c=compare(a.tree,b.tree);return c?c>0:a.bag<b.bag;});
        std::vector<Leaf> leaves;tree(input,pool[0].bag,&leaves);
        if(k)std::cout<<',';
        std::cout<<"{\"board\":\""<<input<<"\",\"bags\":"<<bags<<",\"fitChecks\":"<<checks<<",\"transitions\":"<<transitions<<",\"pool\":[";
        for(size_t i=0;i<pool.size();i++){if(i)std::cout<<',';std::cout<<"{\"bag\":";printBag(pool[i].bag);std::cout<<",\"screenRank\":"<<pool[i].screenRank<<",\"screen\":";printStats(pool[i].screen);std::cout<<",\"tree\":";printStats(pool[i].tree);std::cout<<'}';}
        std::cout<<"],\"leaves\":[";
        for(size_t i=0;i<leaves.size();i++){if(i)std::cout<<',';const auto&l=leaves[i];std::cout<<"{\"board\":\""<<l.board<<"\",\"lines\":"<<l.lines<<",\"clears\":"<<l.clears<<",\"reward\":"<<(l.reward?"true":"false")<<",\"dead\":"<<(l.dead?"true":"false")<<",\"path\":[";
            for(size_t j=0;j<l.path.size();j++){if(j)std::cout<<',';auto p=l.path[j];std::cout<<'['<<p.slot<<','<<ops[p.op].x<<','<<ops[p.op].y<<']';}std::cout<<"]}";}
        std::cout<<"]}"<<std::flush;
    }std::cout<<"]}\n";
}
