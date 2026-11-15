# s10/look progress
- worktree repo/ on s10/look from dev/golf b0d1042; node_modules symlinked
- base/golf.html = b0d1042 build (sha deef69ea...)
- sloped holes (0-based): 9,10,11,12,13,15,16,17,19,20,22,23,24,25,26,27,29,30,31,32,35
- diag: base/shots (21 sloped holes x 3 sizes). Why flat: portrait camera tilt 0.62 (near top-down); 0.15-0.5 m heights are
  small vs view; shading only +-25% smooth gradient; block sides left/right never face the centred camera.
- commit 1 a8774a9: LOOK_H=1.6 drawn height (physics untouched; course.slope for visuals), deep holes raised 0.3 (16, 31),
  fold/brow shading. 36 holes 0 console lines.
- camera (uncommitted until shots checked): SLOPED=0.9 tilt floor on sloped holes when far>=0.55 near (portrait only in practice)
- gate TRACE N=96: hole idx 9 base==fin byte-identical json+txt; 20 other sloped holes running (gate/, gate-*.txt)
- review fixes (s10 review-look): camera committed as 1164813 (build == fin/golf.html sha d1685d39). gate on remaining 17 sloped
  holes base vs fin running -> gate-base-rest.txt / gate-fin-rest.txt, gate/{base,fin}/h*.json
- gate TRACE N=96 on the other 17 sloped holes (10,11,12,13,16,17,19,20,22,23,24,25,26,29,31,32,35): base vs fin gate text
  identical, all 17 h*.json cmp-identical, ALL PASS (hole idx 35 HIGH ACE 18.8% casual, same in base). With reviewer's 15/27/30
  and idx 9: all 21 sloped holes proven unchanged.
- final sheets (from review-look sl-b0d1042 vs sl-wt; wt.html == fin/golf.html == HEAD 1164813 build): final/sheet-{390x844,844x390,1280x800,320x568}.png
- landscape gain small (confirmed on final/sheet-844x390.png); not reworked in this pass. fold() perf note left as is.
