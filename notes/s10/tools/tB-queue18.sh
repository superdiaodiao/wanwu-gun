#!/bin/zsh
W=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB
until grep -q "ONE DONE" $W/work/one-v21d-21.txt; do sleep 15; done
$W/tools/one.sh v18c 18 > $W/work/one-v18c-18.txt 2>&1
