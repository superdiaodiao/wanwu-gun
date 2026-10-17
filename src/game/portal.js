// The game portal's SDK, in the CrazyGames build only (elsewhere every call does nothing). CrazyGames
// counts a player as converted once the game says gameplay started, and reads the playtime from the
// gameplay start/stop pairs; without the SDK it can only guess. Their SDK v3:
// https://docs.crazygames.com/sdk/html5-v3/
//   loadingStart / loadingStop   around boot (the page is up until the title screen shows)
//   gameplayStart / gameplayStop  while a game is actually being played (not the title, the story
//                                 before it, pause, the 图鉴, the finale or the results)
// The script loads alongside the boot and never holds it up: calls made before the SDK is ready are
// replayed once it is (only the last gameplay state matters), and if it fails to load the game runs
// without it.

const PLATFORM = typeof __PLATFORM__ !== 'undefined' ? __PLATFORM__ : 'site';
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const on = PLATFORM === 'crazygames' && typeof document !== 'undefined';

let sdk = null;          // window.CrazyGames.SDK once init is done
let loading = null;      // true between loadingStart and loadingStop, as asked so far
let playing = false;     // gameplay state as asked so far
let sentLoading = null, sentPlaying = false;

function send() {
  if (!sdk) return;
  try {
    if (loading !== sentLoading) {
      if (loading) sdk.game.loadingStart(); else if (sentLoading) sdk.game.loadingStop();
      sentLoading = loading;
    }
    if (playing !== sentPlaying) {
      if (playing) sdk.game.gameplayStart(); else sdk.game.gameplayStop();
      sentPlaying = playing;
    }
  } catch (e) { console.warn('[portal]', e); }
}

/** at the very start of boot: fetch the SDK and say the game is loading */
export function portalInit() {
  if (!on) return;
  loading = true;
  const s = document.createElement('script');
  s.src = SDK_URL;
  s.async = true;
  s.onload = async () => {
    try {
      const SDK = window.CrazyGames && window.CrazyGames.SDK;
      if (!SDK) return;
      await SDK.init();
      sdk = SDK;
      send();
    } catch (e) { console.warn('[portal] init failed', e); }
  };
  s.onerror = () => console.warn('[portal] SDK did not load');
  document.head.appendChild(s);
}

/** the title screen is up */
export function portalLoaded() {
  if (!on || !loading) return;
  loading = false;
  send();
}

/** whether a game is being played right now (called every frame and on visibility changes; only a
 *  change is sent) */
export function portalPlaying(now) {
  if (!on || now === playing) return;
  playing = now;
  send();
}
