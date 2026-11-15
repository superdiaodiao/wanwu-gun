#!/bin/bash
# try.sh <name> [holes] [sizes]: build the worktree, capture holes, make before/after sheets
set -e
L=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/look
N=$1; H=${2:-9,15,19,27,30,32}; S=${3:-390x844,844x390}
cd $L/repo
mkdir -p $L/try/$N
node tools/golf/build.mjs $L/try/$N/golf.html | tail -1
node tools/golf/shots.mjs capture $L/try/$N/golf.html $L/try/$N/shots --holes=$H --sizes=$S --langs=zh --levels=easy --page --jobs=2 | tail -1
for s in ${S//,/ }; do python3 $L/tools/sheet.py $L/try/$N/sheet-$s.png $s $([ $s = 390x844 ] && echo 0.5 || echo 0.6) "前=$L/base/shots" "后=$L/try/$N/shots" --holes=$H --cols=$([ $s = 390x844 ] && echo 6 || echo 4); done
