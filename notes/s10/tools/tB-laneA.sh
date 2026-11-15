#!/bin/zsh
# wait for the base gate, then gate N=96 TRACE the new build's holes one by one
W=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB
tag=$1; html=$2; holes=$3
while pgrep -f "gate.mjs ../work/base.html" >/dev/null; do sleep 20; done
cd $W/repo && TRACE=1 node tools/golf/gate.mjs $html $holes 96 --out=$W/work/gate-$tag --jobs=1 > $W/work/gate-$tag.txt 2>&1
echo LANEA DONE
