// Build: bundle ES modules with esbuild, then inline the bundle into a single self-contained HTML file.
//
//   node build.mjs game [--dev] [--watch]         -> dist/index.html (+ dist/index.artifact.html and dist/site/
//                                                    when not --dev: see assemblePublished)
//   node build.mjs crazygames                     -> dist/crazygames/index.html + dist/crazygames.zip, the
//                                                    upload for CrazyGames (no links to the site, no stats)
//   node build.mjs golf                           -> dist/golf.html (小区高尔夫) and dist/golf-site/: see
//                                                    assemblePublished
//   node build.mjs golf-crazygames                -> dist/crazygames-golf/index.html + dist/crazygames-golf.zip
//   node build.mjs gallery [--only=small,street]  -> dist/gallery.html  (or dist/gallery-<only>.html)
//   node build.mjs audio                          -> dist/audio-test.html
//
// Templates live in src/<name>.html and contain two marked sections:
//   <!--HEAD--> ... <!--/HEAD-->   (title, font links)
//   <!--BODY--> ... <!--/BODY-->   (markup)
// and src/<name>.css (optional) is inlined as a <style> block.
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cdnLoader, cdnRev, wrap } from './tools/cdn-loader.mjs';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--')) || 'game';
const dev = args.includes('--dev');
const watch = args.includes('--watch');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
const cdnArg = (args.find(a => a.startsWith('--cdn=')) || '').slice(6); // (see assemblePublished)

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

// The pages as published on GitHub Pages: the page without the game inlined, plus the game as its own
// file next to it, named after its contents so it can be cached for good:
//   game: dist/site/ (index.html + wanwu.<hash>.js), copied to the repo root by `npm run build`
//   golf: dist/golf-site/ (index.html + golf.<hash>.js), copied to golf/ on main
// From mainland China the page fetches the file from jsDelivr, at the commit on main that added it
// (tools/cdn-loader.mjs says how and why). So a release goes out in two steps: build, commit the new
// .js file to main and push; build again (it finds that commit on origin/main, or take --cdn=<commit>;
// the file comes out the same) and commit the page. Built before the file is on main, the page loads
// it from next to itself only, slowly from China: the build says so.
function assemblePublished({ tplName, js, dir, name, repoDir, boot, report, text }) {
  const code = wrap(js, boot);
  const file = `${name}.${crypto.createHash('sha256').update(code).digest('hex').slice(0, 8)}.js`;
  const repoPath = repoDir + file;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  fs.writeFileSync(`${dir}/${file}`, code);
  const rev = cdnRev(repoPath, code, cdnArg);
  fs.writeFileSync(`${dir}/index.html`, page(tplName, cdnLoader({ file, path: repoPath, code, rev, boot, report, text })).full);
  const kb = f => (fs.statSync(f).size / 1024).toFixed(0);
  console.log(`[build] ${dir}/index.html (${kb(`${dir}/index.html`)} KB) + ${file} (${kb(`${dir}/${file}`)} KB)`
    + (rev ? `, from China via jsDelivr at ${rev}` : `\n[build] NOTE: ${repoPath} isn't on origin/main yet, so this page doesn't use jsDelivr (slow from China): commit and push the .js file to main, then build again and commit the page`));
}
const assembleSite = (tplName, js) => assemblePublished({ tplName, js, dir: 'dist/site', name: 'wanwu', repoDir: '', boot: '__wanwuBoot', report: '__wanwuLoad', text: '#loading-text' });
const assembleGolfSite = js => assemblePublished({ tplName: 'golf', js, dir: 'dist/golf-site', name: 'golf', repoDir: 'golf/', boot: '__golfBoot', report: '__golfLoad', text: '#loading div' });

/** the page with nothing but ASCII in it: HTML character references in the markup, CSS escapes in
 *  <style>, \u escapes in the script (esbuild's ascii charset leaves regular expressions alone; a
 *  \u escape per UTF-16 unit works in strings, regular expressions and names alike) */
function asciiHtml(html) {
  const ref = s => s.replace(/[^\x00-\x7f]/gu, c => `&#x${c.codePointAt(0).toString(16)};`);
  const css = s => s.replace(/[^\x00-\x7f]/gu, c => `\\${c.codePointAt(0).toString(16)} `);
  const js = s => s.replace(/[^\x00-\x7f]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const out = html.replace(/(<style>)([\s\S]*?)(<\/style>)|(<script>[\s\S]*?<\/script>)|([^<]+|<)/g, (m, a, body, z, script, rest) =>
    a ? a + css(body) + z : script ? js(script) : ref(rest));
  if (/[^\x00-\x7f]/.test(out)) throw new Error('crazygames: non-ASCII left in the page');
  return out;
}

// the golf page's own name and description in English, for CrazyGames (the page says them before
// the game has started, and the game is English there for nearly everyone)
const GOLF_EN = { title: 'Backyard Mini Golf', description: 'Mini golf through four backyards, from a duck pond and a pool party to a pumpkin patch and a snow day: 36 holes of fans, traffic, geese, cats, hens, mud and ice.' };
function assembleCrazyGames(name) {
  fs.rmSync(`dist/${name}`, { recursive: true, force: true });
  fs.mkdirSync(`dist/${name}`);
  let html = fs.readFileSync(`dist/${name}.html`, 'utf8');
  if (name === 'crazygames-golf') {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${GOLF_EN.title}</title>`)
      .replace(/(<meta name="description" content=")[^"]*/, `$1${GOLF_EN.description}`);
  }
  fs.writeFileSync(`dist/${name}/index.html`, asciiHtml(html));
  fs.rmSync(`dist/${name}.html`);
  fs.rmSync(`dist/${name}.zip`, { force: true });
  execFileSync('zip', ['-q', '-9', `../${name}.zip`, 'index.html'], { cwd: `dist/${name}` });
  const kb = f => (fs.statSync(f).size / 1024).toFixed(0);
  console.log(`[build] dist/${name}/index.html ${kb(`dist/${name}/index.html`)} KB → dist/${name}.zip ${kb(`dist/${name}.zip`)} KB`);
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

// 小区高尔夫 is built from the game's catalog and English, and leaves out what only the game uses
// (the golf pages only):
// - models: golf names every model it uses as a string somewhere under src/golf/ (a hole's props, a
//   look's lists). A catalog def() of a model named nowhere there is left out, with whatever only it
//   used. The decals all stay, so the texture atlas is the same.
// - English (en/ui.js): an entry is left out when its Chinese is in the game's own files and in none
//   of the files the golf page is made of.
const walkSrc = (dir, re, out = []) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkSrc(p, re, out);
    else if (re.test(f)) out.push(p);
  }
  return out;
};
const golfOnly = {
  name: 'golf-only',
  setup(b) {
    let named, golfText, gameText;
    b.onStart(async () => {
      named = new Set();
      for (const f of walkSrc('src/golf', /\.js$/)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/(['"`])([\w-]+)\1/g)) named.add(m[2]);
      // the files the page is made of: a quick bundle of the same entry, for its list of inputs
      const { metafile } = await esbuild.build({ entryPoints: b.initialOptions.entryPoints, bundle: true, write: false, metafile: true, plugins: [audioFallback], define: b.initialOptions.define, logLevel: 'silent' });
      const golf = new Set(Object.keys(metafile.inputs).filter(f => f.startsWith('src/') && !f.startsWith('src/i18n/')).concat('src/golf.html'));
      golfText = [...golf].map(f => fs.readFileSync(f, 'utf8')).join('\n');
      gameText = walkSrc('src', /\.(js|html)$/).filter(f => !golf.has(f) && !f.startsWith('src/i18n/')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    });
    b.onLoad({ filter: /[\\/]src[\\/]catalog[\\/]\w+\.js$/ }, args => ({
      contents: fs.readFileSync(args.path, 'utf8').replace(/^def\((['"])([\w-]+)\1/gm, (m, q, id) => (named.has(id) ? m : 'if (0) ' + m)),
      loader: 'js',
    }));
    b.onLoad({ filter: /[\\/]src[\\/]i18n[\\/]en[\\/]ui\.js$/ }, async args => {
      const { UI } = await import(`${pathToFileURL(args.path).href}?${Date.now()}`);
      const ui = Object.fromEntries(Object.entries(UI).filter(([zh]) => golfText.includes(zh) || !gameText.includes(zh)));
      return { contents: `export const UI = ${JSON.stringify(ui)};\n`, loader: 'js' };
    });
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
  define: { __DEV__: dev ? 'true' : 'false', __GLYPHS__: JSON.stringify(collectGlyphs()), __PLATFORM__: '"site"' },
};

let opts, tplName, outName, artifact = false;
if (target === 'game') {
  opts = { ...base, entryPoints: ['src/main.js'] };
  tplName = 'index'; outName = 'index'; artifact = !dev;
} else if (target === 'crazygames') {
  // __PLATFORM__ 'crazygames': the game says nothing about the site (no URL in shared results) and
  // sends no statistics; the zip holds just index.html, the whole game in one file
  // (ASCII only: the portal's server mangled multi-byte characters here and there in the file, so
  // every non-ASCII character in the script is escaped, and the page's in assembleCrazyGames)
  opts = { ...base, charset: 'ascii', define: { ...base.define, __PLATFORM__: '"crazygames"' }, entryPoints: ['src/main.js'] };
  tplName = 'index'; outName = 'crazygames';
} else if (target === 'gallery') {
  const parts = only ? only.split(',').map(k => `./src/catalog/${k.trim()}.js`) : ['./src/catalog/index.js'];
  const contents = parts.map(p => `import '${p}';`).join('\n') + `\nimport './src/gallery.js';\n`;
  opts = { ...base, stdin: { contents, resolveDir: process.cwd(), sourcefile: 'gallery-entry.js', loader: 'js' } };
  tplName = 'gallery'; outName = only ? `gallery-${only.replace(/,/g, '-')}` : 'gallery';
} else if (target === 'audio') {
  opts = { ...base, entryPoints: ['src/audio/test.js'] };
  tplName = 'audio-test'; outName = 'audio-test';
} else if (target === 'golf') {
  // 小区高尔夫: a separate mini-golf game built from the same models
  opts = { ...base, plugins: [audioFallback, golfOnly], entryPoints: ['src/golf/main.js'] };
  tplName = 'golf'; outName = 'golf';
} else if (target === 'golf-crazygames') {
  // its upload for CrazyGames, made the same way as the game's (above)
  opts = { ...base, charset: 'ascii', define: { ...base.define, __PLATFORM__: '"crazygames"' }, plugins: [audioFallback, golfOnly], entryPoints: ['src/golf/main.js'] };
  tplName = 'golf'; outName = 'crazygames-golf';
} else {
  console.error('unknown target', target); process.exit(1);
}

if (watch) {
  const ctx = await esbuild.context({
    ...opts,
    plugins: [...opts.plugins, {
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
    if (target === 'golf' && !dev) assembleGolfSite(r.outputFiles[0].text);
    if (target === 'crazygames' || target === 'golf-crazygames') assembleCrazyGames(outName);
  } catch (e) {
    if (!e.errors) console.error('[build]', e.message); // (esbuild has said what went wrong itself)
    process.exit(1);
  }
}
