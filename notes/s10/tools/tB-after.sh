#!/bin/zsh
# after.sh <pid to wait for> <tag> <idx>: then one.sh
while kill -0 $1 2>/dev/null; do sleep 15; done
/Users/bytedance/AI/wanwu-gun/.cache/golf-work/s10/tB/tools/one.sh $2 $3
