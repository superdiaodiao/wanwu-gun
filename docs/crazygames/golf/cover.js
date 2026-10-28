// The CrazyGames covers: the goose after the ball on hole 5, seen close up, with the title over it.
// Run against the site build (node build.mjs golf), e.g. the 16:9 one:
//   node tools/shot.mjs 'dist/golf.html?lang=en' cover-1920x1080.png --w=1920 --h=1080 --gl=gpu --wait=2000 \
//     --eval="window.__C={cam:[0.2,0.85,0.4],look:[0.9,0.3,-2.4],fov:42,title:'left:70px;bottom:70px',size:170};$(cat docs/crazygames/golf/cover.js)"
// 800x1200: cam [0.55,1.25,1.5], look [0.75,0.4,-2.3], title 'left:0;right:0;top:60px', size 125, stroke 11, drop 8
// 800x800:  cam [0.35,0.95,0.9], look [0.85,0.32,-2.3], title 'left:36px;bottom:40px', size 105, stroke 10, drop 7
// window.__C = { cam, look, fov, gap (goose-ball distance to stop at), title: css placing #ttl, size, stroke, drop }
(async () => {
  const C = window.__C, g = window.__golf, G = g.G;
  window.requestAnimationFrame = () => 0;
  g.load(4);
  for (const id of ['hud', 'card', 'loading']) document.getElementById(id).style.display = 'none';
  for (let i = 0; i < 30; i++) g.step(1 / 60, false);
  // the ball rolls toward the camera, the goose comes after it
  Object.assign(G.ball, { x: C.bx ?? 1.15, z: C.bz ?? -1.9, vx: C.bvx ?? -0.15, vz: C.bvz ?? 1.25 });
  G.state = 'roll'; G.still = 0; G.rollT = 0; G.strokes = 1;
  const goose = G.course.group.children.find(o => o.isGroup && o.children[0] && o.children[0].geometry === g.spec('goose').geometry);
  let k = 0;
  while (k++ < 600) {
    g.step(1 / 60, false);
    const d = Math.hypot(goose.position.x - G.ball.x, goose.position.z - G.ball.z);
    if (d < (C.gap ?? 0.75)) break;
  }
  const cam = g.engine.camera;
  cam.fov = C.fov ?? 40;
  cam.aspect = innerWidth / innerHeight;
  cam.position.set(...C.cam);
  cam.lookAt(...C.look);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  // (the ball's dark rim, there to find it from afar, is just a black ring this close)
  g.engine.scene.traverse(o => { if (o.material && o.material.side === 1 && o.material.color && o.material.color.getHex() === 0x2f5a2c) o.visible = false; });
  g.step(1 / 60); // draws (with the camera as set: aim() only runs on load and resize)
  cam.position.set(...C.cam); cam.lookAt(...C.look); cam.updateMatrixWorld();
  g.engine.renderer.render(g.engine.scene, cam);
  // the title
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Lilita+One&display=block';
  document.head.appendChild(l);
  await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 5000); });
  await document.fonts.load('80px "Lilita One"');
  const t = document.createElement('div');
  t.id = 'ttl';
  t.innerHTML = '<div class="a">Backyard</div><div class="b">Mini Golf</div>';
  const s = document.createElement('style');
  s.textContent = `#ttl{position:fixed;z-index:9;font-family:"Lilita One";line-height:.92;text-align:center;transform:rotate(-4deg);${C.title}}
#ttl div{color:#fff;-webkit-text-stroke:${C.stroke ?? 14}px #24543a;paint-order:stroke fill;text-shadow:0 ${C.drop ?? 10}px 0 #24543a}
#ttl .a{font-size:${C.size * 0.62}px;letter-spacing:1px}
#ttl .b{font-size:${C.size}px;color:#ffd34d}`;
  document.head.appendChild(s);
  document.body.appendChild(t);
  await new Promise(r => setTimeout(r, 300));
  return 'goose ' + goose.position.x.toFixed(2) + ',' + goose.position.z.toFixed(2) + ' ball ' + G.ball.x.toFixed(2) + ',' + G.ball.z.toFixed(2) + ' k=' + k;
})()
