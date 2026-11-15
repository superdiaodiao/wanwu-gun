# s10/tB progress (terrain for yards 3-4, idx 18-35)
- worktree repo/ on s10/tB from dev/golf b0d1042
- work/base.html = b0d1042 build (sha deef69ea...)
- shots/before/zh-normal-844x390: before pictures of 18-35
- running: base gate N=96 TRACE on 18-35 -> work/gate-base/
- quick checks (seed 0, casual+careful easy, N=96) work/q-*.txt: prototypes try2/try3/try4
  - kept: 18 tee deck, 21 staircase(+cup hollow), 22 raised top bar(+hollow), 23 nest hollow, 25 raised far bed(+hollow),
    30 sled deck 0.75, 32 deep ice bowl, 34 raised top bar(+hollow), 35 raised fort yard
  - dropped: 26 (0.7 tee-bed drop: casual 93.8 -> 83.3)
- fin1.html = candidate (sha 55daaaa6...); laneA (gate N=96 TRACE after base gate) and laneB (seeds 1-4 base/new) running
- Roll It All byte-identical vs b0d1042 record (work/rollitall-b0d1042.sha)
- stuck scan: tools/stuck.mjs (copied from s10/tA)
- base gate N=96 TRACE 18-35 on b0d1042: work/gate-base.txt (dirs work/gate-base)
- gate fin1 (22,23,25,30,32,34,35): work/gate-fin1.txt; all PASS; 30 HIGH ACE 35/38 (base 30/26) -> 31 reverted to base-equal slope (raised, same gradient)
- 21: fin3 hollow r1.6/-0.2 passes within on all seeds but careful aces 20.8; v21b (r1.6/-0.12) fails seeds 3,4; v21d (hollow behind cup [1,0.6]) gate 90.6 / aces 5.2-11.5, seeds pending
- 23: deep nest alone fails seeds 1,2 (soft putts die on the rim's flat); v23c = tee bank 0.8 sloping into nest: seeds 1-4 100% (ace 100%, breather)
- 18: fin1 (no hollow) seed3 99<100; fin3 (hollow) seed3 97.9<100; v18c (longer ramp, no hollow) queued
