// Multi-level spatial hash. Objects live in the level whose cell size fits their footprint, so a
// query stays cheap whether the ball is 10 cm (touching seeds) or 200 m (touching buildings).
const LEVELS = [0.25, 2, 16, 128, 1024];
const OFF = 1 << 20;
const key = (ix, iz) => (ix + OFF) * 2097152 + (iz + OFF);

export class SpatialGrid {
  constructor() {
    this.levels = LEVELS.map(cs => ({ cs, cells: new Map(), maxR: 0 }));
  }

  levelIndex(radius) {
    for (let i = 0; i < this.levels.length; i++) if (radius * 2 <= this.levels[i].cs) return i;
    return this.levels.length - 1;
  }

  insert(o) {
    const li = this.levelIndex(o.gridR);
    const L = this.levels[li];
    const k = key(Math.floor(o.x / L.cs), Math.floor(o.z / L.cs));
    let cell = L.cells.get(k);
    if (!cell) L.cells.set(k, (cell = []));
    o._gl = li;
    o._gk = k;
    o._gi = cell.length;
    cell.push(o);
    if (o.gridR > L.maxR) L.maxR = o.gridR;
  }

  remove(o) {
    if (o._gl === undefined || o._gl < 0) return;
    const cell = this.levels[o._gl].cells.get(o._gk);
    if (cell) {
      const last = cell.pop();
      if (last !== o) {
        cell[o._gi] = last;
        last._gi = o._gi;
      }
    }
    o._gl = -1;
  }

  /** call after changing o.x / o.z */
  move(o) {
    if (o._gl === undefined || o._gl < 0) return;
    const L = this.levels[o._gl];
    const k = key(Math.floor(o.x / L.cs), Math.floor(o.z / L.cs));
    if (k === o._gk) return;
    this.remove(o);
    this.insert(o);
  }

  /**
   * Collect objects whose footprint may overlap the circle (x, z, r) into out[].
   * Levels whose objects are negligible next to r (minLevelScale) are skipped.
   */
  query(x, z, r, out, skipBelow = 0) {
    out.length = 0;
    for (let li = 0; li < this.levels.length; li++) {
      const L = this.levels[li];
      if (L.cells.size === 0) continue;
      if (L.cs < skipBelow) continue;
      const reach = r + L.maxR;
      const x0 = Math.floor((x - reach) / L.cs), x1 = Math.floor((x + reach) / L.cs);
      const z0 = Math.floor((z - reach) / L.cs), z1 = Math.floor((z + reach) / L.cs);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 20000) continue; // absurdly many cells: these objects are dust
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const cell = L.cells.get(key(ix, iz));
          if (cell) for (let i = 0; i < cell.length; i++) out.push(cell[i]);
        }
      }
    }
    return out;
  }
}
