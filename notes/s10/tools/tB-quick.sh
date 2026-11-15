#!/bin/zsh
# quick.sh <tag> <html> <idx...> : seeds.sh k=0 for each idx (base results cached under tag 'base')
W=/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB
tag=$1; html=$2; shift 2
for i in "$@"; do
  $W/tools/seeds.sh $W/work/base.html $i 0 $W/work/q base
  $W/tools/seeds.sh $html $i 0 $W/work/q $tag
done
