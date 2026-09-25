// 球皮: what the stone core of the ball looks like. The first is the 五色石 of the story; the others
// are unlocked by stars (modes.js Progress.total) or, the last one, by finding all ten 五色石碎片
// (shards.js). Each is a colour for every point of the unit sphere, plus the colour of the little
// studs round it (or none).
import { noise2 } from '../core/rng.js';

const WUSE = [0x2aa198, 0xd8342c, 0xf2c14e, 0xf4efe2, 0x2b2733];
const band = (t, pal) => pal[(((Math.floor(t)) % pal.length) + pal.length) % pal.length];

export const SKINS = [
  {
    id: 'wuse', name: '五色石', need: 0, studs: [0xd9a432, 0xf6d06a],
    // agate bands in the five colours
    color: (x, y, z) => band((y * 2.1 + 0.55 * Math.sin(x * 3.1 + z * 2.3) + 0.6 * noise2(x * 2.2 + 7.1, z * 2.2 - 3.3) + 0.3 * noise2(y * 3 + 1, x * 3) + 10) * 1.55, WUSE),
  },
  {
    id: 'qinghua', name: '青花瓷', need: 3, studs: [0x2c4ea8, 0xf3f1ea],
    // white porcelain with cobalt scrolls
    color: (x, y, z) => {
      const t = Math.sin(x * 5.2 + 1.4 * noise2(y * 2.5, z * 2.5)) * Math.cos(z * 4.6 - y * 2) + 0.35 * noise2(x * 4 + 3, y * 4 - 1);
      return Math.abs(y) > 0.86 ? 0x23408f : t > 0.42 ? 0x23408f : t > 0.3 ? 0x5d7fcf : 0xf3f1ea;
    },
  },
  {
    id: 'xigua', name: '大西瓜', need: 6, studs: null,
    // dark wavy stripes from pole to pole on light green
    color: (x, y, z) => {
      const a = Math.atan2(z, x) + 0.35 * noise2(y * 3, x * 2 + z) + 0.25 * Math.sin(y * 6);
      return Math.abs(y) > 0.95 ? 0x6f8f3a : Math.sin(a * 8) > 0.15 ? 0x1f5e2b : 0x7cc453;
    },
  },
  {
    id: 'panda', name: '熊猫', need: 10, studs: null,
    // black ears, eye patches and arms on white
    color: (x, y, z) => {
      const near = (cx, cy, cz, r) => (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 < r * r;
      if (near(0.24, 0.3, 0.92, 0.2) || near(-0.24, 0.3, 0.92, 0.2)) return 0x1d1b22;
      if (near(0.24, 0.32, 0.95, 0.27) && !near(0.24, 0.34, 0.95, 0.08)) return 0x1d1b22;
      if (near(0.55, 0.78, 0.1, 0.24) || near(-0.55, 0.78, 0.1, 0.24)) return 0x1d1b22;
      if (near(0, 0.02, 1, 0.08)) return 0x1d1b22; // nose
      if (Math.abs(y + 0.25) < 0.22 && z < 0.35) return 0x1d1b22; // arms round the back
      return 0xf6f3ee;
    },
  },
  {
    id: 'yuanbao', name: '金元宝', need: 15, studs: [0xb8801c, 0xfff0b0],
    // gold, polished in bands
    color: (x, y, z) => {
      const t = y * 3 + 0.4 * noise2(x * 3, z * 3);
      return band((t + 10) * 1.2, [0xf2c14e, 0xe0a82e, 0xf8dc7a, 0xd4952a]);
    },
  },
  {
    id: 'xingkong', name: '星空', need: 22, studs: [0x9aa4c8, 0xf4f1ff],
    // night blue to violet, with stars
    color: (x, y, z) => {
      const s = noise2(x * 21 + y * 7, z * 21 - y * 5) + noise2(y * 19 - 2, x * 17 + z * 3);
      if (s > 1.1) return 0xfff6c8;
      if (s > 0.96) return 0xb9c8ff;
      const t = y + 0.3 * noise2(x * 2, z * 2);
      return t > 0.35 ? 0x2b2a6b : t > -0.3 ? 0x1c2352 : 0x3a2462;
    },
  },
  {
    id: 'shen', name: '五色神石', shards: 10, studs: [0xfff0b0, 0xffffff],
    // shimmering through all five colours and back
    color: (x, y, z) => {
      const t = (Math.atan2(z, x) / Math.PI) * 2.5 + y * 1.6 + 0.5 * noise2(x * 3, y * 3 + z);
      return band((t + 20) * 2, [0x3fd0c0, 0x6aa8ff, 0xff6fa8, 0xffd45a, 0xffffff]);
    },
  },
];

export const skinById = id => SKINS.find(s => s.id === id) || SKINS[0];

/** can this skin be used: enough stars, or all the shards */
export function skinOpen(skin, stars, shards) {
  return skin.shards ? shards >= skin.shards : stars >= skin.need;
}

/** what it takes, for a locked one */
export function skinNeed(skin) {
  return skin.shards ? `集齐 ${skin.shards} 块五色石碎片` : `累计 ★ ${skin.need} 解锁`;
}
