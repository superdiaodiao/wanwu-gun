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
set('koi', { sfx: 'splash' });
set('duck', { sfx: 'quack' });
set('clay_kid', { hidden: true });
