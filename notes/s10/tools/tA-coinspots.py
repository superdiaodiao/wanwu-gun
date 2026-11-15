# coinspots.py <gate json> : for each half-square spot on the green, the share of casual-easy plays whose tracks pass within 0.4 m
import json, sys, math
r = json.load(open(sys.argv[1])); W, H = r['W'], r['H']
plays = r['cfg']['easy_casual']
def at(c, rr): return (c - (W - 1) / 2, rr - (H - 1) / 2)
res = []
for c2 in range(0, 2 * W - 1):
    for r2 in range(0, 2 * H - 1):
        c, rr = c2 / 2, r2 / 2
        x, z = at(c, rr); n = 0
        for p in plays:
            hit = any(math.hypot(px - x, pz - z) < 0.4 for s in p['shots'] for (px, pz) in s.get('track', []))
            n += hit
        res.append((n / len(plays) * 100, c, rr))
res.sort(reverse=True)
for s, c, rr in res[:25]: print(f'[{c}, {rr}] {s:.0f}%')
