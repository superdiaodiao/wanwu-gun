// The CrazyGames preview clips (18 s, no sound), as a --setup for tools/record.mjs against the site
// build (node build.mjs golf):
//   node tools/record.mjs 'dist/golf.html?lang=en' preview-1920x1080.mp4 --w=1920 --h=1080 --seconds=18 --gl=gpu \
//     --setup="window.__V={cam:[0.2,0.85,0.4],look:[0.9,0.3,-2.4],fov:42,holes:[3,7],title:'left:70px;bottom:70px',size:170,stroke:14,drop:10};$(cat docs/crazygames/golf/preview.js)"
//   1080x1620: cam [0.55,1.25,1.5], look [0.75,0.4,-2.3], title 'left:0;right:0;top:81px', size 169, stroke 15, drop 11
// window.__V = { cam, look, fov (the cover's camera), holes (played after the goose's), title, size, stroke, drop }.
// Opens on the cover's shot (the goose after the ball), pulls back to the game's own view while the
// goose pecks the ball away, then plays on with real drags (pointer events) chosen by a search.
(async () => {
  const V = window.__V, g = window.__golf, G = g.G, cam = g.engine.camera;
  const $ = id => document.getElementById(id);
  window.requestAnimationFrame = () => 0;
  $('banner').style.display = 'none';
  $('hint').style.display = 'none';
  const bars = ['hole', 'score', 'stars', 'mute'].map($);
  const setBars = o => bars.forEach(b => { b.style.transition = 'opacity .4s'; b.style.opacity = o; });
  setBars(0);
  g.load(4);
  for (let i = 0; i < 30; i++) g.step(1 / 60, false);
  const P1 = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
  Object.assign(G.ball, { x: 1.15, z: -1.9, vx: -0.15, vz: 1.25 });
  G.state = 'roll'; G.still = 0; G.rollT = 0; G.strokes = 1;
  const goose = G.course.group.children.find(o => o.isGroup && o.children[0] && o.children[0].geometry === g.spec('goose').geometry);
  for (let k = 0; k < 600; k++) { g.step(1 / 60, false); if (Math.hypot(goose.position.x - G.ball.x, goose.position.z - G.ball.z) < 0.75) break; }
  // the cover's camera
  cam.fov = V.fov; cam.position.set(...V.cam); cam.lookAt(...V.look); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  const P0 = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
  const rims = [];
  g.engine.scene.traverse(o => { if (o.material && o.material.side === 1 && o.material.color && o.material.color.getHex() === 0x2f5a2c) rims.push(o); });
  rims.forEach(o => (o.visible = false));
  $('tags').classList.add('out');

  // the cover's title over the opening, fading as the camera pulls back
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Lilita+One&display=block';
  document.head.appendChild(l);
  await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 5000); });
  await document.fonts.load('80px "Lilita One"');
  const ttl = document.createElement('div');
  ttl.id = 'ttl';
  ttl.innerHTML = '<div class="a">Backyard</div><div class="b">Mini Golf</div>';
  const st = document.createElement('style');
  st.textContent = `#ttl{position:fixed;z-index:9;font-family:"Lilita One";line-height:.92;text-align:center;transform:rotate(-4deg);${V.title}}
#ttl div{color:#fff;-webkit-text-stroke:${V.stroke}px #24543a;paint-order:stroke fill;text-shadow:0 ${V.drop}px 0 #24543a}
#ttl .a{font-size:${V.size * 0.62}px;letter-spacing:1px}
#ttl .b{font-size:${V.size}px;color:#ffd34d}`;
  document.head.appendChild(st);
  document.body.appendChild(ttl);
  const log = [];
  let t = 0, tw = 0, act = null, wait = 0, holeIdx = -1, start = 0;
  const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const cv = $('game');
  const fire = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true }));
  const screen = (x, z) => { const v = new cam.position.constructor(x, 0, z).project(cam); return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight]; };

  /** the best shot from here: in if anything goes in (the firmest: past the goose before it gets there), else the nearest to the cup */
  function pick() {
    const C = G.course, b = G.ball;
    let best = null;
    for (let a = 0; a < 360; a += 2) for (let p = 0.12; p <= 1.001; p += 0.04) {
      const ang = (a * Math.PI) / 180, s = g.simulate(C, b.x, b.z, ang, p, { every: 99 });
      const sc = s.sunk ? -10 - p : Math.hypot(s.x - C.cup.x, s.z - C.cup.z);
      if (!best || sc < best.sc) best = { sc, ang, p, sunk: s.sunk };
    }
    return best;
  }

  function begin(shot) {
    const b = G.ball, dx = Math.sin(shot.ang), dz = -Math.cos(shot.ang);
    const S = screen(b.x, b.z), T = screen(b.x - dx, b.z - dz);
    const L = Math.hypot(T[0] - S[0], T[1] - S[1]), px = 10 + shot.p * 0.3 * Math.min(innerWidth, innerHeight);
    const E = [S[0] + ((T[0] - S[0]) / L) * px, S[1] + ((T[1] - S[1]) / L) * px];
    fire('pointerdown', S[0], S[1]);
    act = { t: 0, S, E, shot };
  }

  window.__wanwu = {
    log,
    frame(dt) {
      t += dt;
      // the opening: hold on the cover's shot, then ease back to the game's view
      if (holeIdx < 0) {
        const k = ease(Math.max(0, Math.min(1, (t - 0.7) / 1.6)));
        ttl.style.opacity = Math.max(0, 1 - (t - 0.6) / 0.5);
        cam.position.lerpVectors(P0.pos, P1.pos, k);
        cam.quaternion.slerpQuaternions(P0.quat, P1.quat, k);
        cam.fov = P0.fov + (P1.fov - P0.fov) * k;
        cam.updateProjectionMatrix();
        if (k > 0.6) rims.forEach(o => (o.visible = true));
        if (k >= 1) { holeIdx = 0; setBars(1); log.push('pulled back ' + t.toFixed(2)); }
      }
      if (act) {
        act.t += dt;
        const k = ease(Math.min(1, act.t / 0.55));
        fire('pointermove', act.S[0] + (act.E[0] - act.S[0]) * k, act.S[1] + (act.E[1] - act.S[1]) * k);
        if (act.t >= 0.75) {
          fire('pointerup', act.E[0], act.E[1]);
          log.push(`${t.toFixed(2)} H${G.hole + 1} shot ${(act.shot.ang * 57.3).toFixed(0)}/${act.shot.p.toFixed(2)}${act.shot.sunk ? ' (in)' : ''} -> strokes ${G.strokes}`);
          act = null;
        }
      } else if (holeIdx >= 0) {
        if (G.state === 'aim' && Math.hypot(G.ball.vx, G.ball.vz) < 1e-3) {
          wait += dt;
          if (wait > (G.strokes === 0 ? 1.1 : 0.2)) { wait = 0; begin(pick()); }
        } else if (G.state === 'card') {
          wait += dt;
          if (wait > 1.1) {
            wait = 0;
            holeIdx++;
            if (holeIdx <= V.holes.length) {
              g.load(V.holes[holeIdx - 1]);
              $('tags').classList.remove('out');
              log.push(`${t.toFixed(2)} hole ${V.holes[holeIdx - 1] + 1}`);
            } else log.push(`${t.toFixed(2)} done`);
          }
        } else wait = 0;
      }
      g.step(dt);
    },
  };
  return 'ready';
})()
