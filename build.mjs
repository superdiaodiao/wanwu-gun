// Build: bundle ES modules with esbuild, then inline the bundle into a single self-contained HTML file.
//
//   node build.mjs game [--dev] [--watch]         -> dist/index.html (+ dist/index.artifact.html and dist/site/
//                                                    when not --dev: see assembleSite)
//   node build.mjs gallery [--only=small,street]  -> dist/gallery.html  (or dist/gallery-<only>.html)
//   node build.mjs audio                          -> dist/audio-test.html
//
// Templates live in src/<name>.html and contain two marked sections:
//   <!--HEAD--> ... <!--/HEAD-->   (title, font links)
//   <!--BODY--> ... <!--/BODY-->   (markup)
// and src/<name>.css (optional) is inlined as a <style> block.
import * as esbuild from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--')) || 'game';
const dev = args.includes('--dev');
const watch = args.includes('--watch');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);

fs.mkdirSync('dist', { recursive: true });

const escapeScript = js => js.replace(/<\/script/gi, '<\\/script');

function page(tplName, script) {
  const tpl = fs.readFileSync(`src/${tplName}.html`, 'utf8');
  const head = (tpl.match(/<!--HEAD-->([\s\S]*?)<!--\/HEAD-->/) || [, ''])[1].trim();
  const body = (tpl.match(/<!--BODY-->([\s\S]*?)<!--\/BODY-->/) || [, ''])[1].trim();
  const cssFile = `src/${tplName}.css`;
  const css = fs.existsSync(cssFile) ? `<style>\n${fs.readFileSync(cssFile, 'utf8')}\n</style>` : '';
  const full = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
${head}
${css}
</head>
<body>
${body}
${script}
</body>
</html>
`;
  return { head, css, body, full };
}

function assemble(tplName, js, outName, artifact) {
  const script = `<script>${escapeScript(js)}</script>`;
  const { head, css, body, full } = page(tplName, script);
  fs.writeFileSync(`dist/${outName}.html`, full);
  // Artifact variant: the host wraps content in its own <html>/<head>/<body> skeleton.
  if (artifact) fs.writeFileSync(`dist/${outName}.artifact.html`, `${head}\n${css}\n${body}\n${script}\n`);
  const kb = (Buffer.byteLength(full) / 1024).toFixed(0);
  console.log(`[build] dist/${outName}.html  ${kb} KB  ${new Date().toLocaleTimeString()}`);
}

// The site as published on GitHub Pages (dist/site/, copied to the repo root by `npm run build`): the
// page without the game inlined, plus the game as its own file, wanwu.<hash>.js. github.io is slow
// from mainland China, so the page fetches that file from Tencent Cloud COS there (going by the time
// zone) and from next to itself everywhere else, trying the other place if one fails or takes over
// 12 s. The file refuses to start a second game if both copies end up arriving. Each new build has a
// new name, so it can be cached for good. dist/cos/ holds the gzipped copy for the bucket: upload it
// to the bucket root with Content-Encoding: gzip, Content-Type: application/javascript; charset=utf-8
// and Cache-Control: public, max-age=31536000, immutable (COS stores files as they are).
const COS_BASE = 'https://wan-wu-gun-1318514885.cos.ap-guangzhou.myqcloud.com/';
function assembleSite(tplName, js) {
  const code = `if (!window.__wanwuBoot) {\nwindow.__wanwuBoot = 1;\n${js}\n}\n`;
  const file = `wanwu.${crypto.createHash('sha256').update(code).digest('hex').slice(0, 8)}.js`;
  fs.rmSync('dist/site', { recursive: true, force: true });
  fs.mkdirSync('dist/site');
  fs.writeFileSync(`dist/site/${file}`, code);
  fs.rmSync('dist/cos', { recursive: true, force: true });
  fs.mkdirSync('dist/cos');
  fs.writeFileSync(`dist/cos/${file}`, zlib.gzipSync(code, { level: 9 }));
  const loader = `<script>(function () {
  var file = '${file}', cos = '${COS_BASE}' + file, cn = false, i = 0;
  try { cn = /^(Asia\\/(Shanghai|Chongqing|Harbin|Urumqi|Kashgar)|PRC)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) {}
  var order = cn ? [cos, file] : [file, cos];
  function next() {
    if (window.__wanwuBoot || i >= order.length) return;
    var s = document.createElement('script');
    s.src = order[i++];
    s.onerror = next;
    document.body.appendChild(s);
    setTimeout(next, 12000);
  }
  next();
})();</script>`;
  fs.writeFileSync('dist/site/index.html', page(tplName, loader).full);
  const kb = f => (fs.statSync(f).size / 1024).toFixed(0);
  console.log(`[build] dist/site/index.html + ${file} (${kb(`dist/site/${file}`)} KB; gzipped for COS in dist/cos/, ${kb(`dist/cos/${file}`)} KB)`);
}

// While the audio module is still being written, resolve it to a silent stand-in so the game builds.
const audioFallback = {
  name: 'audio-fallback',
  setup(b) {
    b.onResolve({ filter: /audio\/audio\.js$/ }, args => {
      const full = path.resolve(args.resolveDir, args.path);
      if (fs.existsSync(full)) return null;
      return { path: 'audio-stub', namespace: 'stub' };
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `const noop = () => {};
export const audio = new Proxy({ ready: false, musicOn: true, muted: false, init: async () => {} }, {
  get: (t, k) => (k in t ? t[k] : noop),
});`,
      loader: 'js',
    }));
  },
};

// every CJK character used anywhere in the sources: the font loader requests exactly these glyphs
function collectGlyphs() {
  const set = new Set();
  const walk = dir => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f)) for (const ch of fs.readFileSync(p, 'utf8').match(/[\u3400-\u9fff\uff01-\uff5e\u3001-\u303f]/g) || []) set.add(ch);
    }
  };
  walk('src/catalog'); // only text painted into decals needs the web fonts; the DOM loads its own
  return [...set].join('');
}

const base = {
  plugins: [audioFallback],
  bundle: true,
  format: 'iife',
  minify: !dev,
  write: false,
  target: 'es2020',
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
  define: { __DEV__: dev ? 'true' : 'false', __GLYPHS__: JSON.stringify(collectGlyphs()) },
};

let opts, tplName, outName, artifact = false;
if (target === 'game') {
  opts = { ...base, entryPoints: ['src/main.js'] };
  tplName = 'index'; outName = 'index'; artifact = !dev;
} else if (target === 'gallery') {
  const parts = only ? only.split(',').map(k => `./src/catalog/${k.trim()}.js`) : ['./src/catalog/index.js'];
  const contents = parts.map(p => `import '${p}';`).join('\n') + `\nimport './src/gallery.js';\n`;
  opts = { ...base, stdin: { contents, resolveDir: process.cwd(), sourcefile: 'gallery-entry.js', loader: 'js' } };
  tplName = 'gallery'; outName = only ? `gallery-${only.replace(/,/g, '-')}` : 'gallery';
} else if (target === 'audio') {
  opts = { ...base, entryPoints: ['src/audio/test.js'] };
  tplName = 'audio-test'; outName = 'audio-test';
} else {
  console.error('unknown target', target); process.exit(1);
}

if (watch) {
  const ctx = await esbuild.context({
    ...opts,
    plugins: [audioFallback, {
      name: 'assemble',
      setup(b) {
        b.onEnd(r => {
          if (r.errors.length) { console.log(`[build] ${r.errors.length} error(s)`); return; }
          assemble(tplName, r.outputFiles[0].text, outName, artifact);
        });
      },
    }],
  });
  await ctx.watch();
  console.log('[build] watching…');
} else {
  try {
    const r = await esbuild.build(opts);
    assemble(tplName, r.outputFiles[0].text, outName, artifact);
    if (target === 'game' && !dev) assembleSite(tplName, r.outputFiles[0].text);
  } catch (e) {
    process.exit(1);
  }
}
