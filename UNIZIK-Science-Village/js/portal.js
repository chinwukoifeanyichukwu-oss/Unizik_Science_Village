import { PortalScene } from './scene.js?v=4';
import { PortalLoader, withMinimumDuration } from './loader.js?v=4';

// ---------------------------------------------------------------------
// DOM REFERENCES
// ---------------------------------------------------------------------
const canvas = document.getElementById('portal-canvas');
const entranceCard = document.getElementById('entrance-card');
const errorPanel = document.getElementById('error-panel');
const enterButton = document.getElementById('enter-button');
const enterButtonLabel = document.getElementById('enter-button-label');
const sliderTrack = document.getElementById('slider-track');
const sliderFill = document.getElementById('slider-fill');
const sliderLabel = document.getElementById('slider-label');
const sliderHandle = document.getElementById('slider-handle');
const statusLabel = document.getElementById('status-label');
const progressFill = document.getElementById('progress-fill');
const progressPercent = document.getElementById('progress-percent');
const progressTrack = document.getElementById('progress-track');
const blackoutOverlay = document.getElementById('blackout-overlay');
const welcomeText = document.getElementById('welcome-text');

let portalScene = null;

// ---------------------------------------------------------------------
// CARD TILT
// A subtle perspective tilt that follows the cursor — gives the glass
// card a tactile, physical-object feel rather than a flat overlay.
// Disabled once the entry sequence starts, and skipped entirely for
// people who've asked for reduced motion.
// ---------------------------------------------------------------------
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let tiltEnabled = !prefersReducedMotion;

function handleCardTilt(event) {
  if (!tiltEnabled) return;

  const rect = entranceCard.getBoundingClientRect();
  const cardCenterX = rect.left + rect.width / 2;
  const cardCenterY = rect.top + rect.height / 2;

  // Only tilt while the cursor is reasonably close to the card —
  // avoids a distracting effect triggered from across the screen.
  const maxDistance = 420;
  const dx = event.clientX - cardCenterX;
  const dy = event.clientY - cardCenterY;
  if (Math.hypot(dx, dy) > maxDistance) return;

  const maxTilt = 5; // degrees
  const rotateY = (dx / (rect.width / 2)) * maxTilt;
  const rotateX = -(dy / (rect.height / 2)) * maxTilt;

  entranceCard.style.transform = `translateX(-50%) perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
}

window.addEventListener('pointermove', handleCardTilt);

// ---------------------------------------------------------------------
// LOADING SEQUENCE
//
// The gate is procedural, so "loading" is really "constructing the
// scene" plus a minimum on-screen duration. Each task's label drives
// the status line text so the user still sees the staged messaging
// the design calls for (initializing -> loading assets -> ready).
// ---------------------------------------------------------------------
function updateProgressUI({ percent, label }) {
  progressFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  progressTrack.setAttribute('aria-valuenow', String(percent));
  statusLabel.textContent = label;
}

function showError(error) {
  console.error('Portal initialization failed:', error);
  entranceCard.hidden = true;
  errorPanel.hidden = false;
  enterButton.disabled = true;
  sliderHandle.disabled = true;
  enterButtonLabel.textContent = 'Unavailable';
}

async function initializePortal() {
  const tasks = [
    {
      label: 'Initializing system',
      run: () => {
        portalScene = new PortalScene(canvas);
      },
    },
    {
      label: 'Loading architectural assets',
      run: withMinimumDuration(() => {
        // Gate geometry, floor grid, and particle field are already
        // built inside the PortalScene constructor above. This stage
        // exists to give the loading UI a believable second beat.
      }, 500),
    },
    {
      label: 'System ready',
      run: withMinimumDuration(() => {
        portalScene.start();
      }, 300),
    },
  ];

  const loader = new PortalLoader(tasks, updateProgressUI);
  await loader.run();

  enterButton.disabled = false;
  sliderHandle.disabled = false;
  enterButtonLabel.textContent = 'or press Enter';
}

// ---------------------------------------------------------------------
// ENTRY SEQUENCE
// UI dissolve -> blackout -> gate ignition + welcome text -> fly-through
// -> redirect to map.html. Each phase is awaited so the redirect only
// fires once the cinematic sequence has actually finished.
// ---------------------------------------------------------------------
async function runEntrySequence() {
  if (entryStarted) return;
  entryStarted = true;

  enterButton.disabled = true;
  sliderHandle.disabled = true;

  // Stop the tilt effect and clear its inline transform so the
  // dissolve transition's own CSS transform takes over cleanly.
  tiltEnabled = false;
  entranceCard.style.transform = '';

  // Phase 1 — UI dissolve
  entranceCard.classList.add('is-dissolving');
  await wait(850);

  // Phase 2 — cinematic blackout
  blackoutOverlay.classList.add('is-visible');
  await wait(500);
  blackoutOverlay.classList.remove('is-visible');

  // Phase 3 — gate ignition + welcome text
  welcomeText.style.transition = 'opacity 0.9s ease, transform 0.9s ease';
  welcomeText.style.opacity = '1';
  welcomeText.style.transform = 'translateY(0)';
  await portalScene.igniteGate(1400);

  // Camera fly-through toward map.html
  await portalScene.flyThrough(2600);

  window.location.href = 'map.html';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------
enterButton.addEventListener('click', runEntrySequence);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !enterButton.disabled && !entryStarted) {
    runEntrySequence();
  }
});

// ---------------------------------------------------------------------
// SLIDE TO ENTER
// Dragging the handle previews the camera push in real time via
// portalScene.setEntryPreview(). Releasing past the completion
// threshold hands off directly into the entry sequence — the camera
// continues smoothly from wherever the drag left it, since flyThrough()
// always starts from the camera's current position. Releasing short of
// the threshold springs the handle back and restores breathing.
// ---------------------------------------------------------------------
const COMPLETE_THRESHOLD = 0.82;
let entryStarted = false;
let dragStartX = 0;
let dragStartLeft = 0;
let isDragging = false;

function trackWidth() {
  return sliderTrack.clientWidth - sliderHandle.clientWidth - 6; // 6 = track inset (3px each side)
}

function setHandlePosition(leftPx, { animated = false } = {}) {
  sliderHandle.style.transition = animated
    ? 'left 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease'
    : 'none';
  sliderHandle.style.left = `${leftPx}px`;
  const progress = trackWidth() > 0 ? leftPx / trackWidth() : 0;
  sliderFill.style.width = `${leftPx + sliderHandle.clientWidth}px`;
  sliderLabel.style.opacity = String(Math.max(0, 1 - progress * 2));
  return progress;
}

sliderHandle.addEventListener('pointerdown', (event) => {
  if (sliderHandle.disabled || entryStarted) return;
  isDragging = true;
  sliderHandle.classList.add('is-dragging');
  sliderHandle.setPointerCapture(event.pointerId);
  dragStartX = event.clientX;
  dragStartLeft = parseFloat(sliderHandle.style.left || '3');
});

sliderHandle.addEventListener('pointermove', (event) => {
  if (!isDragging) return;
  const deltaX = event.clientX - dragStartX;
  const maxLeft = trackWidth();
  const newLeft = Math.min(Math.max(dragStartLeft + deltaX, 3), maxLeft + 3);
  const progress = setHandlePosition(newLeft - 3);
  if (portalScene) portalScene.setEntryPreview(progress);
});

sliderHandle.addEventListener('pointerup', (event) => {
  if (!isDragging) return;
  isDragging = false;
  sliderHandle.classList.remove('is-dragging');
  sliderHandle.releasePointerCapture(event.pointerId);

  const currentLeft = parseFloat(sliderHandle.style.left || '3') - 3;
  const progress = trackWidth() > 0 ? currentLeft / trackWidth() : 0;

  if (progress >= COMPLETE_THRESHOLD) {
    setHandlePosition(trackWidth(), { animated: true });
    sliderTrack.classList.add('is-complete');
    runEntrySequence();
  } else {
    setHandlePosition(0, { animated: true });
    if (portalScene) portalScene.setEntryPreview(0);
  }
});

initializePortal().catch(showError);
