# sum.py: per changed hole, gate numbers base -> new and seeds
import json, os, re
W = '/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB/work/'
NEW = {21: ('gate-v21d', 'v21d'), 22: ('gate-fin1', 'fin3'), 23: ('gate-fin6', 'v23c'), 24: ('gate-v24b', 'v24b'), 25: ('gate-fin1', 'fin3'),
       30: ('gate-final', None), 31: ('gate-v31b', 'v31b'), 32: ('gate-fin1', 'fin3'), 34: ('gate-v34b', 'v34b')}
def g(d, i):
    p = W + d + f'/h{i}.json'
    if not os.path.exists(p): return None
    r = json.load(open(p)); return r
for i, (d, t) in NEW.items():
    a, b = g('gate-base', i), g(d, i)
    if not b: print(i, 'no gate yet'); continue
    f = lambda r, c: r[c]['within']
    line = f"#{i} hole {i+1} {b['name']}: casual {f(a,'easy_casual')}->{f(b,'easy_casual')} (mean {a['easy_casual']['mean']}->{b['easy_casual']['mean']}, p2 {a['easy_casual']['p2']}->{b['easy_casual']['p2']}) | careful easy {f(a,'easy')}->{f(b,'easy')} normal {f(a,'normal')}->{f(b,'normal')} hard {f(a,'hard')}->{f(b,'hard')} | ace casual {a['easy_casual']['ace']}->{b['easy_casual']['ace']} careful {a['easy']['ace']}->{b['easy']['ace']} | 3* {a['easy']['stars3']}->{b['easy']['stars3']}"
    if t:
        s = []
        for k in (1, 2, 3, 4):
            try: s.append(f"{json.load(open(W+f'seeds/base-{i}-{k}.json'))['easy_casual']['within']}->{json.load(open(W+f'seeds/{t}-{i}-{k}.json'))['easy_casual']['within']}")
            except Exception: s.append('?')
        line += ' | seeds1-4 ' + ' '.join(s)
    print(line)
