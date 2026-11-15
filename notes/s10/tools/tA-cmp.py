# cmp.py <baseDir> <newDir> [idx..]: per hole, base -> new for each gate config
import json, sys, os
A, B = sys.argv[1], sys.argv[2]
idx = [int(x) for x in sys.argv[3:]] or sorted(int(f[1:-5]) for f in os.listdir(B) if f.endswith('.json'))
for i in idx:
    a = json.load(open(f'{A}/h{i}.json')); b = json.load(open(f'{B}/h{i}.json'))
    row = [f"#{i} {b['name']} par {b['par']}"]
    for k in ['easy_casual', 'easy', 'normal', 'hard']:
        x, y = a[k], b[k]
        row.append(f"{k}: w {x['within']}->{y['within']} mean {x['mean']}->{y['mean']} ace {x['ace']}->{y['ace']} 3* {x['stars3']}->{y['stars3']} p2 {y['p2']} gave {y['gaveUp']}")
    same = a['easy_casual']['out'] == b['easy_casual']['out'] and all(a[k]['out'] == b[k]['out'] for k in ['easy', 'normal', 'hard'])
    print(row[0], '(identical)' if same else ''); [print('   ', r) for r in row[1:]]
