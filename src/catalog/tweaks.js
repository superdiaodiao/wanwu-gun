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
set('kid_balloon', { pickScale: 0.75 });
set('spinning_top', { mover: { kind: 'spin', axis: 'y', speed: 14 } });
// high-speed rail: rail top at 12.62 m, tracks 2.5 m either side of the viaduct's centre line;
// only the pier is solid so small balls can roll underneath the deck
set('viaduct', { railY: 12.62, trackOffset: 2.5, hit: { hw: 1.6, hd: 1.6, h: 12 }, shape: 'box' });
set('koi', { sfx: 'splash' });
set('duck', { sfx: 'quack' });
set('clay_kid', { hidden: true });
