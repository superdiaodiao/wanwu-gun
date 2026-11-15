#!/bin/zsh
# one.sh <tag> <idx>: gate N=96 TRACE then seeds 1-4 for one hole on work/<tag>.html
W=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB; tag=$1; i=$2
cd $W/repo && TRACE=1 node tools/golf/gate.mjs $W/work/$tag.html $i 96 --out=$W/work/gate-$tag --jobs=1 > $W/work/gate-$tag-$i.txt 2>&1
grep -E "^#|within|aces" $W/work/gate-$tag-$i.txt
for k in 1 2 3 4; do $W/tools/seeds.sh $W/work/base.html $i $k $W/work/seeds base; $W/tools/seeds.sh $W/work/$tag.html $i $k $W/work/seeds $tag; done
echo ONE DONE $tag $i
