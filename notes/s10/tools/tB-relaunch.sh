#!/bin/zsh
# after hole 26's seeds, stop the fin3 seed lane (it would go on to hole 31, whose slope is unchanged) and run 32-36's
W=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB
until [ -s $W/work/seeds/fin3-25-4.json ]; do sleep 10; done
for p in $(ps -eo pid,command | grep -E "laneB2.sh fin3|tB/tools/seeds.sh" | grep -v grep | awk '{print $1}'); do kill $p; done
for p in $(ps -eo pid,command | grep -E "node tools/golf/bot.mjs 30 96" | grep -v grep | awk '{print $1}'); do kill $p; done
sleep 2
$W/tools/laneB2.sh fin3 $W/work/fin3.html 32 34 35 >> $W/work/laneB-fin3.txt 2>&1
