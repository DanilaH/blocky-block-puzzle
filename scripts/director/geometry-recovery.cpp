// D81: offline positive-route probe. Beam misses are UNKNOWN, never impossible.
// No runtime consumer; independent cell/public-rule verification is required.
#include <algorithm>
#include <array>
#include <cstdint>
#include <iostream>
#include <unordered_map>
#include <unordered_set>
#include <vector>
using U = uint64_t;
struct Op { int shape, x, y; U mask; };
struct Node { U board; std::vector<int> path; int lines, gap, value; };
std::array<U, 256> rows{}, cols{};
std::vector<Op> ops;
std::unordered_map<U, int> finish;
int pop(U x) { return __builtin_popcountll(x); }
std::pair<U, int> step(U filled) {
    unsigned rm = 0, cm = 255;
    for (int y = 0; y < 8; ++y) {
        unsigned r = (filled >> (8*y)) & 255;
        if (r == 255) rm |= 1 << y;
        cm &= r;
    }
    return {filled & ~(rows[rm] | cols[cm]), pop(rm) + pop(cm)};
}
bool augment(int y, U b, unsigned &seen, std::array<int,8> &match) {
    unsigned row = (b >> (8*y)) & 255;
    for (int x = 0; x < 8; ++x) if ((row & (1 << x)) && !(seen & (1 << x))) {
        seen |= 1 << x;
        if (match[x] == -1 || augment(match[x], b, seen, match)) { match[x] = y; return true; }
    }
    return false;
}
int cover(U b) {
    std::array<int,8> match; match.fill(-1); int n = 0;
    for (int y = 0; y < 8; ++y) { unsigned seen = 0; n += augment(y, b, seen, match); }
    return n;
}
int value(U b) {
    // Local potential only: fewer covering lines, then fewer cells, then near-lines.
    // This is a search heuristic, not an established measure of human difficulty.
    int fullness = 0;
    for (int i = 0; i < 8; ++i) {
        int r = pop(b & rows[1 << i]), c = pop(b & cols[1 << i]);
        fullness += r*r + c*c;
    }
    return -cover(b)*200 - pop(b)*4 + fullness;
}
void printPath(const std::vector<int> &path) {
    std::cout << '[';
    for (size_t i = 0; i < path.size(); ++i) { if (i) std::cout << ','; std::cout << path[i]; }
    std::cout << ']';
}
int main(int argc, char **argv) {
    int width = argc > 1 ? std::stoi(argv[1]) : 96;
    int horizon = argc > 2 ? std::stoi(argv[2]) : 9;
    if (width < 1 || horizon < 1 || horizon > 12) return 1;
    for (int m = 0; m < 256; ++m) for (int i = 0; i < 8; ++i) if (m & (1 << i)) {
        rows[m] |= U(255) << (8*i); cols[m] |= U(0x0101010101010101) << i;
    }
    int count; if (!(std::cin >> count)) return 2;
    for (int i = 0; i < count; ++i) { Op o; std::cin >> o.shape >> o.x >> o.y >> o.mask; ops.push_back(o); }
    for (int i = 0; i < count; ++i) {
        U mask = ops[i].mask; unsigned rs = 0, cs = 0;
        for (int y = 0; y < 8; ++y) { unsigned r = (mask >> (y*8)) & 255; if (r) rs |= 1 << y; cs |= r; }
        for (unsigned rm = rs;; rm = (rm-1)&rs) {
            for (unsigned cm = cs;; cm = (cm-1)&cs) {
                U target = rows[rm] | cols[cm], before = target ^ mask;
                if ((target & mask) == mask && step(before).first == before) finish.emplace(before, i);
                if (!cm) break;
            }
            if (!rm) break;
        }
    }
    int boards; std::cin >> boards;
    std::cout << "{\"width\":" << width << ",\"horizon\":" << horizon << ",\"cases\":[";
    for (int k = 0; k < boards; ++k) {
        U input; std::cin >> input;
        std::vector<Node> beam{{input, {}, 0, 0, value(input)}};
        std::vector<int> route;
        uint64_t checks = 0, expanded = 0;
        if (horizon <= 3) {
            // Full short horizon, including intermediate clears; no beam cutoff.
            auto hit = finish.find(input);
            if (hit != finish.end()) route = {hit->second};
            for (int a = 0; a < count && route.empty() && horizon >= 2; ++a) {
                ++checks; if (input & ops[a].mask) continue;
                U b = step(input | ops[a].mask).first; ++expanded;
                auto h = finish.find(b);
                if (h != finish.end()) { route = {a, h->second}; break; }
                if (horizon < 3) continue;
                for (int c = 0; c < count && route.empty(); ++c) {
                    ++checks; if (b & ops[c].mask) continue;
                    U d = step(b | ops[c].mask).first; ++expanded;
                    auto j = finish.find(d);
                    if (j != finish.end()) route = {a, c, j->second};
                }
            }
        }
        for (int depth = 0; horizon > 3 && depth < horizon && route.empty(); ++depth) {
            for (const auto &n : beam) {
                auto hit = finish.find(n.board);
                if (hit != finish.end()) { route = n.path; route.push_back(hit->second); break; }
            }
            if (!route.empty() || depth == horizon-1) break;
            std::vector<Node> next;
            std::unordered_set<U> seen;
            for (const auto &n : beam) for (int i = 0; i < count; ++i) {
                ++checks; if (n.board & ops[i].mask) continue;
                auto [b, lines] = step(n.board | ops[i].mask); ++expanded;
                if (!seen.insert(b).second) continue;
                auto path = n.path; path.push_back(i);
                next.push_back({b, std::move(path), n.lines + lines, lines ? 0 : n.gap + 1, value(b)});
            }
            std::sort(next.begin(), next.end(), [](const Node &a, const Node &b) {
                if (a.value != b.value) return a.value > b.value;
                if (a.lines != b.lines) return a.lines > b.lines;
                return a.path < b.path;
            });
            if (next.size() > size_t(width)) next.resize(width);
            beam = std::move(next);
        }
        if (k) std::cout << ',';
        std::cout << "{\"board\":\"" << input << "\",\"status\":\"" << (route.empty() ? (horizon <= 3 ? "impossible" : "unknown") : "found")
                  << "\",\"fitChecks\":" << checks << ",\"expanded\":" << expanded << ",\"ops\":";
        printPath(route); std::cout << '}' << std::flush;
    }
    std::cout << "]}\n";
}
