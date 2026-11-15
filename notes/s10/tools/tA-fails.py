# fails.py <bot json> [cfg=easy_casual]: the shots of every play over par
import json, sys
r = json.load(open(sys.argv[1])); k = sys.argv[2] if len(sys.argv) > 2 else 'easy_casual'
P = r['par']; o = r[k]['out']
print(r['name'], 'par', P, 'cup', r.get('cup'))
for i, x in enumerate(o):
    if x > P:
        print(f'play {i}: {x}')
        for s in r['cfg'][k][i]['shots']:
            print('   from', s['from'], 'plan v', s['plan']['v'], 'a', s['plan']['a'], 'hits', s['plan']['hits'], 'share', s['plan']['share'], '| exec', s['exec'], '-> end', s['end'], 'minD', s['minD'], 'sunk', s['sunk'])
