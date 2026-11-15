#!/bin/zsh
# q1.sh <html> <idx> <tag> [N=48] [seed=101]: casual-easy only (the gate's first config). env PATCH passes through
T=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tA
cd $T/repo
html=$1; idx=$2; tag=$3; N=${4:-48}; sd=${5:-101}
mkdir -p $T/try/q
C="[{\"key\":\"easy_casual\",\"level\":\"easy\",\"guide\":7,\"capture\":3,\"person\":\"casual\",\"seed\":$sd}]"
out=$T/try/q/$tag-$idx-$N-$sd.json
TRACE=1 HTML=$html node tools/golf/bot.mjs $idx $N "$C" > $out 2>/dev/null
python3 -c "
import json; r=json.load(open('$out')); c=r['easy_casual']
print('$tag idx $idx seed $sd N $N casual: w', c['within'], 'p2', c['p2'], 'ace', c['ace'], 'mean', c['mean'], 'worst', c['worst'], '3*', c['stars3'], 'gave', c['gaveUp'])"
