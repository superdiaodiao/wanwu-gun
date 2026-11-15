#!/bin/zsh
# q2.sh <html> <idx> <tag> [N=96] [shift k=0]: casual-easy + careful-easy (seeds shifted by k*1000, as s9 seeds.sh). env PATCH passes through
T=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tA
cd $T/repo
html=$1; idx=$2; tag=$3; N=${4:-96}; k=${5:-0}
mkdir -p $T/try/q2
C="[{\"key\":\"easy_casual\",\"level\":\"easy\",\"guide\":7,\"capture\":3,\"person\":\"casual\",\"seed\":$((101+k*1000))},{\"key\":\"easy\",\"level\":\"easy\",\"guide\":7,\"capture\":3,\"seed\":$((k*1000))}]"
out=$T/try/q2/$tag-$idx-$N-$k.json
[ -s $out ] || TRACE=1 HTML=$html node tools/golf/bot.mjs $idx $N "$C" > $out 2>/dev/null
python3 -c "
import json; r=json.load(open('$out'))
print('$tag idx $idx N $N seed+$k', ' | '.join(f\"{c}: w{r[c]['within']} p2 {r[c]['p2']} gave {r[c]['gaveUp']} ace {r[c]['ace']} mean {r[c]['mean']} worst {r[c]['worst']} 3* {r[c]['stars3']}\" for c in ['easy_casual','easy']))"
