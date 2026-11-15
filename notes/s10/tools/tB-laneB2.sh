#!/bin/zsh
# seeds 0-4, base and new
W=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB
tag=$1; html=$2; shift 2
for i in "$@"; do for k in 0 1 2 3 4; do
  $W/tools/seeds.sh $W/work/base.html $i $k $W/work/seeds base
  $W/tools/seeds.sh $html $i $k $W/work/seeds $tag
done; done
echo LANEB DONE
