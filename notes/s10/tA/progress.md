# s10/tA progress (terrain for yards 1-2, idx 0-17)
- worktree repo/ on branch s10/tA from dev/golf b0d1042
- base/golf.html = b0d1042 build sha deef69ea
- baseline gate N=96 TRACE idx 0-17 -> base/gate96 (running, jobs=1)
- tools/: q1.sh (casual N=48 screen, PATCH), fails.py (over-par plays), stuck.mjs (stuck scan, own: s5 tool gone), sheet.py
- screening N=48 casual (try/q, try/screen*.txt): chosen idx0 h0d, idx1 h1c, idx2 h2b, idx5 h5b (descending C), idx6 t1,
  idx9 h9b (0.75), idx10 t1 (mounds 0.55), idx12 h12a (raised tee leg), idx13 t1 (stairs down), idx16 t1.
  dropped: idx4 goose (aces 31-54% or casual drop), idx7 (aces), idx17 (casual 81-94 < 95.8), idx12 bigger bank (87.5)
- props.js cornerTires: y at green height (needed for idx5/6 raised corners)
- RIA rollcheck vs b0d1042 (base/ria.sha): identical
- t2.html (try/t2-frozen.html) gate96 running -> try/t2gate96
- FINAL: branch s10/tA, 9 commits a508dcc..d30cb2f (props cornerTires + holes 1,2,3,6,7,11,14,15). final/golf.html sha 3f0adb71 = try/t5.html (same bytes)
- gates: base/gate96 (b0d1042, 0-17), try/final96 (changed holes, N=96 TRACE), seeds try/q2 (*-idx-96-k), coin try/coin96, stuck try/stuck-t4.txt,
  cupvis try/cupvis-t4.txt, clips try/clips (base try/clips-base), steady fps (all 16.7), perf try/perf-*.txt, shots shots/before|after, sheets shots/compare-*.png
- CG final/cg.html 0 non-ASCII; RIA identical (base/ria.sha)
- unchanged-holes gate on t5 -> try/t5unch96 (running)
- unchanged 10 holes gate96 on final: identical to base; ladder: pond n/h 95.7/85.5 -> 96.3/89.6, pool 95.4/85.5 -> 95.8/87.0; basetree removed; chromes closed
