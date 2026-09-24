// Integration values that belong to the game rather than to a single model: where the rotating parts
// mount on their bases, where the rail deck is, etc. Applied after every catalog file has registered.
import { CATALOG } from './registry.js';

const set = (id, props) => {
  const s = CATALOG.get(id);
  if (s) Object.assign(s, props);
};

set('nuwa', { hidden: true });
set('pig', { sfx: 'oink' });
// rotating parts mount at these hub positions (model space of the base)
set('ferris_base', { hubY: 31.5 });
set('turbine_tower', { hubY: 83.1, hubZ: 4.6 });
// long thin extras (a balloon's string) shouldn't make something feel bigger than it is
set('balloon', { pickScale: 0.5 });
// wall segments are long and thin: count them about as big as they are tall
set('wall_seg', { pickScale: 0.6 });
set('wall_slogan', { pickScale: 0.6 });
// low, wide things look smaller than their outline says (a hill is a hump in the ground, a flower bed
// a low ring): count them smaller, so they roll up about when they start to look as if they would
set('hill_small', { pickScale: 0.72 }); // 85 m across but 18 m high: from a ~75 m ball, not ~104 m
// hills and mountains collide along their slopes, not as a cylinder round the whole foot
for (const id of ['hill_small', 'mountain_green', 'mountain_rocky', 'mountain_karst']) set(id, { terrain: true });
set('flower_bed', { pickScale: 0.82 });
set('lotus', { pickScale: 0.76 });
set('washbasin', { pickScale: 0.7 });
set('kid_balloon', { pickScale: 0.75 });
set('spinning_top', { mover: { kind: 'spin', axis: 'y', speed: 14 } });
// high-speed rail: rail top at 12.62 m, tracks 2.5 m either side of the viaduct's centre line;
// only the pier is solid so small balls can roll underneath the deck
set('viaduct', { railY: 12.62, trackOffset: 2.5, hit: { hw: 1.6, hd: 1.6, h: 12 }, shape: 'box' });
// gates you can roll through while small enough: solid pillars and beams, open bays
set('compound_gate', {
  hits: [
    { ox: -4.9, hw: 1.85, hd: 1.95, h: 5 }, // guardhouse and left pillar
    { ox: 5.95, hw: 0.75, hd: 0.9, h: 5 }, // right pillar
    { hw: 6.7, hd: 0.9, y0: 4.8, h: 2.9 }, // beam and roof
    { ox: 3.35, oz: -0.6, hw: 2, hd: 0.3, h: 1.95 }, // folded sliding gate and its drive head
    { ox: 2.75, oz: 1.2, hw: 2.2, hd: 0.25, y0: 0.85, h: 0.2 }, // boom barrier arm
    { ox: 4.7, oz: 1.2, hw: 0.25, hd: 0.25, h: 1.1 }, // its post
  ],
});
set('arch_gate', {
  hits: [
    ...[-5.6, -1.9, 1.9, 5.6].map(x => ({ ox: x, hw: 0.48, hd: 1, h: Math.abs(x) < 3 ? 7.5 : 5.95 })),
    { ox: -3.75, hw: 2.2, hd: 1.45, y0: 3.7, h: 6.3 },
    { ox: 3.75, hw: 2.2, hd: 1.45, y0: 3.7, h: 6.3 },
    { hw: 1.9, hd: 1.45, y0: 4.45, h: 5.55 },
  ],
});
// trees: the trunk is solid, the crown only up where the leaves are, so a small ball rolls in under
// the branches instead of bumping into thin air metres from the trunk
const tree = (id, trunk, top, ox = 0) => set(id, { hits: [{ ox, hw: trunk, hd: trunk, h: top, cyl: true }, { bbox: true, y0: top, cyl: true }] });
tree('tree_plane', 0.4, 3.3);
tree('tree_willow', 0.45, 2.3, 0.12); // (its hanging strands come down to about here)
tree('tree_pine', 0.45, 3.2, 0.05);
tree('tree_ginkgo', 0.35, 3.9); // (the carpet of fallen leaves is flat: roll over it)
tree('tree_peach', 0.25, 1.9);
tree('tree_camphor', 0.55, 3.3);
// street furniture with arms over the road: the pole is solid, the arm only up where it is
set('street_lamp', {
  hits: [
    { hw: 0.28, hd: 0.28, h: 0.7 }, // footing
    { hw: 0.13, hd: 0.13, y0: 0.7, h: 5.2 }, // pole
    { hw: 0.55, hd: 0.06, y0: 3.25, h: 1.15 }, // banners
    { hw: 1.9, hd: 0.2, y0: 5.25, h: 0.75 }, // arms and lamps
  ],
});
set('traffic_light', {
  hits: [
    { ox: -1.55, hw: 0.3, hd: 0.3, h: 0.4 }, // footing
    { ox: -1.55, hw: 0.13, hd: 0.13, y0: 0.4, h: 4.8 }, // pole
    { ox: -1.25, hw: 0.2, hd: 0.15, y0: 2.7, h: 1.0 }, // signal on the pole
    { ox: 0.25, hw: 1.85, hd: 0.2, y0: 4.2, h: 0.95 }, // arm and hanging signals
  ],
});
set('koi', { sfx: 'splash' });
set('duck', { sfx: 'quack' });
set('clay_kid', { hidden: true });
