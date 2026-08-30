import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildingData, nodeNameToBuildingId, categoryColors } from './data.js?v=6';

// ---------------------------------------------------------------------
// DOM REFERENCES
// ---------------------------------------------------------------------
const canvas = document.getElementById('map-canvas');
const loadingOverlay = document.getElementById('map-loading');
const loadingFill = document.getElementById('map-progress-fill');
const errorPanel = document.getElementById('error-panel');
const errorMessage = document.getElementById('error-message');

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

const infoPanel = document.getElementById('info-panel');
const infoName = document.getElementById('info-name');
const infoCategory = document.getElementById('info-category');
const infoDescription = document.getElementById('info-description');
const infoMetaCategory = document.getElementById('info-meta-category');
const infoClose = document.getElementById('info-close');
const viewLocationButton = document.getElementById('view-location');

const legendEl = document.getElementById('legend');
const zoomInButton = document.getElementById('zoom-in');
const zoomOutButton = document.getElementById('zoom-out');
const resetViewButton = document.getElementById('reset-view');
const hudCameraMode = document.getElementById('hud-camera-mode');

// ---------------------------------------------------------------------
// RENDERER, CAMERA, SCENE
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#E8E4D9'); 

// FIX: Increased the near clipping plane from 0.1 to 5 to eliminate mobile Z-fighting
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 5, 10000);

// ---------------------------------------------------------------------
// DAYLIGHT LIGHTING
// ---------------------------------------------------------------------
const hemiLight = new THREE.HemisphereLight(0xdfeeff, 0x3a3a2f, 0.9);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff3e0, 1.1);
sunLight.position.set(60, 120, 40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
scene.add(sunLight);

const fillLight = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(fillLight);

// ---------------------------------------------------------------------
// ORBIT CONTROLS (HARDCORE ROTATION LOCK)
// ---------------------------------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05; 
controls.maxPolarAngle = Math.PI / 2 - 0.02;

controls.enablePan = false; 
controls.rotateSpeed = 0.55; 

renderer.domElement.style.touchAction = 'none';

let defaultCameraPosition = new THREE.Vector3();
let defaultTarget = new THREE.Vector3();

// ---------------------------------------------------------------------
// INTERACTIVE BUILDINGS
// ---------------------------------------------------------------------
const interactiveMeshes = [];
let hoveredMesh = null;
let selectedMesh = null;

const GHOST_COLOR = new THREE.Color(0x5b6b80);
const HOVER_EMISSIVE = 0.45;
const SELECTED_EMISSIVE = 0.8;

function setGhostState(mesh) {
  if (!mesh.userData.buildingId) return; 
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((mat) => {
    if (!mat) return;
    mat.color.copy(GHOST_COLOR);
    if ('emissive' in mat) {
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    }
  });
}

function setFacultyGlow(mesh, intensity) {
  if (!mesh.userData.buildingId) return; 
  const facultyColor = mesh.userData.facultyColor;
  if (!facultyColor) return;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((mat) => {
    if (!mat) return;
    mat.color.copy(facultyColor);
    if ('emissive' in mat) {
      mat.emissive.copy(facultyColor);
      mat.emissiveIntensity = intensity;
    }
  });
}

// ---------------------------------------------------------------------
// GLTF LOADING
// ---------------------------------------------------------------------
const gltfLoader = new GLTFLoader();
let modelRoot = null;

gltfLoader.load(
  './assets/models/map.glb',
  (gltf) => {
    modelRoot = gltf.scene;
    scene.add(modelRoot);

    tagInteractiveMeshes(modelRoot);
    fitCameraToModel(modelRoot);
    buildLegend();

    controls.target.copy(defaultTarget);
    controls.update();

    loadingOverlay.classList.add('is-hidden');
    document.body.classList.add('is-ready');
  },
  (progressEvent) => {
    if (progressEvent.lengthComputable) {
      const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      loadingFill.style.width = `${percent}%`;
    }
  },
  (error) => {
    console.error('Failed to load map.glb:', error);
    errorMessage.textContent = 'The campus model could not be loaded.';
    errorPanel.hidden = false;
    loadingOverlay.classList.add('is-hidden');
  }
);

function sanitizeGeometryOutliers(mesh) {
  const position = mesh.geometry.attributes.position;
  if (!position) return;
  const count = position.count;
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < count; i++) {
    xs.push(position.getX(i));
    ys.push(position.getY(i));
    zs.push(position.getZ(i));
  }
  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const medianX = median(xs), medianY = median(ys), medianZ = median(zs);
  const THRESHOLD = 1000;
  let snappedCount = 0;

  for (let i = 0; i < count; i++) {
    const dx = position.getX(i) - medianX;
    const dy = position.getY(i) - medianY;
    const dz = position.getZ(i) - medianZ;
    if (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD || Math.abs(dz) > THRESHOLD) {
      position.setXYZ(i, medianX, medianY, medianZ);
      snappedCount += 1;
    }
  }
  if (snappedCount > 0) {
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
}

function getMappedBuildingId(mesh) {
  let current = mesh;
  while (current) {
    if (nodeNameToBuildingId[current.name]) {
      return nodeNameToBuildingId[current.name];
    }
    current = current.parent;
  }
  return null;
}

function tagInteractiveMeshes(root) {
  root.traverse((object) => {
    if (object.isMesh) {
      sanitizeGeometryOutliers(object);

      object.material = Array.isArray(object.material)
        ? object.material.map((mat) => mat.clone())
        : object.material.clone();

      object.castShadow = true;
      object.receiveShadow = true;

      const buildingId = getMappedBuildingId(object);

      if (buildingId) {
        const building = buildingData[buildingId];
        object.userData.buildingId = buildingId;
        object.userData.facultyColor = new THREE.Color(categoryColors[building?.category] || '#5DCAA5');
        setGhostState(object);
        interactiveMeshes.push(object); 
      }
    }
  });
}

function fitCameraToModel(root) {
  const meshBoxes = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const meshBox = new THREE.Box3().setFromObject(object);
    const meshSize = meshBox.getSize(new THREE.Vector3());
    meshBoxes.push({ object, box: meshBox, maxDim: Math.max(meshSize.x, meshSize.y, meshSize.z) });
  });

  const sortedDims = meshBoxes.map((m) => m.maxDim).sort((a, b) => a - b);
  const medianDim = sortedDims[Math.floor(sortedDims.length / 2)] || 1;

  const OUTLIER_FACTOR = 50;
  const fitBox = new THREE.Box3();
  let outlierCount = 0;

  meshBoxes.forEach(({ object, box: meshBox, maxDim }) => {
    if (maxDim > medianDim * OUTLIER_FACTOR) {
      outlierCount += 1;
      return;
    }
    fitBox.union(meshBox);
  });

  const box = outlierCount > 0 ? fitBox : new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  root.position.sub(center);

  const maxDimension = Math.max(size.x, size.y, size.z);
  const distance = maxDimension * 0.9;

  defaultCameraPosition = new THREE.Vector3(distance * 0.5, distance * 0.7, distance * 0.5);
  defaultTarget = new THREE.Vector3(0, size.y * 0.1, 0);

  camera.position.copy(defaultCameraPosition);
  
  // FIX: Locked near plane to 5 to prevent mobile Z-fighting
  camera.near = 5;
  camera.far = maxDimension * 10;
  camera.updateProjectionMatrix();

  controls.minDistance = maxDimension * 0.08;
  controls.maxDistance = maxDimension * 1.6;

  sunLight.shadow.camera.left = -maxDimension * 0.9;
  sunLight.shadow.camera.right = maxDimension * 0.9;
  sunLight.shadow.camera.top = maxDimension * 0.9;
  sunLight.shadow.camera.bottom = -maxDimension * 0.9;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = maxDimension * 6;
  sunLight.shadow.camera.updateProjectionMatrix();

  const groundGeometry = new THREE.PlaneGeometry(maxDimension * 2.2, maxDimension * 2.2);
  const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.35 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = (box.min.y - center.y) + 60; 
  ground.receiveShadow = true;
  scene.add(ground);
}

function buildLegend() {
  const categoriesInUse = new Set(Object.values(buildingData).map((b) => b.category));
  legendEl.innerHTML = '';
  Object.entries(categoryColors)
    .filter(([category]) => categoriesInUse.has(category))
    .forEach(([category, color]) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${category}`;
      legendEl.appendChild(item);
    });
}

const tooltip = document.getElementById('hover-tooltip');

function updateTooltip(mesh, event) {
  if (!mesh || !mesh.userData.buildingId) {
    tooltip.classList.remove('is-visible');
    return;
  }
  const building = buildingData[mesh.userData.buildingId];
  tooltip.textContent = building ? building.name : "Unknown Building";
  tooltip.classList.add('is-visible');
  updateTooltipPosition(event);
}

function updateTooltipPosition(event) {
  if (!tooltip.classList.contains('is-visible')) return;
  
  // Use first touch coordinates if on mobile, otherwise mouse coordinates
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;

  tooltip.style.left = `${clientX + 16}px`;
  tooltip.style.top = `${clientY + 16}px`;
}

renderer.domElement.addEventListener('pointerleave', () => {
  tooltip.classList.remove('is-visible');
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactiveMeshes, false);
  const hitMesh = hits.length > 0 ? hits[0].object : null;

  if (hitMesh === hoveredMesh) {
    updateTooltipPosition(event);
    return;
  }

  if (hoveredMesh && hoveredMesh !== selectedMesh) {
    setGhostState(hoveredMesh);
  }

  hoveredMesh = hitMesh;
  renderer.domElement.style.cursor = hitMesh ? 'pointer' : 'default';

  if (hoveredMesh && hoveredMesh !== selectedMesh) {
    setFacultyGlow(hoveredMesh, HOVER_EMISSIVE);
  }

  updateTooltip(hitMesh, event);
});

// FIX: Recalculate pointer exactly on click so mobile taps register immediately
renderer.domElement.addEventListener('click', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactiveMeshes, false);
  const hitMesh = hits.length > 0 ? hits[0].object : null;

  if (hitMesh && hitMesh.userData.buildingId) {
    selectBuilding(hitMesh.userData.buildingId, hitMesh);
  }
});

let cameraFocusTarget = null;
const activePulses = [];

function spawnSelectionPulse(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const baseRadius = Math.max(size.x, size.z) * 0.5;

  const ringGeometry = new THREE.RingGeometry(baseRadius * 0.9, baseRadius * 1.05, 48);
  const facultyColor = mesh.userData.facultyColor || new THREE.Color(0xC9A24C);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: facultyColor,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(center.x, box.min.y + 0.02, center.z);
  scene.add(ring);

  activePulses.push({
    ring,
    baseRadius,
    startTime: performance.now(),
    duration: 900,
  });
}

function updatePulses(now) {
  for (let i = activePulses.length - 1; i >= 0; i--) {
    const pulse = activePulses[i];
    const t = Math.min((now - pulse.startTime) / pulse.duration, 1);

    const scale = 1 + t * 2.2;
    pulse.ring.scale.set(scale, scale, scale);
    pulse.ring.material.opacity = 0.8 * (1 - t);

    if (t >= 1) {
      scene.remove(pulse.ring);
      pulse.ring.geometry.dispose();
      pulse.ring.material.dispose();
      activePulses.splice(i, 1);
    }
  }
}

function selectBuilding(buildingId, mesh) {
  if (selectedMesh && selectedMesh !== mesh) {
    setGhostState(selectedMesh);
  }
  selectedMesh = mesh;
  setFacultyGlow(selectedMesh, SELECTED_EMISSIVE);
  spawnSelectionPulse(mesh);
  openInfoPanel(buildingId, mesh.userData.facultyColor);
  focusCameraOnMesh(mesh);
}

function focusCameraOnMesh(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);

  const offsetDirection = new THREE.Vector3(0.6, 0.5, 0.6).normalize();
  const targetPosition = center.clone().add(offsetDirection.multiplyScalar(radius * 2.2));

  cameraFocusTarget = { position: targetPosition, lookAt: center };
  hudCameraMode.textContent = 'Focusing';
}

function openInfoPanel(buildingId, facultyColor) {
  const building = buildingData[buildingId];
  if (!building) return;

  infoCategory.textContent = building.category;
  infoName.textContent = building.name;
  infoDescription.textContent = building.description;
  infoMetaCategory.textContent = building.category;

  if (facultyColor) {
    infoPanel.style.setProperty('--accent', `#${facultyColor.getHexString()}`);
  }

  infoPanel.hidden = false;
  void infoPanel.offsetWidth;
  infoPanel.classList.add('is-open');
}

function closeInfoPanel() {
  infoPanel.classList.remove('is-open');
  if (selectedMesh) {
    setGhostState(selectedMesh);
    selectedMesh = null;
  }
  setTimeout(() => {
    infoPanel.hidden = true;
  }, 400);
}

infoClose.addEventListener('click', closeInfoPanel);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !infoPanel.hidden) {
    closeInfoPanel();
  }
});

viewLocationButton.addEventListener('click', () => {
  if (selectedMesh) focusCameraOnMesh(selectedMesh);
});

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    searchResults.hidden = true;
    searchResults.innerHTML = '';
    return;
  }
  const matches = Object.entries(buildingData).filter(([, building]) =>
    building.name.toLowerCase().includes(query)
  );
  renderSearchResults(matches);
});

function renderSearchResults(matches) {
  searchResults.innerHTML = '';
  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = 'No buildings match your search.';
    searchResults.appendChild(empty);
    searchResults.hidden = false;
    return;
  }
  matches.forEach(([buildingId, building]) => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <span class="search-result-name">${building.name}</span>
      <span class="search-result-category">${building.category}</span>
    `;
    item.addEventListener('click', () => {
      const mesh = interactiveMeshes.find((m) => m.userData.buildingId === buildingId);
      if (mesh) selectBuilding(buildingId, mesh);
      searchResults.hidden = true;
      searchInput.value = building.name;
    });
    searchResults.appendChild(item);
  });
  searchResults.hidden = false;
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) {
    searchResults.hidden = true;
  }
});

// ---------------------------------------------------------------------
// MAP CONTROLS — CINEMATIC ZOOM
// ---------------------------------------------------------------------
zoomInButton.addEventListener('click', () => {
  const distance = camera.position.distanceTo(controls.target);
  const direction = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
  const targetPos = camera.position.clone().addScaledVector(direction, distance * 0.25);
  
  cameraFocusTarget = { position: targetPos, lookAt: controls.target.clone() };
  hudCameraMode.textContent = 'Zooming In';
});

zoomOutButton.addEventListener('click', () => {
  const distance = camera.position.distanceTo(controls.target);
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  const targetPos = camera.position.clone().addScaledVector(direction, distance * 0.25);
  
  cameraFocusTarget = { position: targetPos, lookAt: controls.target.clone() };
  hudCameraMode.textContent = 'Zooming Out';
});

resetViewButton.addEventListener('click', () => {
  cameraFocusTarget = { position: defaultCameraPosition.clone(), lookAt: defaultTarget.clone() };
  hudCameraMode.textContent = 'Resetting View';
  if (selectedMesh) {
    setGhostState(selectedMesh);
    selectedMesh = null;
  }
  closeInfoPanel();
});

// ---------------------------------------------------------------------
// RESIZE
// ---------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------
// ANIMATION LOOP
// ---------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  if (cameraFocusTarget) {
    camera.position.lerp(cameraFocusTarget.position, 0.06);
    controls.target.lerp(cameraFocusTarget.lookAt, 0.06);
    if (camera.position.distanceTo(cameraFocusTarget.position) < 0.05) {
      cameraFocusTarget = null;
      hudCameraMode.textContent = 'Orbit mode';
    }
  }
  if (activePulses.length > 0) {
    updatePulses(performance.now());
  }
  controls.update();
  renderer.render(scene, camera);
}

animate();