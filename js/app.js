import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const buildings = window.SV_BUILDINGS || [];
const waypoints = window.SV_WAYPOINTS || {};
const edges = window.SV_EDGES || [];
const MODEL_ORIGIN = { x: 291500, z: -691450 };
const MAP_THEMES = {
  light: {
    scene: 0xe8edf0, fog: 0xe8edf0, plane: 0x151b1f, building: 0xb8c2c5,
    labelBg: 'rgba(255,255,255,.96)'
  },
  dark: {
    scene: 0x070d11, fog: 0x070d11, plane: 0x080d11, building: 0x7f8e93,
    labelBg: 'rgba(13,22,27,.94)'
  }
};

const state = {
  scene:null,camera:null,renderer:null,controls:null,model:null,
  labels:[],buildingNodes:new Map(),nodeToBuilding:new Map(),
  selected:null,hovered:null,route:null,clean:false,theme:localStorage.getItem('sv-map-theme')==='dark'?'dark':'light',raycaster:new THREE.Raycaster(),pointer:new THREE.Vector2(),toastTimer:null,lastLabelCamera:new THREE.Vector3(Infinity,Infinity,Infinity),lastLabelTarget:new THREE.Vector3(Infinity,Infinity,Infinity),frame:0
};

function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
function localPos(b){return new THREE.Vector3(b.position?.[0] ?? (b.x-MODEL_ORIGIN.x),0,b.position?.[1] ?? (b.z-MODEL_ORIGIN.z))}
function modelPosFromWaypoint(id){const p=waypoints[id];return new THREE.Vector3((p.x??MODEL_ORIGIN.x)-MODEL_ORIGIN.x,5,(p.z??MODEL_ORIGIN.z)-MODEL_ORIGIN.z)}

function init(){
  state.scene=new THREE.Scene();
  const theme=MAP_THEMES[state.theme];
  state.scene.background=new THREE.Color(theme.scene);
  state.scene.fog=new THREE.Fog(theme.fog,400,900);
  state.camera=new THREE.PerspectiveCamera(45,innerWidth/(innerHeight-64),.1,100000);
  const mobileMode=matchMedia('(max-width:760px)').matches || ('ontouchstart' in window);
  state.renderer=new THREE.WebGLRenderer({antialias:!mobileMode,powerPreference:'high-performance',alpha:false});
  state.renderer.setPixelRatio(Math.min(devicePixelRatio,mobileMode?1.25:1.5));
  state.renderer.setSize(innerWidth,innerHeight-64);
  state.renderer.outputColorSpace=THREE.SRGBColorSpace;
  state.renderer.domElement.setAttribute('aria-label','Interactive Science Village 3D map');
  $('map').appendChild(state.renderer.domElement);

  state.scene.add(new THREE.HemisphereLight(0xffffff,0x66737d,2.2));
  const sun=new THREE.DirectionalLight(0xffffff,2.7);sun.position.set(300,800,250);state.scene.add(sun);
  const fill=new THREE.DirectionalLight(0xffffff,0.8);fill.position.set(-500,250,-300);state.scene.add(fill);

  state.controls=new OrbitControls(state.camera,state.renderer.domElement);
  state.controls.enableDamping=true; state.controls.dampingFactor=.07; state.controls.screenSpacePanning=true; state.controls.maxPolarAngle=Math.PI*.49;

  const loader=new GLTFLoader();
  loader.load('assets/models/ScienceVillage.glb',g=>{
    state.model=g.scene; state.scene.add(state.model);
    sanitizeAndRecenter(state.model); indexBuildingNodes(); applyUniformBuildingColor(); recolorGround(); applyMapTheme(); fitModel(); makeLabels(); buildDirectory(); fillSelects();
    $('statusText').textContent='3D map ready • Select a building to begin';
    toast('3D map ready');
    $('enterBtn').disabled=false; $('enterBtn').textContent='Explore the Map';
    $('homeStatBuildings').textContent=buildings.length;
  },xhr=>{if(xhr.total){const pct=Math.round(xhr.loaded/xhr.total*100);$('statusText').textContent=`Loading 3D environment… ${pct}%`;if($('enterBtn').disabled)$('enterBtn').textContent=`Loading… ${pct}%`}},err=>{console.error(err);$('statusText').textContent='3D model could not be loaded';toast('Could not load the 3D model')});
  bind(); animate();
}

function sanitizeAndRecenter(root){
  root.traverse(o=>{
    if(!o.isMesh||!o.geometry?.attributes?.position)return;
    const p=o.geometry.attributes.position, a=p.array;
    const valid=[];
    for(let i=0;i<a.length;i+=3){
      const x=a[i],y=a[i+1],z=a[i+2];
      if(Math.abs(x-MODEL_ORIGIN.x)<3000 && Math.abs(z-MODEL_ORIGIN.z)<3000) valid.push([x,y,z]);
    }
    let replacement=[MODEL_ORIGIN.x,0,MODEL_ORIGIN.z];
    if(valid.length){let sx=0,sy=0,sz=0;for(const v of valid){sx+=v[0];sy+=v[1];sz+=v[2]}replacement=[sx/valid.length,sy/valid.length,sz/valid.length]}
    for(let i=0;i<a.length;i+=3){if(Math.abs(a[i]-MODEL_ORIGIN.x)>=3000 || Math.abs(a[i+2]-MODEL_ORIGIN.z)>=3000){a[i]=replacement[0];a[i+1]=replacement[1];a[i+2]=replacement[2]}}
    p.needsUpdate=true;
    o.geometry.computeBoundingBox();
    o.geometry.computeBoundingSphere();
    if(o.material?.map)o.material.map.colorSpace=THREE.SRGBColorSpace;
  });
  root.position.x=-MODEL_ORIGIN.x; root.position.z=-MODEL_ORIGIN.z;
}

function normalizeName(s){return String(s).toLowerCase().replace(/[^a-z0-9]/g,'')}
function indexBuildingNodes(){
  state.buildingNodes.clear(); state.nodeToBuilding.clear();
  const all=[];
  state.model.traverse(o=>all.push(o));
  const byName=new Map(all.filter(o=>o.name).map(o=>[normalizeName(o.name),o]));
  for(const b of buildings){
    const names=[b.curveName,...(b.meshNames||[])].filter(Boolean);
    let root=null;
    for(const name of names){root=byName.get(normalizeName(name)); if(root)break}
    if(!root) continue;
    state.buildingNodes.set(b.id,root);
    // Register the curve/object and every descendant mesh so a ray hit can
    // resolve back to the same building even when Blender's mesh name is hit.
    root.traverse(o=>{
      if(o.name) state.nodeToBuilding.set(o,b);
      if(o.isMesh && o.geometry) state.nodeToBuilding.set(o,b);
    });
  }
}
function fitModel(){
  if(!state.model)return;
  const box=new THREE.Box3().setFromObject(state.model);const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());
  state.controls.target.copy(c);const m=Math.max(s.x,s.y,s.z);state.camera.position.set(c.x+m*.72,c.y+m*.7,c.z+m*.72);state.camera.far=Math.max(m*8,5000);state.camera.updateProjectionMatrix();state.controls.update();
  state.scene.fog=new THREE.Fog(MAP_THEMES[state.theme].fog,m*0.85,m*1.9);
}
function applyUniformBuildingColor(){
  const color=new THREE.Color(MAP_THEMES[state.theme].building);
  for(const root of state.buildingNodes.values()){
    root.traverse(o=>{
      if(!o.isMesh||!o.material)return;
      const recolor=m=>{const c=m.clone();c.color.copy(color);if('metalness'in c)c.metalness=Math.min(c.metalness??0,.1);if('roughness'in c)c.roughness=Math.max(c.roughness??.5,.75);return c};
      o.material=Array.isArray(o.material)?o.material.map(recolor):recolor(o.material);
    });
  }
}
function recolorGround(){
  const planeColor=new THREE.Color(MAP_THEMES[state.theme].plane);
  state.model.traverse(o=>{
    if(!o.isMesh||o.name!=='Plane'||!o.material)return;
    const recolor=m=>{
      const c=m.clone();
      c.color.copy(planeColor);
      if('roughness' in c)c.roughness=1;
      if('metalness' in c)c.metalness=0;
      // The original floor is intended as a clean dark base, so don't let a
      // green source texture overpower the grass patches.
      if(c.map)c.map=null;
      return c;
    };
    o.material=Array.isArray(o.material)?o.material.map(recolor):recolor(o.material);
  });

  // Remove the stray oversized cyan geometry from the source model.
  state.model.traverse(o=>{
    if(o.name==='NurbsPath.015' || o.name==='NurbsPath.019') o.visible=false;
  });
}

function applyMapTheme(){
  const t=MAP_THEMES[state.theme];
  if(state.scene){
    state.scene.background.setHex(t.scene);
    state.scene.fog.color.setHex(t.fog);
  }
  applyUniformBuildingColor();
  recolorGround();
  document.body.classList.toggle('map-dark',state.theme==='dark');
  const btn=$('themeBtn');
  if(btn){btn.textContent=state.theme==='dark'?'☀ Light':'☾ Dark';btn.setAttribute('aria-label',state.theme==='dark'?'Switch to light map mode':'Switch to dark map mode');}
  for(const x of state.labels){x.el.style.background=t.labelBg;}
}

function toggleMapTheme(){
  state.theme=state.theme==='dark'?'light':'dark';
  localStorage.setItem('sv-map-theme',state.theme);
  applyMapTheme();
  toast(state.theme==='dark'?'Dark map mode enabled':'Light map mode enabled');
}

function focus(b){const v=localPos(b);state.controls.target.set(v.x,0,v.z);state.camera.position.set(v.x+95,90,v.z+95);state.controls.update()}
function makeLabels(){for(const x of state.labels)x.el.remove();state.labels=[];for(const b of buildings){const el=document.createElement('div');el.className='label';el.textContent=b.name;el.style.visibility='hidden';document.body.appendChild(el);state.labels.push({b,el})}}
function updateLabels(){
  if(!state.model)return;
  if(state.clean){for(const x of state.labels)x.el.style.visibility='hidden';return}
  if(state.camera.position.distanceToSquared(state.lastLabelCamera)<0.04 &&
     state.controls.target.distanceToSquared(state.lastLabelTarget)<0.04) return;
  state.lastLabelCamera.copy(state.camera.position);
  state.lastLabelTarget.copy(state.controls.target);
  const items=[];
  for(const x of state.labels){
    const v=localPos(x.b);v.y=22;
    const dist=v.distanceTo(state.camera.position);
    v.project(state.camera);
    const visible=v.z<1&&v.z>-1;
    const sx=(v.x*.5+.5)*innerWidth, sy=(-v.y*.5+.5)*(innerHeight-64)+64;
    items.push({x,sx,sy,visible,dist});
  }
  items.sort((a,b)=>a.dist-b.dist);
  const placed=[];
  for(const it of items){
    if(!it.visible){it.x.el.style.visibility='hidden';continue}
    it.x.el.style.left=it.sx+'px'; it.x.el.style.top=it.sy+'px';
    it.x.el.style.visibility='visible';
    const r=it.x.el.getBoundingClientRect();
    const pad=4;
    const rect={left:r.left-pad,right:r.right+pad,top:r.top-pad,bottom:r.bottom+pad};
    let overlap=false;
    for(const p of placed){if(rect.left<p.right&&rect.right>p.left&&rect.top<p.bottom&&rect.bottom>p.top){overlap=true;break}}
    if(overlap)it.x.el.style.visibility='hidden'; else placed.push(rect);
  }
}

function highlight(node,selected=false){if(!node)return;node.traverse(o=>{if(o.isMesh&&o.material?.emissive){if(o.userData._oldE===undefined)o.userData._oldE=o.material.emissive.getHex();if(o.userData._oldEI===undefined)o.userData._oldEI=o.material.emissiveIntensity||0;o.material.emissive.setHex(selected?0x166b8f:0x58a7c2);o.material.emissiveIntensity=selected?.55:.3}})}
function clearHighlight(){for(const node of [state.hovered,state.selected&&state.buildingNodes.get(state.selected.id)])if(node)node.traverse(o=>{if(o.isMesh&&o.material?.emissive&&o.userData._oldE!==undefined){o.material.emissive.setHex(o.userData._oldE);o.material.emissiveIntensity=o.userData._oldEI||0}});state.hovered=null}
function findBuilding(obj){while(obj){const b=state.nodeToBuilding.get(obj);if(b)return b;obj=obj.parent}return null}
function selectBuilding(b){
  if(!b)return; clearHighlight(); state.selected=b; const node=state.buildingNodes.get(b.id);if(node)highlight(node,true);
  $('info').classList.remove('hidden');$('infoCat').textContent=b.category;$('infoName').textContent=b.name;$('infoDesc').textContent=b.description;
  $('infoLoc').textContent='Science Village • Interactive 3D location';
  const p=$('photo');p.innerHTML=b.photo?`<img src="${b.photo}" alt="Real-world view of ${b.name}" loading="lazy"><small class="photo-caption">Real-world building photograph</small>`:'<span>No real-world photograph supplied for this building</span>';
  focus(b); closePanelsExcept('info');
}

function graph(){const g={};Object.keys(waypoints).forEach(k=>g[k]=[]);for(const [a,b] of edges){if(!waypoints[a]||!waypoints[b])continue;const A=waypoints[a],B=waypoints[b],w=Math.hypot(A.x-B.x,A.z-B.z);g[a].push([b,w]);g[b].push([a,w])}return g}
function shortest(start,end){const g=graph(),d={},prev={},q=new Set(Object.keys(g));for(const k of q)d[k]=Infinity;d[start]=0;while(q.size){let u=null;for(const k of q)if(u===null||d[k]<d[u])u=k;q.delete(u);if(u===end)break;for(const [v,w] of g[u]){const nd=d[u]+w;if(nd<d[v]){d[v]=nd;prev[v]=u}}}if(!isFinite(d[end]))return[];const path=[];let u=end;while(u!==undefined){path.unshift(u);u=prev[u]}return path}
function directionText(a,b,c){if(!a||!b||!c)return'Continue along the route.';const v1=new THREE.Vector2(b.x-a.x,b.z-a.z).normalize(),v2=new THREE.Vector2(c.x-b.x,c.z-b.z).normalize(),cross=v1.x*v2.y-v1.y*v2.x,dot=v1.dot(v2);if(dot>.92)return'Continue straight.';if(cross>.25)return'Turn left.';if(cross<-.25)return'Turn right.';return'Continue along the route.'}
function drawRoute(path,a,b){if(state.route){state.scene.remove(state.route);state.route.geometry.dispose();state.route.material.dispose()}const pts=[localPos(a),...path.map(modelPosFromWaypoint),localPos(b)];const geo=new THREE.BufferGeometry().setFromPoints(pts);state.route=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x176b8c,linewidth:3}));state.scene.add(state.route)}
function clearRoute(){if(state.route){state.scene.remove(state.route);state.route.geometry.dispose();state.route.material.dispose();state.route=null}$('routeText').innerHTML='<p class="muted">Route cleared. Choose an origin and destination to calculate a route.</p>';toast('Route cleared')}
function showRoute(){
 const a=buildings.find(x=>x.id===$('fromSelect').value),b=buildings.find(x=>x.id===$('toSelect').value);if(!a||!b||a.id===b.id){toast('Choose two different buildings');return}
 const path=shortest(a.navNode,b.navNode);if(!path.length){toast('No route is available');return}
 drawRoute(path,a,b);
 const pts=[localPos(a),...path.map(modelPosFromWaypoint),localPos(b)];
 let distance=0;for(let i=1;i<pts.length;i++)distance+=pts[i-1].distanceTo(pts[i]);
 let html=`<p><b>Route found</b><br>${a.name} → ${b.name}</p><p class="route-meta">Approx. ${Math.round(distance)} map units • ${path.length-1} network segment${path.length-1===1?'':'s'}</p><ol>`;
 for(let i=1;i<pts.length-1;i++)html+=`<li>${directionText(pts[i-1],pts[i],pts[i+1])}</li>`;
 html+=`<li>Arrive at <b>${b.name}</b>.</li></ol><p class="route-note">Guidance uses the predefined Science Village pedestrian network; it is not GPS tracking.</p>`;
 $('routeText').innerHTML=html;focus(b);toast('Route displayed')
}
function fillSelects(){for(const id of ['fromSelect','toSelect']){const s=$(id);s.innerHTML='';for(const b of buildings){const o=document.createElement('option');o.value=b.id;o.textContent=b.name;s.appendChild(o)}}if(buildings[1])$('toSelect').value=buildings[1].id}

function buildDirectory(){
 const cats=['All',...new Set(buildings.map(b=>b.category))];const f=$('categoryFilters');f.innerHTML='';for(const c of cats){const btn=document.createElement('button');btn.textContent=c;btn.dataset.cat=c;if(c==='All')btn.classList.add('active');btn.onclick=()=>{f.querySelectorAll('button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');renderDirectory(c)};f.appendChild(btn)}renderDirectory('All')
}
function renderDirectory(cat='All'){const list=$('buildingList');list.innerHTML='';const rows=buildings.filter(b=>cat==='All'||b.category===cat);for(const b of rows){const el=document.createElement('button');el.className='building-row';el.innerHTML=`<span class="building-icon">${b.photo?'▣':'◻'}</span><span><b>${b.name}</b><small>${b.category}${b.photo?' • photo available':''}</small></span><span>›</span>`;el.onclick=()=>selectBuilding(b);list.appendChild(el)}}
function openPanel(name){closePanelsExcept(name);if(name==='directions')$('directionsPanel').classList.remove('hidden');if(name==='directory')$('directory').classList.remove('hidden');if(name==='about')$('about').classList.remove('hidden')}
function closePanelsExcept(keep){for(const id of ['info','directionsPanel','directory','about'])if(id!==keep)$(id).classList.add('hidden')}
function bind(){
 $('themeBtn').onclick=toggleMapTheme;
 $('menuBtn').onclick=()=>$('side').classList.toggle('closed');$('cleanBtn').onclick=()=>{state.clean=!state.clean;$('cleanBtn').textContent=state.clean?'Show Labels':'Clean View'};$('resetBtn').onclick=fitModel;$('overview').onclick=fitModel;
 $('closeInfo').onclick=()=>{state.selected=null;clearHighlight();$('info').classList.add('hidden')};$('viewBtn').onclick=()=>state.selected&&focus(state.selected);$('dirBtn').onclick=()=>{openPanel('directions');if(state.selected)$('toSelect').value=state.selected.id};$('closeDirections').onclick=()=>$('directionsPanel').classList.add('hidden');$('routeBtn').onclick=showRoute;$('clearRouteBtn').onclick=clearRoute;
 $('closeDirectory').onclick=()=>$('directory').classList.add('hidden');$('closeAbout').onclick=()=>$('about').classList.add('hidden');
 $('zoomIn').onclick=()=>{state.camera.position.lerp(state.controls.target,.18)};$('zoomOut').onclick=()=>{state.camera.position.lerp(state.controls.target,-.22)};
 $('clearSearch').onclick=()=>{$('searchInput').value='';$('searchResults').innerHTML='';$('searchInput').focus()};
 $('searchInput').oninput=e=>{const q=e.target.value.toLowerCase().trim(),box=$('searchResults');box.innerHTML='';if(!q)return;buildings.filter(b=>`${b.name} ${b.category}`.toLowerCase().includes(q)).slice(0,8).forEach(b=>{const r=document.createElement('button');r.className='result';r.textContent=b.name;r.onclick=()=>{selectBuilding(b);box.innerHTML='';$('searchInput').value=b.name};box.appendChild(r)})};
 document.querySelectorAll('nav button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const p=btn.dataset.panel;if(p==='directions')openPanel('directions');else if(p==='buildings')openPanel('directory');else if(p==='about')openPanel('about');else if(p==='home'){closePanelsExcept('none');document.body.classList.add('home-active')}else{closePanelsExcept('none');document.body.classList.remove('home-active');if(p==='map')fitModel();$('side').classList.remove('closed')}});
 $('enterBtn').onclick=()=>{document.body.classList.remove('home-active');document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));$('side').querySelector('[data-panel="map"]').classList.add('active');fitModel()};
 $('homeDirectoryBtn').onclick=()=>{document.body.classList.remove('home-active');document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));$('side').querySelector('[data-panel="buildings"]').classList.add('active');openPanel('directory')};
 document.querySelectorAll('.mobile-nav button').forEach(btn=>btn.onclick=()=>{const p=btn.dataset.mobile;if(p==='directions')openPanel('directions');if(p==='buildings')openPanel('directory');if(p==='map'){closePanelsExcept('none');document.body.classList.remove('home-active');fitModel()}});
 state.renderer.domElement.addEventListener('pointermove',onPointerMove);state.renderer.domElement.addEventListener('click',onMapClick);
 addEventListener('resize',()=>{
  const mobileMode=matchMedia('(max-width:760px)').matches || ('ontouchstart' in window);
  const h=innerWidth<=760?58:64;
  state.camera.aspect=innerWidth/Math.max(240,innerHeight-h);
  state.camera.updateProjectionMatrix();
  state.renderer.setPixelRatio(Math.min(devicePixelRatio,mobileMode?1.25:1.5));
  state.renderer.setSize(innerWidth,Math.max(240,innerHeight-h));
  state.lastLabelCamera.set(Infinity,Infinity,Infinity);
});
}
function pointerFromEvent(e){const r=state.renderer.domElement.getBoundingClientRect();state.pointer.x=(e.clientX-r.left)/r.width*2-1;state.pointer.y=-(e.clientY-r.top)/r.height*2+1;state.raycaster.setFromCamera(state.pointer,state.camera)}
function onPointerMove(e){if(!state.model || e.pointerType==='touch')return;pointerFromEvent(e);const hit=state.raycaster.intersectObject(state.model,true)[0];const b=hit?findBuilding(hit.object):null;if(b&&b!==state.selected){if(state.hovered)clearHighlight();const n=state.buildingNodes.get(b.id);if(n){highlight(n);state.hovered=n}state.renderer.domElement.style.cursor='pointer'}else if(!b){if(state.hovered)clearHighlight();state.renderer.domElement.style.cursor='grab'}}
function onMapClick(e){if(!state.model)return;pointerFromEvent(e);const hit=state.raycaster.intersectObject(state.model,true)[0];const b=hit?findBuilding(hit.object):null;if(b)selectBuilding(b)}
function animate(){requestAnimationFrame(animate);state.controls?.update();updateLabels();state.renderer?.render(state.scene,state.camera)}

init();
