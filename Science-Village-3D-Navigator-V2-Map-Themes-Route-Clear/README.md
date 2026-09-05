# Science Village 3D Navigator — V2

Interactive web-based 3D navigation system for the Science Village, Nnamdi Azikiwe University, Awka.

## Included
- Science Village GLB model
- Local Three.js runtime and addons
- 28 building/facility records
- 9 supplied real-world building photographs
- Building labels and Clean View
- Search and building directory
- Building information panel
- Origin/destination route planner
- Predefined waypoint navigation network with shortest-path calculation
- 3D route visualization and turn guidance
- Responsive desktop/mobile controls

## Run locally
Because WebGL model loading is subject to browser security restrictions, serve the folder with a local web server rather than opening `index.html` directly.

### Python
```bash
python -m http.server 8000
```
Then open `http://localhost:8000/`.

### PHP
```bash
php -S localhost:8000
```

## Project structure
- `index.html` — application shell and import map
- `js/app.js` — Three.js scene, interaction, labels and navigation logic
- `data/buildings.js` — building records and navigation graph
- `assets/models/ScienceVillage.glb` — 3D campus model
- `assets/buildings/` — supplied Blender/reference and real-world image pairs
- `vendor/three/` — local Three.js runtime, OrbitControls and GLTFLoader

## Navigation note
The route engine uses a predefined pedestrian waypoint graph. It is not GPS or live location tracking.
