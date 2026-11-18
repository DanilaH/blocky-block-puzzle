// Offline diagnostic. Exact <=3-placement reward search, no runtime consumer.
// Input/output are plain text/JSON. Compile with C++17; no external libraries.
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <map>
#include <set>
#include <unordered_map>
#include <vector>
using U = uint64_t;
struct Op { int shape, x, y; U mask; };
struct Witness { std::vector<int> path; int rewardAt; };
std::array<U, 256> rows, cols;
std::vector<Op> ops;

U cleared(U filled) {
    unsigned rm = 0, cm = 255;
    for (int y = 0; y < 8; ++y) {
        unsigned row = (filled >> (8*y)) & 255;
        if (row == 255) rm |= 1 << y;
        cm &= row;
    }
    return filled & ~(rows[rm] | cols[cm]);
}
bool stable(U b) { return cleared(b) == b; }

int main() {
    for (int m = 0; m < 256; ++m) for (int i = 0; i < 8; ++i) {
        if (m & (1 << i)) rows[m] |= U(255) << (8*i);
        if (m & (1 << i)) cols[m] |= U(0x0101010101010101) << i;
    }
    int count; if (!(std::cin >> count)) return 1;
    for (int i = 0; i < count; ++i) {
        Op o; std::cin >> o.shape >> o.x >> o.y >> o.mask;
        if (!o.mask) return 2;
        ops.push_back(o);
    }
    // Every clear line must touch the final placement in a stable board.
    std::unordered_map<U, std::vector<int>> reverse;
    uint64_t reverseCandidates = 0, reverseEdges = 0;
    for (int i = 0; i < count; ++i) {
        U mask = ops[i].mask; unsigned rs = 0, cs = 0;
        for (int y = 0; y < 8; ++y) {
            unsigned r = (mask >> (y*8)) & 255;
            if (r) rs |= 1 << y;
            cs |= r;
        }
        for (unsigned rm = rs;; rm = (rm-1) & rs) {
            for (unsigned cm = cs;; cm = (cm-1) & cs) {
                ++reverseCandidates;
                U target = rows[rm] | cols[cm];
                if ((mask & target) == mask) {
                    U before = target ^ mask;
                    if (stable(before)) {
                        if (cleared(before | mask)) return 3;
                        reverse[before].push_back(i); ++reverseEdges;
                    }
                }
                if (!cm) break;
            }
            if (!rm) break;
        }
    }
    int boards; std::cin >> boards;
    std::cout << "{\"reverseStates\":" << reverse.size()
              << ",\"reverseEdges\":" << reverseEdges
              << ",\"reverseCandidates\":" << reverseCandidates << ",\"cases\":[";
    for (int k = 0; k < boards; ++k) {
        U input; std::cin >> input;
        if (!input || !stable(input)) return 4;
        std::map<std::array<int, 3>, Witness> bags;
        uint64_t fitsChecks = 0, firstStates = 0, secondStates = 0, reverseHits = 0;
        int shortest = 4;
        auto record = [&](std::vector<int> path) {
            int rewardAt = path.size();
            shortest = std::min(shortest, rewardAt);
            // A reward mid-tray is valid; complete it with legal singletons.
            U b = 0;
            while (path.size() < 3) {
                int single = -1;
                for (int j = 0; j < count; ++j)
                    if (__builtin_popcountll(ops[j].mask) == 1 && !(b & ops[j].mask)) { single = j; break; }
                if (single < 0) std::exit(5);
                b = cleared(b | ops[single].mask); path.push_back(single);
            }
            std::array<int, 3> bag = {ops[path[0]].shape, ops[path[1]].shape, ops[path[2]].shape};
            std::sort(bag.begin(), bag.end());
            bags.emplace(bag, Witness{path, rewardAt});
        };
        auto finish = [&](U b, std::vector<int> prefix) {
            auto hit = reverse.find(b);
            if (hit == reverse.end()) return;
            ++reverseHits;
            for (int last : hit->second) { auto path = prefix; path.push_back(last); record(path); }
        };
        finish(input, {});
        for (int a = 0; a < count; ++a) {
            ++fitsChecks; if (input & ops[a].mask) continue;
            U b = cleared(input | ops[a].mask); ++firstStates;
            if (!b) { record({a}); continue; }
            finish(b, {a});
            for (int c = 0; c < count; ++c) {
                ++fitsChecks; if (b & ops[c].mask) continue;
                U d = cleared(b | ops[c].mask); ++secondStates;
                if (!d) record({a,c}); else finish(d, {a,c});
            }
        }
        if (k) std::cout << ',';
        std::cout << "{\"board\":\"" << input << "\",\"complete\":true,\"minimumPlacements\":";
        if (shortest == 4) std::cout << "null"; else std::cout << shortest;
        std::cout << ",\"witnessBags\":" << bags.size() << ",\"fitChecks\":" << fitsChecks
                  << ",\"firstStates\":" << firstStates << ",\"secondStates\":" << secondStates
                  << ",\"reverseHits\":" << reverseHits << ",\"witnesses\":[";
        int stored = 0;
        for (const auto &entry : bags) {
            if (stored == 32) break;
            if (stored++) std::cout << ',';
            std::cout << "{\"rewardAt\":" << entry.second.rewardAt << ",\"ops\":[";
            for (int j = 0; j < 3; ++j) { if (j) std::cout << ','; std::cout << entry.second.path[j]; }
            std::cout << "]}";
        }
        std::cout << "]}" << std::flush;
    }
    std::cout << "]}\n";
}
