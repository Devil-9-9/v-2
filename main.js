import { Game } from './core/Game.js';
import { getUniqueId, copyToClipboard } from './multiplayer/UniqueID.js';
import { Network } from './multiplayer/Network.js';
import { DesktopControls } from './controls/DesktopControls.js';
import { MobileControls, isTouchDevice } from './controls/MobileControls.js';
import { HudEditor } from './ui/HudEditor.js';

const $ = (id) => document.getElementById(id);
const touch = isTouchDevice();
const myId = getUniqueId();
$('my-id').textContent = myId;

// ---- network (optional: the game works fully offline against bots) ----
const net = new Network(myId);
net.onStatus = (s) => { $('net-status').textContent = s; };
net.start();

// ---- game ----
let game;
try {
  game = new Game({ canvas: $('game'), net, myId, touch });
  game.loadWorld(net.hostSeed, [], $('opt-bots').checked);
} catch (err) {
  $('net-status').textContent = 'Could not start 3D: ' + err.message;
  console.error(err);
  throw err;
}

net.onSeed = (seed, edits) => {
  game.loadWorld(seed, edits, $('opt-bots').checked);
  game.player.sens = sens;
  game.hud.toast('Joined host world');
};

// ---- controls ----
const desktop = new DesktopControls(game.input, $('game'));
desktop.getMode = () => game.mode;
const mobile = new MobileControls(game.input);
mobile.getMode = () => game.mode;

// ---- look sensitivity (saved) ----
const SENS_KEY = 'blockops.sens';
let sens = 1;
try { const v = parseFloat(localStorage.getItem(SENS_KEY)); if (v >= 0.4 && v <= 3) sens = v; } catch (_) { /* storage blocked */ }
$('pm-sens').value = sens;
game.player.sens = sens;
$('pm-sens').addEventListener('input', (e) => {
  sens = Number(e.target.value); game.player.sens = sens;
  try { localStorage.setItem(SENS_KEY, String(sens)); } catch (_) { /* ignore */ }
});

// ---- pause + HUD editor ----
let editFrom = 'menu';
const editor = new HudEditor({ touch, onExit: () => {
  if (touch) mobile.setEditing(false);
  if (editFrom === 'menu') {                                  // back to the main menu, hide the game HUD again
    game.hud.show(false);
    if (touch) mobile.setEnabled(false);
    $('menu').classList.remove('hidden');
  } else $('pause-menu').classList.remove('hidden');          // back to the pause menu
} });

function startEdit(from) {
  editFrom = from;
  $('menu').classList.add('hidden'); $('pause-menu').classList.add('hidden');
  game.hud.show(true);
  if (touch) { mobile.setEnabled(true); mobile.setEditing(true); }
  editor.enter();
}

function pause() {
  if (!game.running || game.paused || editor.active) return;
  game.paused = true;
  game.input.reset();
  desktop.setEnabled(false);
  $('pause-menu').classList.remove('hidden');
  document.exitPointerLock?.();
}

function resume() {
  $('pause-menu').classList.add('hidden');
  game.paused = false;
  game.input.reset();
  game.last = performance.now();
  if (!touch) { desktop.setEnabled(true); $('game').requestPointerLock?.(); }
}

$('menu-hud-btn').addEventListener('click', () => startEdit('menu'));
$('pm-hud').addEventListener('click', () => startEdit('pause'));
$('pm-resume').addEventListener('click', resume);
$('pm-menu').addEventListener('click', () => location.reload());
$('pause-btn').addEventListener('click', pause);
document.addEventListener('pointerlockchange', () => {      // Esc on desktop releases the mouse -> pause
  if (!touch && game.running && !game.paused && !editor.active && document.pointerLockElement !== $('game')) pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---- main menu ----
$('copy-id').addEventListener('click', async () => {
  const ok = await copyToClipboard(myId);
  $('copy-id').textContent = ok ? 'COPIED' : 'SELECT';
  setTimeout(() => ($('copy-id').textContent = 'COPY'), 1400);
});
$('join-btn').addEventListener('click', () => net.join($('friend-id').value));
$('friend-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') net.join($('friend-id').value); });

async function deploy() {
  game.audio.unlock();
  $('menu').classList.add('hidden');
  game.hud.show(true);
  game.paused = false;
  if (touch) {
    mobile.setEnabled(true);
    try { await document.documentElement.requestFullscreen?.(); } catch (_) { /* iOS Safari: not supported */ }
    try { await screen.orientation?.lock?.('landscape'); } catch (_) { /* needs fullscreen/PWA */ }
  } else {
    desktop.setEnabled(true);
    $('game').requestPointerLock?.();
  }
  game.start();
  updateRotateHint();
}
$('play-btn').addEventListener('click', deploy);
$('opt-bots').addEventListener('change', () => game.loadWorld(game.seed, [...game.world.edits].map(([k, v]) => [...k.split(',').map(Number), v]), $('opt-bots').checked));

function updateRotateHint() {
  const portrait = touch && window.innerHeight > window.innerWidth && game.running;
  $('rotate-hint').classList.toggle('hidden', !portrait);
}
window.addEventListener('resize', updateRotateHint);

window.__game = game; // handy for debugging in the console
