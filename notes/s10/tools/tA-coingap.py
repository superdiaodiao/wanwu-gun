# coingap.py <gate json (cup-only, TRACE)> <coinbot json> c r : cup-only 3* with a single coin at [c, r] (from tracks, 0.4 m) vs coin-first 3*
import json, sys, math
g = json.load(open(sys.argv[1])); cb = json.load(open(sys.argv[2])); c, rr = float(sys.argv[3]), float(sys.argv[4])
W, H, P = g['W'], g['H'], g['par']; x, z = c - (W - 1) / 2, rr - (H - 1) / 2
s3 = 0
for p, o in zip(g['cfg']['easy_casual'], g['easy_casual']['out']):
    got = any(math.hypot(px - x, pz - z) < 0.4 for s in p['shots'] for (px, pz) in s.get('track', []))
    s3 += o <= P and (o < P or got)
s3 = s3 / len(g['easy_casual']['out']) * 100
e = cb['easy_casual']; o = e['out']; ac = e['allCoins']
f3 = sum(1 for a, b in zip(o, ac) if a <= P and (a < P or b)) / len(o) * 100
print(f'coin [{c}, {rr}]: cup-only 3* {s3:.0f}  coin-first within {e["within"]} 3* {f3:.0f} allCoins {sum(ac)/len(ac)*100:.0f}  gap {s3 - f3:.0f}')
