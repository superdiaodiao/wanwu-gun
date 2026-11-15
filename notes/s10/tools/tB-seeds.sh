#!/bin/zsh
# seeds.sh <html (absolute)> <idx> <k> <outdir> <tag> [N=96]   (env PATCH, TIE pass through): casual-easy + careful-easy, seeds shifted by k*1000 (from s9/int/tools)
cd /Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB/repo
html=$1; idx=$2; k=$3; D=$4; tag=$5; N=${6:-96}; mkdir -p $D
C="[{\"key\":\"easy_casual\",\"level\":\"easy\",\"guide\":7,\"capture\":3,\"person\":\"casual\",\"seed\":$((101+k*1000))},{\"key\":\"easy\",\"level\":\"easy\",\"guide\":7,\"capture\":3,\"seed\":$((k*1000))}]"
[ -s $D/$tag-$idx-$k.json ] || HTML=$html node tools/golf/bot.mjs $idx $N "$C" > $D/$tag-$idx-$k.json 2>/dev/null
python3 -c "
import json; r=json.load(open('$D/$tag-$idx-$k.json'))
print('$tag idx $idx seed+$k', ' | '.join(f\"{c}: w{r[c]['within']} p2 {r[c]['p2']} gave {r[c]['gaveUp']} ace {r[c]['ace']} mean {r[c]['mean']} worst {r[c]['worst']} 3* {r[c]['stars3']}\" for c in ['easy_casual','easy']))"
