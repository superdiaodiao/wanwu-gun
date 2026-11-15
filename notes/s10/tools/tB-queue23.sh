#!/bin/zsh
W=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB
until grep -q "ONE DONE" $W/work/one-v18c-18.txt 2>/dev/null; do sleep 15; done
cd $W/repo && TRACE=1 node tools/golf/gate.mjs $W/work/fin6.html 23 96 --out=$W/work/gate-fin6 --jobs=1 > $W/work/gate-fin6-23.txt 2>&1
