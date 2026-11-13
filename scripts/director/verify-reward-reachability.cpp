// Independent forward-only oracle. No reverse targets/index, no primary code.
#include <cstdint>
#include <iostream>
#include <unordered_set>
#include <vector>
using Bits = uint64_t;
const Bits lane = UINT64_C(0x0101010101010101);
struct Action { int shape, x, y; Bits mask; };
struct Result { Bits board; int lines; };

Result place(Bits filled) {
    // Horizontal full bytes; separate vertical reduction. All clears simultaneous.
    Bits rowBits = filled & (filled >> 4);
    rowBits &= rowBits >> 2;
    rowBits &= rowBits >> 1;
    rowBits &= lane;
    Bits columnBits = filled & (filled >> 32);
    columnBits &= columnBits >> 16;
    columnBits &= columnBits >> 8;
    columnBits &= 255;
    return {filled & ~(rowBits*255 | columnBits*lane),
            __builtin_popcountll(rowBits) + __builtin_popcountll(columnBits)};
}

int main() {
    int n; std::cin >> n;
    std::vector<Action> actions(n);
    for (auto &a : actions) std::cin >> a.shape >> a.x >> a.y >> a.mask;
    int count; std::cin >> count;
    std::cout << "[";
    for (int k = 0; k < count; ++k) {
        Bits board; std::cin >> board;
        int shortest = 4;
        uint64_t fitChecks = 0, leafChecks = 0;
        std::unordered_set<Bits> first, second;
        for (auto &a : actions) {
            ++fitChecks;
            if (board & a.mask) continue;
            auto next = place(board | a.mask);
            if (!next.board) shortest = 1; else first.insert(next.board);
        }
        if (shortest > 1) for (Bits b : first) for (auto &a : actions) {
            ++fitChecks;
            if (b & a.mask) continue;
            auto next = place(b | a.mask);
            if (!next.board) shortest = 2; else second.insert(next.board);
        }
        if (shortest > 2) for (Bits b : second) {
            for (auto &a : actions) {
                ++fitChecks; ++leafChecks;
                if (b & a.mask) continue;
                if (!place(b | a.mask).board) { shortest = 3; break; }
            }
            if (shortest == 3) break;
        }
        if (k) std::cout << ',';
        std::cout << "{\"minimumPlacements\":";
        if (shortest == 4) std::cout << "null"; else std::cout << shortest;
        std::cout << ",\"firstUnique\":" << first.size() << ",\"secondUnique\":" << second.size()
                  << ",\"fitChecks\":" << fitChecks << ",\"leafChecks\":" << leafChecks << "}" << std::flush;
    }
    std::cout << "]\n";
}
