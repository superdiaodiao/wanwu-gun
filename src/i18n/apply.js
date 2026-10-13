// English content over the Chinese, once at boot (before anything reads it): the tables are
// changed in place, so the code that uses them stays as it is. 女娲's lines (story.js) are module
// exports, which can't be changed: main.js reads them through localStory() instead. Place names
// aren't changed either (the code looks them up by their Chinese names): placeName() in index.js
// translates them as they are shown.
import { EN } from './index.js';
import * as C from './en/content.js';
import { BLURBS as BLURBS_EN } from './en/blurbs.js';
import { CATALOG } from '../catalog/registry.js';
import { BLURBS } from '../game/blurbs.js';
import { WISHES } from '../game/wishes.js';
import { MODES, LEVELS } from '../game/modes.js';
import { SKINS } from '../game/skins.js';
import { SHARDS } from '../game/shards.js';
import { NAMES as RIVAL_NAMES } from '../game/rivals.js';
import { DEX_CATS } from '../game/dex.js';
import { MILESTONES, NUDGES, ENDINGS, QUIPS } from '../game/story.js';

let applied = false;

export function applyContent() {
  if (!EN || applied) return;
  applied = true;
  for (const spec of CATALOG.values()) if (C.NAMES[spec.id]) spec.name = C.NAMES[spec.id];
  Object.assign(BLURBS, BLURBS_EN);
  for (const w of WISHES) if (C.WISHES[w.id]) Object.assign(w, C.WISHES[w.id]);
  for (const [k, m] of Object.entries(MODES)) if (C.MODES[k]) m.name = C.MODES[k];
  for (const l of LEVELS) if (C.LEVELS[l.id]) Object.assign(l, C.LEVELS[l.id]);
  for (const s of SKINS) if (C.SKINS[s.id]) s.name = C.SKINS[s.id];
  SHARDS.forEach((s, i) => { if (C.SHARD_HINTS[i]) s.hint = C.SHARD_HINTS[i]; });
  RIVAL_NAMES.forEach((n, i) => { if (C.RIVAL_NAMES[i]) RIVAL_NAMES[i] = C.RIVAL_NAMES[i]; });
  for (const c of DEX_CATS) if (C.DEX_CATS[c[0]]) c[1] = C.DEX_CATS[c[0]];
  // story.js tables the game reads directly (hud.js, ending())
  const S = C.STORY;
  (S.MILESTONES || []).forEach((line, i) => { if (MILESTONES[i] && line) MILESTONES[i][1] = line; });
  (S.NUDGES || []).forEach((line, i) => { if (NUDGES[i] && line) NUDGES[i][1] = line; });
  (S.ENDINGS || []).forEach((e, i) => { if (ENDINGS[i] && e) [ENDINGS[i][1], ENDINGS[i][2]] = e; });
  Object.assign(QUIPS, S.QUIPS || {});
}

/** story.js as main.js reads it: the English lines over the Chinese ones */
export function localStory(zh) {
  if (!EN) return zh;
  const S = { ...C.STORY };
  // (the tables above were changed in place already)
  for (const k of ['MILESTONES', 'NUDGES', 'ENDINGS', 'QUIPS']) delete S[k];
  return { ...zh, ...S };
}
