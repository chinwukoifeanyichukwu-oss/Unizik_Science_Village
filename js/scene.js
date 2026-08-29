import * as THREE from 'three';

// ---------------------------------------------------------------------
// EASING
// ---------------------------------------------------------------------
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ---------------------------------------------------------------------
// LIGHTWEIGHT TWEEN MANAGER
// One list of active tweens, advanced once per animation frame. Keeps
// the entry-sequence animations (ignition, fly-through) out of the
// render loop's own logic while still running inside the single
// requestAnimationFrame loop this page owns.
// ---------------------------------------------------------------------
class TweenRunner {
  constructor() {
    this.active = [];
  }

  add({ duration, onUpdate, onComplete, easing = easeInOutCubic }) {
    return new Promise((resolve) => {
      this.active.push({
        duration,
        onUpdate,
        easing,
        startTime: null,
        onComplete: () => {
          if (onComplete) onComplete();
          resolve();
        },
      });
    });
  }

  update(now) {
    this.active = this.active.filter((tween) => {
      if (tween.startTime === null) tween.startTime = now;
      const elapsed = now - tween.startTime;
      const t = Math.min(elapsed / tween.duration, 1);
      tween.onUpdate(tween.easing(t));
      if (t >= 1) {
        tween.onComplete();
        return false;
      }
      return true;
    });
  }
}

// ---------------------------------------------------------------------
// PORTAL SCENE
// ---------------------------------------------------------------------
export class PortalScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.tweens = new TweenRunner();
    this.breathingEnabled = true;
    this.clock = new THREE.Clock();

    this._buildRenderer();
    this._buildCamera();
    this.scene = new THREE.Scene();

    this._buildLighting();
    this._buildGate();
    this._buildFloorGrid();
    this._buildParticles();

    window.addEventListener('resize', () => this._handleResize());
  }

  // -- setup ------------------------------------------------------------

  _buildRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true, // lets the CSS radial-gradient behind the canvas show through
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
  }

  _buildCamera() {
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );
    this.cameraBase = new THREE.Vector3(0, 3.4, 14);
    this.flyThroughEnd = new THREE.Vector3(0, 3.2, -10);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(0, 3, 0);
  }

  _buildLighting() {
    // Restrained ambient + a single dim rim light. Intensities start low
    // so the gate reads as a dark architectural silhouette on load, per
    // the "waiting scene" requirement — ignition ramps these up later.
    this.ambientLight = new THREE.AmbientLight(0x1a2436, 0.6);
    this.scene.add(this.ambientLight);

    this.rimLight = new THREE.DirectionalLight(0x4a6a8a, 0.35);
    this.rimLight.position.set(-6, 8, -4);
    this.scene.add(this.rimLight);

    // Gate ignition lights — one per pillar, off at start (intensity 0).
    this.gateLightLeft = new THREE.PointLight(0xC9A24C, 0, 12, 2);
    this.gateLightLeft.position.set(-2.6, 4.5, 0.5);
    this.scene.add(this.gateLightLeft);

    this.gateLightRight = new THREE.PointLight(0xC9A24C, 0, 12, 2);
    this.gateLightRight.position.set(2.6, 4.5, 0.5);
    this.scene.add(this.gateLightRight);
  }

  _buildGate() {
    // Procedural gate: two pillars + a lintel, standing in for gate.glb
    // until a real model is supplied. Dark architectural materials,
    // zero emission on the structure itself — only the embedded light
    // strips emit, and only once ignited.
    this.gateGroup = new THREE.Group();

    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1420,
      roughness: 0.55,
      metalness: 0.35,
    });

    const pillarGeometry = new THREE.BoxGeometry(0.6, 6, 0.6);

    const leftPillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    leftPillar.position.set(-2.6, 3, 0);
    this.gateGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeometry, pillarMaterial.clone());
    rightPillar.position.set(2.6, 3, 0);
    this.gateGroup.add(rightPillar);

    const lintelGeometry = new THREE.BoxGeometry(6.2, 0.6, 0.6);
    const lintel = new THREE.Mesh(lintelGeometry, pillarMaterial.clone());
    lintel.position.set(0, 6.3, 0);
    this.gateGroup.add(lintel);

    // Thin emissive strips embedded in each pillar — these are the
    // "bulb-like" elements allowed a restrained emissive value once lit.
    const stripMaterial = new THREE.MeshStandardMaterial({
      color: 0xC9A24C,
      emissive: 0xC9A24C,
      emissiveIntensity: 0,
      roughness: 0.3,
      metalness: 0,
    });
    this.gateStripMaterials = [stripMaterial, stripMaterial.clone()];

    const stripGeometry = new THREE.BoxGeometry(0.06, 5.6, 0.06);

    const leftStrip = new THREE.Mesh(stripGeometry, this.gateStripMaterials[0]);
    leftStrip.position.set(-2.35, 3, 0.32);
    this.gateGroup.add(leftStrip);

    const rightStrip = new THREE.Mesh(stripGeometry, this.gateStripMaterials[1]);
    rightStrip.position.set(2.35, 3, 0.32);
    this.gateGroup.add(rightStrip);

    this.scene.add(this.gateGroup);
  }

  _buildFloorGrid() {
    // Subtle receding perspective grid. Dark base lines, restrained
    // cyan center lines — not a bright cyan floor.
    this.floorGrid = new THREE.GridHelper(60, 40, 0x4a3a1a, 0x14100a);
    this.floorGrid.position.y = 0;
    this.floorGrid.material.opacity = 0.35;
    this.floorGrid.material.transparent = true;
    this.scene.add(this.floorGrid);
  }

  _buildParticles() {
    // Fine atmospheric dust: one BufferGeometry, one Points object.
    // Avoids creating hundreds of individual mesh objects.
    const particleCount = 1500;
    const positions = new Float32Array(particleCount * 3);
    this._particlePhases = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 30; // x
      positions[i * 3 + 1] = Math.random() * 14;         // y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30; // z
      this._particlePhases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._particleBasePositions = positions.slice();

    const material = new THREE.PointsMaterial({
      color: 0xC9B98A,
      size: 0.026,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  // -- per-frame updates --------------------------------------------------

  _updateParticles(time) {
    const positions = this.particles.geometry.attributes.position.array;
    const base = this._particleBasePositions;

    for (let i = 0; i < this._particlePhases.length; i++) {
      const phase = this._particlePhases[i];
      // Slow vertical drift plus a very slight horizontal sway — kept
      // small so it reads as drifting dust, not moving stars.
      positions[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.15 + phase) * 0.4;
      positions[i * 3 + 0] = base[i * 3 + 0] + Math.sin(time * 0.08 + phase) * 0.15;
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  _updateCameraBreathing(time) {
    if (!this.breathingEnabled) return;
    this.camera.position.y = this.cameraBase.y + Math.sin(time * 0.35) * 0.06;
    this.camera.position.x = this.cameraBase.x + Math.sin(time * 0.22) * 0.05;
  }

  // -- public control surface ---------------------------------------------

  /** Starts the single render loop for this page. */
  start() {
    const tick = () => {
      requestAnimationFrame(tick);
      const time = this.clock.getElapsedTime();

      this._updateParticles(time);
      this._updateCameraBreathing(time);
      this.tweens.update(performance.now());

      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  /** Ramps the gate lights from off to fully lit. Resolves when done. */
  igniteGate(durationMs = 1400) {
    return this.tweens.add({
      duration: durationMs,
      onUpdate: (t) => {
        this.gateLightLeft.intensity = t * 6;
        this.gateLightRight.intensity = t * 6;
        this.gateStripMaterials.forEach((mat) => {
          mat.emissiveIntensity = t * 1.4;
        });
        this.ambientLight.intensity = 0.6 + t * 0.4;
        this.rimLight.intensity = 0.35 + t * 0.5;
      },
    });
  }

  /**
   * Nudges the camera partway along the eventual fly-through path,
   * proportional to `progress` (0–1) — the slider drag on the portal
   * card calls this live as the handle moves, so the scene visibly
   * responds to the drag rather than only reacting on release.
   * Passing 0 restores normal camera breathing.
   */
  setEntryPreview(progress) {
    if (progress <= 0) {
      this.breathingEnabled = true;
      return;
    }
    this.breathingEnabled = false;

    // Only travel a fraction of the full fly-through distance during
    // the drag preview — the rest is reserved for the actual fly-through
    // once the slider completes, so the transition doesn't feel used up.
    const previewFraction = 0.32;
    const target = this.cameraBase.clone().lerp(this.flyThroughEnd, progress * previewFraction);
    this.camera.position.copy(target);
    this.camera.lookAt(0, 3, this.flyThroughEnd.z);
  }

  /** Flies the camera forward through the gate opening. Resolves when done. */
  flyThrough(durationMs = 2600) {
    this.breathingEnabled = false;
    const start = this.camera.position.clone();
    const end = this.flyThroughEnd;

    return this.tweens.add({
      duration: durationMs,
      onUpdate: (t) => {
        this.camera.position.lerpVectors(start, end, t);
        this.camera.lookAt(0, 3, -20);
      },
    });
  }

  _handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
