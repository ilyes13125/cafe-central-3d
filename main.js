import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* =========================================================
   1. SCÈNE, CAMÉRA ET RENDU
   ========================================================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15100c); // fond chaud très sombre
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 5, 22);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// Détection simple du niveau de puissance de l'appareil, pour adapter
// automatiquement la résolution et les ombres — HIGH par défaut (la plupart
// des ordinateurs), MEDIUM/LOW seulement sur mobile avec peu de coeurs CPU.
const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 700;
const cpuCores = navigator.hardwareConcurrency || 4;
let performanceTier = 'high';
if (isMobileDevice && cpuCores <= 4) performanceTier = 'low';
else if (cpuCores <= 4) performanceTier = 'medium';

const fullPixelRatio = performanceTier === 'high'
  ? Math.min(window.devicePixelRatio, 2)
  : performanceTier === 'medium'
    ? Math.min(window.devicePixelRatio, 1.5)
    : Math.min(window.devicePixelRatio, 1.5); // relevé de 1 à 1.5 : meilleure fidélité visuelle sur mobile bas de gamme, coût encore raisonnable
const journeyPixelRatio = Math.min(fullPixelRatio, 1); // toujours réduit pendant le zoom, quel que soit le palier
const shadowMapSize = performanceTier === 'low' ? 256 : 512; // résolution des ombres réduite sur mobile faible, jamais leur présence
renderer.setPixelRatio(fullPixelRatio);

renderer.shadowMap.enabled = true; // toujours activées, sur tous les appareils — nécessaires pour un rendu de couleur cohérent
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

/* =========================================================
   ENVIRONNEMENT LUMINEUX — donne aux métaux et au verre quelque
   chose à refléter (sans quoi metalness/roughness ne se voient
   presque pas). Généré par du code Three.js, aucun fichier à
   télécharger.
   ========================================================= */
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
pmremGenerator.dispose();

/* =========================================================
   BOIS PROCÉDURAL — génère un grain subtil directement en code,
   sans fichier externe. La couleur de base reste EXACTEMENT
   celle que vous avez choisie ; seul un léger veinage est ajouté
   par-dessus.
   ========================================================= */
function createWoodTexture(baseColorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Valeurs RGB lues DIRECTEMENT depuis le hex (0-255), sans passer par
  // THREE.Color — c'est ce détour qui causait l'assombrissement.
  const r = (baseColorHex >> 16) & 255;
  const g = (baseColorHex >> 8) & 255;
  const b = baseColorHex & 255;

  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 220; i++) {
    const y = Math.random() * canvas.height;
    const shade = Math.round((Math.random() - 0.5) * 46); // légère variation de luminosité (±23), jamais de teinte
    const lr = Math.min(255, Math.max(0, r + shade));
    const lg = Math.min(255, Math.max(0, g + shade));
    const lb = Math.min(255, Math.max(0, b + shade));
    ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${0.25 + Math.random() * 0.35})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(canvas.width * 0.3, y + (Math.random() - 0.5) * 10, canvas.width * 0.7, y + (Math.random() - 0.5) * 10, canvas.width, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Texture de rugosité séparée (grise, pas colorée) — l'ancienne version réutilisait
// par erreur la texture DE COULEUR comme carte de rugosité, ce qui n'a pas de sens.
function createRoughnessTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgb(140,140,140)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 220; i++) {
    const y = Math.random() * canvas.height;
    const v = 110 + Math.round(Math.random() * 70);
    ctx.strokeStyle = `rgba(${v}, ${v}, ${v}, ${0.3 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(canvas.width * 0.3, y + (Math.random() - 0.5) * 10, canvas.width * 0.7, y + (Math.random() - 0.5) * 10, canvas.width, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture; // pas de colorSpace ici : une roughness map, ce n'est pas de la couleur affichée
}

const woodMaterialCache = {};
function createRealisticWoodMaterial(colorHex, repeatX, repeatY, roughness) {
  const cacheKey = colorHex + '_' + repeatX + '_' + repeatY + '_' + roughness;
  if (woodMaterialCache[cacheKey]) return woodMaterialCache[cacheKey];

  const map = createWoodTexture(colorHex);
  map.repeat.set(repeatX, repeatY);

  const roughnessMap = createRoughnessTexture();
  roughnessMap.repeat.set(repeatX, repeatY);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    roughnessMap,
    roughness,
    metalness: 0.05,
  });
  woodMaterialCache[cacheKey] = material;
  return material;
}

/* =========================================================
   2. LUMIÈRES — l'ambiance chaleureuse du café
   ========================================================= */




// Réglages globaux de luminosité : 1 = intensité actuelle, plus petit = plus sombre
const roomLightScale = 0.7;
const facadeLightScale = 0.7;

// Lumière douce qui éclaire toute la scène, pour que rien ne soit noir
const ambientLight = new THREE.AmbientLight(0xffe8cc, 0.6 * roomLightScale);
scene.add(ambientLight);

// Une lampe suspendue par table (comme sur vos photos)
function createPendantLight(x, z) {
  const pointLight = new THREE.PointLight(0xffaa55, 30 * roomLightScale, 8, 2);
  pointLight.position.set(x, 2.6, z);
    pointLight.castShadow = true;
  pointLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  scene.add(pointLight);

  // Le fil de la lampe
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  cord.position.set(x, 2.9, z);
  scene.add(cord);

  // L'ampoule elle-même ("emissive" la fait paraître lumineuse)
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffdca8,
      emissive: 0xffaa55,
      emissiveIntensity: 1.2,
    })
  );
  bulb.position.set(x, 2.6, z);
  scene.add(bulb);
}

/* =========================================================
   3. SOL ET MUR
   ========================================================= */

// Texture de sol : planches avec joints + léger veinage, même couleur de base qu'avant
function createFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const r = 0x3b, g = 0x2a, b = 0x1e;

  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const plankHeight = canvas.height / 8;
  for (let p = 0; p < 8; p++) {
    const py = p * plankHeight;

    for (let i = 0; i < 25; i++) {
      const y = py + Math.random() * plankHeight;
      const shade = Math.round((Math.random() - 0.5) * 40);
      const lr = Math.min(255, Math.max(0, r + shade));
      const lg = Math.min(255, Math.max(0, g + shade));
      const lb = Math.min(255, Math.max(0, b + shade));
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${0.2 + Math.random() * 0.3})`;
      ctx.lineWidth = 0.5 + Math.random();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(canvas.width * 0.3, y + (Math.random() - 0.5) * 6, canvas.width * 0.7, y + (Math.random() - 0.5) * 6, canvas.width, y);
      ctx.stroke();
    }

    // Joint entre les planches
    ctx.strokeStyle = 'rgba(10, 6, 4, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Texture de mur : léger grain de plâtre, couleur de base personnalisable
function createWallTexture(baseColorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const r = (baseColorHex >> 16) & 255;
  const g = (baseColorHex >> 8) & 255;
  const b = baseColorHex & 255;

  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 900; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const shade = Math.round((Math.random() - 0.5) * 14);
    const lr = Math.min(255, Math.max(0, r + shade));
    const lg = Math.min(255, Math.max(0, g + shade));
    const lb = Math.min(255, Math.max(0, b + shade));
    ctx.fillStyle = `rgba(${lr}, ${lg}, ${lb}, ${0.15 + Math.random() * 0.25})`;
    const s = 1 + Math.random() * 3;
    ctx.fillRect(x, y, s, s);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const floorTexture = createFloorTexture();
floorTexture.repeat.set(3.3, 2.27); // ajusté pour garder des planches de la même taille visuelle qu'avant
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(16.5, 10.6),
  new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.85, metalness: 0.05 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, 1.8); // recentre le sol réduit sur la vraie zone de la salle (du mur du fond à la façade)
floor.receiveShadow = true;
scene.add(floor);

const wallTexture = createWallTexture(0x5a321f);
wallTexture.repeat.set(4, 1.2);
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 3.4),
  new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.9 })
);
wall.position.set(0, 1.7, -3);
wall.receiveShadow = true;
scene.add(wall);
/* =========================================================
   3bis. PLAFOND À TREILLIS
   ========================================================= */

function createLatticeCeiling(x, z, size, cellSize, rotationDeg = 45, yOffset = 0) {
  const lattice = new THREE.Group();
    const beamMaterial = createRealisticWoodMaterial(0xb8843f, 3, 1, 0.65);
  const half = size / 2;

  for (let pos = -half; pos <= half + 0.001; pos += cellSize) {
    const beamA = new THREE.Mesh(new THREE.BoxGeometry(size, 0.1, 0.08), beamMaterial);
    beamA.position.set(0, 0, pos);
    beamA.castShadow = true;
    lattice.add(beamA);

    const beamB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, size), beamMaterial);
    beamB.position.set(pos, 0, 0);
    beamB.castShadow = true;
    lattice.add(beamB);
  }

    lattice.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
  lattice.position.set(x, 3.0 + yOffset, z);
  scene.add(lattice);

  // Panneau clair juste au-dessus, pouºr fermer visuellement le plafond
    const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 1.6, size * 1.6),
    new THREE.MeshStandardMaterial({ color: 0x5a321f, roughness: 0.9 })
  );
  backdrop.rotation.x = Math.PI / 2;
  backdrop.position.set(x, 3.15 + yOffset, z);
  scene.add(backdrop);
}
/* =========================================================
   4. TABLES
   ========================================================= */
function createSquareTable(x, z) {
  const table = new THREE.Group();

    const tableMaterial = createRealisticWoodMaterial(0x6b4a2f, 2, 2, 0.5);

  // Plateau carré
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.08, 1.15),
    tableMaterial
  );

  top.position.y = 0.75;
  top.rotation.y = THREE.MathUtils.degToRad(-45);
  top.castShadow = true;
  top.receiveShadow = true;
  table.add(top);

  // Pied central
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.10, 0.72, 16),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.35,
      metalness: 0.8
    })
  );

  leg.position.y = 0.36;
  leg.castShadow = true;
  table.add(leg);

  table.position.set(x, 0, z);
  scene.add(table);

  // 4 chaises autour de la table
  // 4 chaises autour de la table
createChair(x, z + 0.9, Math.PI, 0xb0263a);       // rouge
createChair(x, z - 0.9, 0, 0x777777);              // blanche
createChair(x - 0.9, z, Math.PI / 2, 0xb0263a);   // rouge
createChair(x + 0.9, z, -Math.PI / 2, 0x777777);  // blanche
}
function createTable(x, z) {
  const table = new THREE.Group();

    const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.06, 24),
    createRealisticWoodMaterial(0x6b4a2f, 2, 2, 0.55)
  );
  top.position.y = 0.75;
  top.castShadow = true;
  top.receiveShadow = true;
  table.add(top);

  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, 0.75, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 })
  );
  leg.position.y = 0.375;
  leg.castShadow = true;
  table.add(leg);

  table.position.set(x, 0, z);
  scene.add(table);
}

/* =========================================================
   5. CHAISES
   ========================================================= */


// Géométries fixes des chaises, créées UNE SEULE FOIS et partagées par les
// 12 chaises de la scène (seule la couleur du matériau change selon la chaise)
const chairGeometries = {
  seat: new THREE.BoxGeometry(0.52, 0.08, 0.52),
  back: new THREE.BoxGeometry(0.52, 0.55, 0.07),
  backBar: new THREE.TorusGeometry(0.27, 0.035, 8, 24, Math.PI),
  leg: new THREE.CylinderGeometry(0.035, 0.045, 0.48, 12),
};
const chairMaterialCache = {};

function createChair(x, z, rotationY, color) {
  const chair = new THREE.Group();

  if (!chairMaterialCache[color]) {
    chairMaterialCache[color] = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.25,
      metalness: 0.9
    });
  }
  const metalMaterial = chairMaterialCache[color];

  const seat = new THREE.Mesh(chairGeometries.seat, metalMaterial);
  seat.position.y = 0.48;
  seat.castShadow = true;
  seat.receiveShadow = true;
  chair.add(seat);

  const back = new THREE.Mesh(chairGeometries.back, metalMaterial);
  back.position.set(0, 0.82, -0.22);
  back.castShadow = true;
  chair.add(back);

  const backBar = new THREE.Mesh(chairGeometries.backBar, metalMaterial);
  backBar.rotation.x = Math.PI / 2;
  backBar.rotation.z = Math.PI;
  backBar.position.set(0, 1.08, -0.22);
  backBar.castShadow = true;
  chair.add(backBar);

  const legPositions = [
    [-0.19, -0.19],
    [ 0.19, -0.19],
    [-0.19,  0.19],
    [ 0.19,  0.19]
  ];

  legPositions.forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(chairGeometries.leg, metalMaterial);
    leg.position.set(lx, 0.24, lz);
    leg.castShadow = true;
    chair.add(leg);
  });

  chair.position.set(x, 0, z);
  chair.rotation.y = rotationY;

  scene.add(chair);
}

/* =========================================================
   6. DÉCORATION SIMPLE
   ========================================================= */

function createPlant(x, z) {
  const plant = new THREE.Group();

  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.16, 0.35, 16),
    new THREE.MeshStandardMaterial({ color: 0xa65c3c, roughness: 0.8 })
  );
  pot.position.y = 0.175;
  pot.castShadow = true;
  plant.add(pot);

  const foliage = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.8 })
  );
  foliage.position.y = 0.55;
  foliage.scale.set(1, 1.2, 1);
  foliage.castShadow = true;
  plant.add(foliage);

  plant.position.set(x, 0, z);
  scene.add(plant);
}
/* =========================================================
   TASSE À CAFÉ AU LAIT — soucoupe + tasse + anse, céramique claire
   ========================================================= */

function createCoffeeCup(parent, x, y, z) {
  const cup = new THREE.Group();
  const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.25, metalness: 0.05 });

  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.012, 16), ceramicMat);
  saucer.position.y = 0.006;
  cup.add(saucer);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.045, 16, 1, true), ceramicMat);
  body.position.y = 0.0345;
  cup.add(body);

  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 16), ceramicMat);
  bottom.position.y = 0.014;
  cup.add(bottom);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12, Math.PI * 1.3), ceramicMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.033, 0.0345, 0);
  cup.add(handle);

  cup.position.set(x, y, z);
  cup.castShadow = true;
  parent.add(cup);
}

/* =========================================================
   MACHINE À CAFÉ RÉALISTE — corps + 3 groupes/leviers + tasses
   ========================================================= */

function createEspressoMachine(parent, x, y, z) {
  const machine = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.35, metalness: 0.6 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.2, metalness: 0.85 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.5, metalness: 0.2 });

  // Corps principal
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.5), bodyMat);
  body.position.y = 0.25;
  body.castShadow = true;
  body.receiveShadow = true;
  machine.add(body);

  // Bandeau chromé sur le dessus du corps
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.03, 0.52), chromeMat);
  trim.position.y = 0.5;
  machine.add(trim);

  // 3 groupes + leviers (portafiltres)
  [-0.4, 0, 0.4].forEach((gx) => {
    const groupHead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), chromeMat);
    groupHead.position.set(gx, 0.18, 0.29);
    machine.add(groupHead);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8), handleMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(gx, 0.1, 0.42);
    shaft.castShadow = true;
    machine.add(shaft);

    const grip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), handleMat);
    grip.position.set(gx, 0.1, 0.5);
    machine.add(grip);

    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.02, 12), chromeMat);
    basket.position.set(gx, 0.09, 0.35);
    machine.add(basket);
  });

  // Bandeau de boutons de commande
  for (let i = -1; i <= 1; i++) {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8), chromeMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(-0.55 + i * 0.05, 0.42, 0.26);
    machine.add(btn);
  }

  // Bac d'égouttage
  const drip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.18), chromeMat);
  drip.position.set(0, 0.02, 0.32);
  machine.add(drip);

  // Plateau chauffe-tasses
  const machineTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.45), bodyMat);
  machineTop.position.y = 0.53;
  machineTop.castShadow = true;
  machine.add(machineTop);

  // Tasses à café au lait posées dessus
  createCoffeeCup(machine, -0.35, 0.565, -0.05);
  createCoffeeCup(machine, -0.1, 0.565, 0.08);
  createCoffeeCup(machine, 0.15, 0.565, -0.08);
  createCoffeeCup(machine, 0.4, 0.565, 0.05);

  machine.position.set(x, y, z);
  parent.add(machine);
}

/* =========================================================
   6bis. BAR / COMPTOIR
   ========================================================= */

function createBar(x, z) {

  const bar = new THREE.Group();

  // -------------------------------------------------------
  // 1. FAÇADE DU BAR
  // -------------------------------------------------------

    const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b6b6b,
    roughness: 0.75,
    metalness: 0.05
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(9.5, 1.05, 0.75),
    bodyMaterial
  );

  body.position.y = 0.525;
  body.castShadow = true;
  body.receiveShadow = true;
  bar.add(body);

  // -------------------------------------------------------
  // 2. GRAND PLATEAU EN BOIS
  // -------------------------------------------------------

    const woodMaterial = createRealisticWoodMaterial(0x5a321f, 4, 1, 0.5);

  const counterTop = new THREE.Mesh(
    new THREE.BoxGeometry(9.7, 0.14, 0.95),
    woodMaterial
  );

  counterTop.position.y = 1.12;
  counterTop.castShadow = true;
  counterTop.receiveShadow = true;
  bar.add(counterTop);

  // -------------------------------------------------------
  // 3. BANDE DÉCORATIVE SUR LE DEVANT
  // -------------------------------------------------------

  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8843f,
    roughness: 0.3,
    metalness: 0.6
  });

  const decorativeLine = new THREE.Mesh(
    new THREE.BoxGeometry(8.8, 0.07, 0.035),
    goldMaterial
  );

  decorativeLine.position.set(0, 0.72, 0.39);
  bar.add(decorativeLine);

  // -------------------------------------------------------
  // 4. PORTES / PANNEAUX DU COMPTOIR
  // -------------------------------------------------------

  for (let i = -4; i <= 4; i++) {

        const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.55, 0.035),
      new THREE.MeshStandardMaterial({
        color: 0x5a321f,
        roughness: 0.8
      })
    );

    panel.position.set(i * 1.0, 0.35, 0.39);
    panel.castShadow = true;
    bar.add(panel);

    // petite poignée
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.025, 0.025),
      new THREE.MeshStandardMaterial({
        color: 0x555555,
        metalness: 0.8,
        roughness: 0.3
      })
    );

    handle.position.set(i * 1.0, 0.37, 0.42);
    bar.add(handle);
  }
  // -------------------------------------------------------
  // BARRIÈRE CÔTÉ CLIENT
  // -------------------------------------------------------

  const frontBarrier = new THREE.Mesh(
    new THREE.BoxGeometry(9.5, 1.25, 0.12),
    bodyMaterial
  );

  // Côté client = devant le bar
  frontBarrier.position.set(0, 0.62, 0.42);
  frontBarrier.castShadow = true;
  frontBarrier.receiveShadow = true;
  bar.add(frontBarrier);
  // =======================================================
// FILET MÉTALLIQUE VERTICAL — 3 PANNEAUX SUR LE BAR
// =======================================================

const meshLineMaterial = new THREE.LineBasicMaterial({
  color: 0x333333, // gris foncé
  transparent: true,
  opacity: 0.95
});

// Dimensions des 3 panneaux
const meshWidth =1.1;
const meshHeight = 1.1;

// Fonction pour créer un panneau de filet
function createMetalMeshPanel(positionX) {

  const geometry = new THREE.PlaneGeometry(
    meshWidth,
    meshHeight,
    18,
    12
  );

  // Crée les lignes du filet
  const wireGeometry = new THREE.WireframeGeometry(geometry);

  const mesh = new THREE.LineSegments(
    wireGeometry,
    meshLineMaterial
  );

  // Motif en losanges
  mesh.rotation.z = THREE.MathUtils.degToRad(90);

  // Position sur la façade du bar
  mesh.position.set(
    positionX,
    0.62,
    0.50
  );

  bar.add(mesh);
}

// -------------------------------------------------------
// 3 PANNEAUX
// -------------------------------------------------------

createMetalMeshPanel(-3.1);
createMetalMeshPanel(0);
createMetalMeshPanel(3.1);
createMetalMeshPanel(-1.5);
createMetalMeshPanel(1.5);

// -------------------------------------------------------
// SÉPARATIONS VERTICALES ENTRE LES PANNEAUX
// -------------------------------------------------------

const separatorMaterial = new THREE.MeshStandardMaterial({
  color: 0x5a321f,
  roughness: 0.75,
  metalness: 0.05
});

function createMeshSeparator(x) {

  const separator = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 1.15, 0.08),
    separatorMaterial
  );

  separator.position.set(x, 0.62, 0.52);

  separator.castShadow = true;

  bar.add(separator);
}

// Deux séparations
createMeshSeparator(-0.75);
createMeshSeparator(0.75);
  // -------------------------------------------------------
  // 5. MACHINE À CAFÉ
  // -------------------------------------------------------

        // Un seul grand mur marron continu derrière tout le bar — plus aucun
    // espace possible entre des panneaux séparés
  const barBackWallTexture = createWallTexture(0x5a321f);
  barBackWallTexture.repeat.set(5, 1);
  const barBackWall = new THREE.Mesh(
    new THREE.BoxGeometry(8.3, 1.6, 0.05),
    new THREE.MeshStandardMaterial({ map: barBackWallTexture, roughness: 0.9 })
  );
  barBackWall.position.set(0, 1.95, -0.33);
  barBackWall.castShadow = true;
  barBackWall.receiveShadow = true;
  bar.add(barBackWall);

  createEspressoMachine(bar, -2.5, 1.68, -0.045);

  // -------------------------------------------------------
  // NOUVELLE SECTION D'ÉTAGÈRES — à droite de la machine, fond miroir
  // -------------------------------------------------------

       const mirrorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.8, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x5a321f, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.5 })
  );
  mirrorPanel.position.set(0, 2.0, -0.3);
  bar.add(mirrorPanel);

  const upperShelf = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.1, 0.4),
    createRealisticWoodMaterial(0x6b4027, 3, 1, 0.55)
  );
  upperShelf.position.set(0, 2.35, -0.15);
  upperShelf.castShadow = true;
  bar.add(upperShelf);

  const middleBottleHeights = [0.30, 0.34, 0.26, 0.32, 0.28, 0.35, 0.29, 0.31];
  const upperBottleHeights = [0.26, 0.31, 0.28, 0.33, 0.27, 0.30, 0.25, 0.32];
  const middleBottleColors = [0x1f3d20, 0x4a2f1a, 0x6b4a2f, 0x2a2a2a, 0x1f3d20, 0x4a2f1a, 0x6b4a2f, 0x2a2a2a];

  for (let i = 0; i < 8; i++) {
    const bx = -1.5 + i * (3.0 / 7);
    const rot = (Math.random() - 0.5) * 40;
    createRealisticBottle(bar, bx, 2.06, -0.15, middleBottleHeights[i], middleBottleColors[i], rot);
  }
  for (let i = 0; i < 8; i++) {
    const bx = -1.45 + i * (3.0 / 7);
    const rot = (Math.random() - 0.5) * 40;
    createRealisticBottle(bar, bx, 2.41, -0.15, upperBottleHeights[i], middleBottleColors[(i + 4) % 8], rot);
  }

  // -------------------------------------------------------
  // 6. PETITE VITRINE
  // -------------------------------------------------------

      const display = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 0.55, 0.55),
    new THREE.MeshPhysicalMaterial({
      color: 0xf5faf8,
      transmission: 0.97,
      thickness: 0.02,
      roughness: 0.02,
      ior: 1.5,
      metalness: 0,
      envMapIntensity: 1,
    })
  );

    display.position.set(1.0, 1.47,-0.28);
  display.castShadow = true;
  bar.add(display);

  // --- Étagère + croissants et madeleines à l'intérieur de la vitrine ---
       function createCroissant(px, py, pz, rotDeg) {
    const croissant = new THREE.Mesh(
      new THREE.TorusGeometry(0.135, 0.06, 8, 12, Math.PI * 1.3),
      new THREE.MeshStandardMaterial({ color: 0x8a5a26, roughness: 0.75 })
    );
    croissant.rotation.x = Math.PI / 2;
    croissant.rotation.z = THREE.MathUtils.degToRad(rotDeg);
    croissant.position.set(px, py, pz);
    croissant.castShadow = true;
    bar.add(croissant);
  }

        function createMadeleine(px, py, pz) {
    const madeleine = new THREE.Mesh(
      new THREE.SphereGeometry(0.096, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9a058, roughness: 0.6 })
    );
    madeleine.scale.set(1.4, 0.45, 1);
    madeleine.position.set(px, py, pz);
    madeleine.castShadow = true;
    bar.add(madeleine);

        for (let i = -1; i <= 1; i++) {
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.009, 0.03, 0.135),
        new THREE.MeshStandardMaterial({ color: 0x9c7a3f, roughness: 0.7 })
      );
      ridge.position.set(px + i * 0.039, py + 0.027, pz);
      bar.add(ridge);
    }
  }

   const displayShelf = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.02, 0.45),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.3, metalness: 0.4 })
  );
  displayShelf.position.set(1.0, 1.35, -0.28);
  displayShelf.castShadow = true;
  displayShelf.receiveShadow = true;
  bar.add(displayShelf);

      createCroissant(-0.135, 1.44, -0.32, 20);
  createCroissant(0.315, 1.44, -0.24, -35);
  createCroissant(0.765, 1.44, -0.3, 60);
  createMadeleine(1.154, 1.406, -0.26);
  createMadeleine(1.483, 1.406, -0.3);
  createMadeleine(1.812, 1.406, -0.25);
  createMadeleine(2.141, 1.406, -0.3);

    // --- LED sur toute la longueur de la vitrine, suspendue au plafond par des supports ---
  const ledMetalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.6 });

  const ledHousing = new THREE.Mesh(
    new THREE.BoxGeometry(2.9, 0.025, 0.06),
    ledMetalMat
  );
  ledHousing.position.set(1.0, 1.68, -0.28);
  bar.add(ledHousing);

     const ledStrip = new THREE.Mesh(
    new THREE.BoxGeometry(2.85, 0.012, 0.045),
    new THREE.MeshStandardMaterial({
      color: 0xd4a017,
      emissive: 0xd4a017,
      emissiveIntensity: 6,
      roughness: 0.5,
    })
  );
  ledStrip.position.set(1.0, 1.655, -0.28); // nettement sous le boîtier, ne se chevauchent plus
  bar.add(ledStrip);

  // 4 petits supports, du plafond de la vitrine jusqu'au boîtier — suspendu, pas collé
  [-0.2, 0.6, 1.4, 2.2].forEach((sx) => {
    const bracket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8),
      ledMetalMat
    );
    bracket.position.set(sx, 1.718, -0.28); // remonté pour partir du dessus du boîtier, sans le chevaucher non plus
    bar.add(bracket);
  });

  // 3 spots jaune foncé, plus lumineux et au bord plus net (moins de penumbra)
  // pour un contraste plus marqué entre la zone éclairée et le reste de la vitrine
  [0.0, 0.9, 1.8].forEach((sx) => {
    const displaySpot = new THREE.SpotLight(0xd4a017, 8, 0.6, Math.PI / 6, 0.25, 2);
    displaySpot.position.set(sx, 1.68, -0.28);
    displaySpot.target.position.set(sx, 1.35, -0.28);
    bar.add(displaySpot);
    bar.add(displaySpot.target);
  });

  // -------------------------------------------------------
  // 7. ÉTAGÈRE DERRIÈRE LE BAR
  // -------------------------------------------------------

    const shelfMaterial = createRealisticWoodMaterial(0x6b4027, 4, 1, 0.55);

    const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 0.12, 0.45),
    shelfMaterial
  );

  shelf.position.set(0, 2.0, -0.15);
  shelf.castShadow = true;
  bar.add(shelf);

  // -------------------------------------------------------
  // 7bis. FOND NOIR + BOUTEILLES D'ALCOOL — milieu du bar, côté intérieur droit
  // -------------------------------------------------------

      

    const barBottleHeights = [0.30, 0.34, 0.26, 0.32, 0.28, 0.35, 0.29];
  const barBottleColors = [0x1f3d20, 0x4a2f1a, 0x6b4a2f, 0x1f3d20, 0x4a2f1a, 0x2a2a2a, 0x6b4a2f];

    for (let i = 0; i < 7; i++) {
    const bx = 1.95 + i * 0.28;
    const rot = (Math.random() - 0.5) * 40;
    createRealisticBottle(bar, bx, 2.06, -0.15, barBottleHeights[i], barBottleColors[i], rot);
  }

  
  // -------------------------------------------------------
  // 8. PETIT CORNER DU BAR — laisse un passage vers la 2e salle
  // -------------------------------------------------------

    const cornerMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a321f,
    roughness: 0.75,
    metalness: 0.05
  });

  const cornerTopMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a321f,
    roughness: 0.45,
    metalness: 0.1
  });

 // -------------------------------------------------------
// PETIT RETOUR DU BAR — 30° vers l'intérieur
// -------------------------------------------------------

const corner = new THREE.Mesh(
  new THREE.BoxGeometry(0.75, 1.05, 2.8),
  cornerMaterial
);

// Position du retour
corner.position.set(4.90, 0.525, -0.5);

// Rotation de 30 degrés
corner.rotation.y = THREE.MathUtils.degToRad(-45);

corner.castShadow = true;
corner.receiveShadow = true;
bar.add(corner);


// -------------------------------------------------------
// PLATEAU MARRON DU CORNER
// -------------------------------------------------------

const cornerTop = new THREE.Mesh(
  new THREE.BoxGeometry(0.9, 0.14, 2.95),
  cornerTopMaterial
);

// EXACTEMENT la même position que le corner beige
cornerTop.position.set(4.90, 1.12, -0.5);

// EXACTEMENT le même angle que le corner beige
cornerTop.rotation.y = THREE.MathUtils.degToRad(-45);

cornerTop.castShadow = true;
cornerTop.receiveShadow = true;

bar.add(cornerTop);

// Corner gauche — miroir exact du corner droit (x et rotation inversés, z identique)
createBarCorner(bar, -4.90, -0.5, 45);
  // =======================================================
  // PILIER 1 — ENTRE LE BAR ET LE CORNER DROIT
  // =======================================================

 createBarPillar(
    bar,
    4.20,
    -0.15,
    THREE.MathUtils.degToRad(-45)
);

  // =======================================================
  // PILIER 2 — AUTRE CÔTÉ DU BAR
  // POUR LE FUTUR CORNER VERS LA SALLE INTÉRIEURE
  // =======================================================

    createBarPillar(
    bar,
    -4.40,
    -0.10,
    THREE.MathUtils.degToRad(45)
);

  createBarFootrest(bar);
  // -------------------------------------------------------
  // POSITION DU BAR
  // -------------------------------------------------------

  bar.position.set(x, 0, z);

  scene.add(bar);
}
/* =========================================================
   7. PILIERS DU BAR
   ========================================================= */

function createBarPillar(bar, x, z, rotationY = 0) {

  const pillar = new THREE.Group();

  // -------------------------------------------------------
  // MATÉRIAU DU PILIER
  // -------------------------------------------------------

    const pillarMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a321f,
    roughness: 0.75,
    metalness: 0.05
  });

  // -------------------------------------------------------
  // CORPS DU PILIER
  // -------------------------------------------------------

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 3.1, 0.36),
    pillarMaterial
  );

  body.position.y = 1.55;
  body.castShadow = true;
  body.receiveShadow = true;

  pillar.add(body);

  // -------------------------------------------------------
  // PETITE MOULURE EN HAUT
  // -------------------------------------------------------

    const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.10, 0.46),
    new THREE.MeshStandardMaterial({
      color: 0x5a321f,
      roughness: 0.8
    })
  );

  top.position.y = 3.08;
  top.castShadow = true;

  pillar.add(top);
  // -------------------------------------------------------
  // PETITE BASE DU PILIER
  // -------------------------------------------------------

    const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.10, 0.46),
    new THREE.MeshStandardMaterial({
      color: 0x5a321f,
      roughness: 0.8
    })
  );

  base.position.y = 0.05;
  base.castShadow = true;

  pillar.add(base);

  // -------------------------------------------------------
  // POSITION DU PILIER
  // -------------------------------------------------------

  pillar.position.set(x, 0, z);
  pillar.rotation.y = rotationY;

  // Le pilier devient un élément du bar
  bar.add(pillar);
}

/* =========================================================
   REPOSE-PIEDS DU BAR — barre métallique + supports
   ========================================================= */

function createBarFootrest(bar) {

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x8c8c8c,
    roughness: 0.3,
    metalness: 0.8
  });

  // Barre horizontale (repose-pieds), sur toute la longueur du bar
  const footrestBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 9.5, 12),
    metalMaterial
  );

  footrestBar.rotation.z = Math.PI / 2;
  footrestBar.position.set(0, 0.3, 0.6);
  footrestBar.castShadow = true;

  bar.add(footrestBar);

  // Petits supports qui relient la barre à la façade du bar
  const supportPositions = [-3.0, -1.5, 0, 1.5, 3.0];

  supportPositions.forEach((supportX) => {

    const support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8),
      metalMaterial
    );

    support.rotation.x = Math.PI / 2;
    support.position.set(supportX, 0.3, 0.51);
    support.castShadow = true;

    bar.add(support);
  });
}
/* =========================================================
   10. CORNER DU BAR (RÉUTILISABLE — DROITE ET GAUCHE)
   ========================================================= */

function createBarCorner(bar, x, z, rotationYDeg) {
  const cornerMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a321f,
    roughness: 0.75,
    metalness: 0.05
  });

  const cornerTopMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a321f,
    roughness: 0.45,
    metalness: 0.1
  });

  const corner = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.05, 2.8), cornerMaterial);
  corner.position.set(x, 0.525, z);
  corner.rotation.y = THREE.MathUtils.degToRad(rotationYDeg);
  corner.castShadow = true;
  corner.receiveShadow = true;
  bar.add(corner);

  const cornerTop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 2.95), cornerTopMaterial);
  cornerTop.position.set(x, 1.12, z);
  cornerTop.rotation.y = THREE.MathUtils.degToRad(rotationYDeg);
  cornerTop.castShadow = true;
  cornerTop.receiveShadow = true;
  bar.add(cornerTop);
}

/* =========================================================
   8. MURS DE SÉPARATION BAR / DEUXIÈME SALLE
   ========================================================= */

function createDividerWall(x, zStart, zEnd, thickness, rotationYDeg) {
  const length = zEnd - zStart;
  const centerZ = (zStart + zEnd) / 2;

   // Mur plein, rouge foncé comme la façade
  const dividerTexture = createWallTexture(0x61201c);
  dividerTexture.repeat.set(Math.max(1, Math.round(length / 3)), 1.2);
  const wallMaterial = new THREE.MeshStandardMaterial({ map: dividerTexture, roughness: 0.9 });

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(thickness, 3.4, length),
    wallMaterial
  );

  panel.position.set(x, 1.7, centerZ);
  panel.rotation.y = THREE.MathUtils.degToRad(rotationYDeg);
  panel.castShadow = true;
  panel.receiveShadow = true;
  scene.add(panel);
}
/* =========================================================
   BOUTEILLE RÉALISTE — corps galbé + épaule + col + capsule +
   étiquette, en vrai verre optique. Réutilisée partout (bar +
   les 2 porte-verres) pour un rendu cohérent.
   ========================================================= */
const bottleMaterialCache = {};
function createRealisticBottle(parent, x, y, z, height, colorHex, rotationYDeg = 0) {
  const bottle = new THREE.Group();

  if (!bottleMaterialCache[colorHex]) {
    bottleMaterialCache[colorHex] = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      transmission: 0.75,
      thickness: 0.05,
      roughness: 0.15,
      ior: 1.5,
      metalness: 0,
      envMapIntensity: 1,
    });
  }
  const glassMat = bottleMaterialCache[colorHex];

  const bodyHeight = height * 0.72;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, bodyHeight, 14), glassMat);
  body.position.y = bodyHeight / 2;
  body.castShadow = true;
  bottle.add(body);

  const shoulderHeight = height * 0.1;
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.042, shoulderHeight, 14), glassMat);
  shoulder.position.y = bodyHeight + shoulderHeight / 2;
  bottle.add(shoulder);

  const neckHeight = height * 0.18;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, neckHeight, 10), glassMat);
  neck.position.y = bodyHeight + shoulderHeight + neckHeight / 2;
  bottle.add(neck);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.025, 10),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.5 })
  );
  cap.position.y = bodyHeight + shoulderHeight + neckHeight + 0.012;
  bottle.add(cap);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.06, bodyHeight * 0.4),
    new THREE.MeshStandardMaterial({ color: 0xf2e8d8, roughness: 0.85, side: THREE.DoubleSide })
  );
  label.position.set(0, bodyHeight * 0.45, 0.051);
  bottle.add(label);

  bottle.position.set(x, y, z);
  bottle.rotation.y = THREE.MathUtils.degToRad(rotationYDeg);
  parent.add(bottle);
}

/* =========================================================
   9. PORTE-VERRES SUSPENDU + ÉTAGÈRE À BOUTEILLES (CORNER)
   ========================================================= */

function createCornerGlassRack(x, y, z, rotationYDeg, rackLength, shelfHeight) {
  const rack = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe8e0, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.1 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x6b4027, roughness: 0.55 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.5 });

  const railGap = 0.32; // écart entre les 2 rails
  const half = rackLength / 2;

  // --- 2 rails métalliques parallèles ---
  [-railGap / 2, railGap / 2].forEach((railX) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, rackLength), metalMat);
    rail.position.set(railX, 0, 0);
    rail.castShadow = true;
    rack.add(rail);
  });

  // --- 7 verres suspendus par le pied, répartis le long du rail ---
  const glassCount = 7;
  for (let i = 0; i < glassCount; i++) {
    const gz = -half + (rackLength / (glassCount - 1)) * i;

    const separator = new THREE.Mesh(new THREE.BoxGeometry(railGap, 0.025, 0.025), metalMat);
    separator.position.set(0, 0, gz);
    rack.add(separator);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 16), glassMat);
    foot.position.set(0, -0.01, gz);
    rack.add(foot);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.11, 10), glassMat);
    stem.position.set(0, -0.08, gz);
    rack.add(stem);

    // coupe inversée : étroite en haut (près de la tige), large en bas (bord du verre)
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.085, 0.16, 16, 1, true), glassMat);
    bowl.position.set(0, -0.21, gz);
    bowl.castShadow = true;
    rack.add(bowl);
  }

  // --- 2 tiges de suspension entre le porte-verres et l'étagère ---
  [-half + 0.15, half - 0.15].forEach((sz) => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, shelfHeight, 8), metalMat);
    rod.position.set(0, shelfHeight / 2, sz);
    rod.castShadow = true;
    rack.add(rod);
  });

    // --- étagère à bouteilles ---
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, rackLength + 0.3), shelfMat);
  shelf.position.set(0, shelfHeight, 0);
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  rack.add(shelf);

  // --- 6 bouteilles réalistes, hauteurs et teintes variées ---
  const bottleHeights = [0.32, 0.27, 0.34, 0.29, 0.33, 0.28];
  const bottleColors = [0x1f3d20, 0x4a2f1a, 0x6b4a2f, 0x1f3d20, 0x4a2f1a, 0x2a2a2a];
  for (let i = 0; i < 6; i++) {
    const bz = -half + 0.3 + ((rackLength - 0.6) / 5) * i;
    const rot = (Math.random() - 0.5) * 40;
    createRealisticBottle(rack, 0, shelfHeight + 0.015, bz, bottleHeights[i], bottleColors[i], rot);
  }

  rack.position.set(x, y, z);
  rack.rotation.y = THREE.MathUtils.degToRad(rotationYDeg);
  scene.add(rack);
}
/* =========================================================
   11. SPOTS DE LUMIÈRE — salle et bar
   ========================================================= */

function createSpotLights() {
  const spotColor = 0xffaa55; // même teinte chaude que les lampes existantes

  // x,y,z = position du spot | tx,ty,tz = point visé | intensity = puissance
  function addSpot(x, y, z, tx, ty, tz, intensity) {
    const spot = new THREE.SpotLight(spotColor, intensity * roomLightScale, 6, Math.PI / 6, 0.5, 2);
    spot.position.set(x, y, z);
    spot.target.position.set(tx, ty, tz);
    scene.add(spot);
    scene.add(spot.target);
  }

  // ---------------------------------------------------------
  // SALLE — coins et murs. Changez x/y/z pour déplacer le spot,
  // tx/ty/tz pour changer sa direction, le dernier chiffre pour l'intensité.
  // ---------------------------------------------------------
  addSpot(-5.0, 3.1, -2.5, -5.5, 0, -3,  90); // coin arrière gauche
  addSpot(5.0, 3.1, -2.5, 5.5, 0, -3,    90); // coin arrière droit
  addSpot(-4.5, 3.1, 2.0, -5.5, 0, 2.0,  90); // mur gauche, hauteur table carrée
  addSpot(4.5, 3.1, 2.0, 5.5, 0, 2.0,    90); // mur droit, hauteur table carrée


    // ---------------------------------------------------------
  // BAR — coins intérieurs uniquement (spots de la face intérieure éteints)
  // ---------------------------------------------------------
  addSpot(-4.4, 2.6, -1.3, -4.4, 1.3, -1.3,   70); // coin intérieur gauche du bar
  addSpot(4.2, 2.6, -1.3, 4.2, 1.3, -1.3,     70); // coin intérieur droit du bar
}
/* =========================================================
   12. FIL LED BLANC — tour de la façade du bar
   ========================================================= */

function createLedStrip(x, y, z, length, rotationYDeg) {
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.03, length),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.5,
      roughness: 0.5,
    })
  );
  strip.position.set(x, y, z);
  strip.rotation.y = THREE.MathUtils.degToRad(rotationYDeg);
  scene.add(strip);
}
 
/* =========================================================
   14. TÉLÉVISION MURALE DU SALON
   ========================================================= */

function createLoungeTV(x, y, z, width, height, rotationYDeg) {
  const tv = new THREE.Group();

  // Cadre fin, plaqué contre le mur
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, height, width),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4, metalness: 0.6 })
  );
  tv.add(frame);

  // Écran, légère lueur bleutée sans vraie source de lumière
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, height - 0.06, width - 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x050505,
      emissive: 0x16232b,
      emissiveIntensity: 2,
      roughness: 0.2,
    })
  );
  screen.position.x = -0.015;
  tv.add(screen);

  tv.position.set(x, y, z);
  tv.rotation.y = THREE.MathUtils.degToRad(rotationYDeg); // même angle que le mur droit pour rester bien plaquée
  scene.add(tv);
}
/* =========================================================
   15. FAÇADE PRINCIPALE / ENTRÉE
   ========================================================= */

function createCafeFacade() {
  // ===== VARIABLES FACILES À MODIFIER =====
  const facadeX = 0;              // position X du centre de la façade
  const facadeZ = 6.8;            // position Z (à l'avant de la salle, devant les tables)
  const facadeRotationDeg = 0;    // rotation de l'ensemble de la façade
  const facadeWidth = 14;         // largeur totale
  const facadeHeight = 3.4;       // hauteur totale (= hauteur des murs existants)
  const centerWindowWidth = 5.2;  // largeur de la grande vitrine centrale
  const sideWindowWidth = 1.3;    // largeur de chaque vitrine latérale
  const doorWidth = 2.6;          // largeur de chaque porte
  const baseHeight = 0.95;        // hauteur de la partie basse (sous les vitrines)
  const mullionWidth = 0.15;      // largeur des montants entre sections
  const endWidth = 0.2;           // largeur des montants aux 2 extrémités

  const facade = new THREE.Group();

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x61201c, roughness: 0.75 });
  const woodMat = createRealisticWoodMaterial(0x5a321f, 3, 1, 0.5);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x6e1420, roughness: 0.45, metalness: 0.3 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5faf8, // quasi blanc, pour ne plus teinter ce qu'on voit à travers
    transmission: 0.97,
    thickness: 0.02,
    roughness: 0.02,
    ior: 1.5,
    metalness: 0,
    envMapIntensity: 1,
  });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.3 });

  // --- Positionnement séquentiel gauche → droite (change automatiquement si vous modifiez une largeur ci-dessus) ---
  let cursor = -facadeWidth / 2;
  function place(w) { const c = cursor + w / 2; cursor += w; return c; }

  const xEndL = place(endWidth);
  const xDoorL = place(doorWidth);
  const xM1 = place(mullionWidth);
  const xWinL = place(sideWindowWidth);
  const xM2 = place(mullionWidth);
  const xWinC = place(centerWindowWidth);
  const xM3 = place(mullionWidth);
  const xWinR = place(sideWindowWidth);
  const xM4 = place(mullionWidth);
  const xDoorR = place(doorWidth);
  const xEndR = place(endWidth);

      // --- Montants centraux, inchangés (restent sur le plan principal) ---
  [xM1, xM2, xM3, xM4].forEach((mx) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, facadeHeight, 0.15), frameMat);
    post.position.set(mx, facadeHeight / 2, 0);
    post.castShadow = true;
    facade.add(post);
  });

      // --- 4 appliques murales anciennes, plus grandes et ornementées ---
  function addPostLamp(mx) {
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.75 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xb8843f, roughness: 0.3, metalness: 0.7 });
    const midHeight = facadeHeight / 2;
    const lampZ = 0.28;

    // Rosace décorative au mur
    const backplate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16), metalMat);
    backplate.rotation.x = Math.PI / 2;
    backplate.position.set(mx, midHeight, 0.09);
    facade.add(backplate);

    const rosette = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 16), goldMat);
    rosette.position.set(mx, midHeight, 0.1);
    facade.add(rosette);

    // Bras incliné qui sort du mur, façon fer forgé
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), metalMat);
    arm.rotation.x = Math.PI / 2 - 0.35;
    arm.position.set(mx, midHeight + 0.05, 0.2);
    facade.add(arm);

    // Fleuron doré en haut de la cage
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 12), goldMat);
    finial.position.set(mx, midHeight + 0.16, lampZ);
    facade.add(finial);

    // Disques haut/bas de la cage
    const cageTop = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 16), goldMat);
    cageTop.position.set(mx, midHeight + 0.1, lampZ);
    facade.add(cageTop);

    const cageBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.015, 16), goldMat);
    cageBottom.position.set(mx, midHeight - 0.1, lampZ);
    facade.add(cageBottom);

    // Petite goutte décorative sous la cage
    const drop = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 10), goldMat);
    drop.rotation.x = Math.PI;
    drop.position.set(mx, midHeight - 0.13, lampZ);
    facade.add(drop);

    // 6 montants de la cage (au lieu de 4)
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 / 6) * i;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), metalMat);
      bar.position.set(mx + Math.cos(angle) * 0.07, midHeight, lampZ + Math.sin(angle) * 0.07);
      facade.add(bar);
    }

    // Grosse ampoule chaude bien visible
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffcc33, emissiveIntensity: 1.8 })
    );
    bulb.position.set(mx, midHeight, lampZ);
    facade.add(bulb);

      // Lumière chaude localisée, juste assez pour un halo autour de l'applique
    // elle-même — sans laver la couleur rouge foncé du mur autour
    const postLight = new THREE.PointLight(0xffcc33, 1.8 * facadeLightScale, 1.0, 2);
    postLight.position.set(mx, midHeight, lampZ - 0.05);
    facade.add(postLight);
  }

  [xM1, xM2, xM3, xM4].forEach(addPostLamp);

  // --- Poteaux d'angle (gauche + droit), reculés à la même profondeur que les portes ---
  const doorHeight = facadeHeight - 0.8;
  const recessDepth = 0.8;

  function addCornerPost(px) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, facadeHeight, 0.15), frameMat);
    post.position.set(px, facadeHeight / 2, -recessDepth);
    post.castShadow = true;
    facade.add(post);
  }
  addCornerPost(xEndL);
  addCornerPost(xEndR);

  // --- Murs rouges de retour, ferment les 2 côtés de chaque renfoncement ---
  function addReveal(px) {
    const reveal = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, doorHeight, recessDepth),
      baseMat
    );
    reveal.position.set(px, doorHeight / 2, -recessDepth / 2);
    reveal.castShadow = true;
    reveal.receiveShadow = true;
    facade.add(reveal);
  }
  addReveal(xEndL); // retour extérieur gauche
  addReveal(xM1);   // retour intérieur gauche (côté vitrine)
  addReveal(xM4);   // retour intérieur droit (côté vitrine)
  addReveal(xEndR); // retour extérieur droits

  // --- Section vitrée : base solide + vitre + linteau (espace enseigne) ---
  function addWindowSection(x, width) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, baseHeight, 0.2), baseMat);
    base.position.set(x, baseHeight / 2, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    facade.add(base);

    const glassHeight = facadeHeight - baseHeight - 0.8;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, glassHeight, 0.04), glassMat);
    glass.position.set(x, baseHeight + glassHeight / 2, 0);
    facade.add(glass);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.8, 0.2), woodMat);
    lintel.position.set(x, facadeHeight - 0.4, 0);
    lintel.castShadow = true;
    facade.add(lintel);
  }

  addWindowSection(xWinL, sideWindowWidth);
  addWindowSection(xWinC, centerWindowWidth);
  addWindowSection(xWinR, sideWindowWidth);

  // --- Porte vitrée : vitre pleine hauteur + linteau + poignée ---
      function addDoor(x, width, rotationDeg = 0, zOffset = 0) {
    const doorHeight = facadeHeight - 0.8;
    const leafWidth = (width - 0.14) / 2;
    const pivotX = x - width / 2; // bord gauche = point d'attache fixe au montant voisin

    const doorGroup = new THREE.Group();

    const centerPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorHeight, 0.06), frameMat);
    centerPost.position.set(width / 2, doorHeight / 2, 0);
    centerPost.castShadow = true;
    doorGroup.add(centerPost);

    [-1, 1].forEach((side) => {
      const leafX = width / 2 + side * (leafWidth / 2 + 0.07);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(leafWidth - 0.05, doorHeight - 0.05, 0.04), glassMat);
      glass.position.set(leafX, doorHeight / 2, 0);
      doorGroup.add(glass);

      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), handleMat);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(width / 2 + side * 0.14, doorHeight / 2, 0.05);
      doorGroup.add(handle);
    });

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.8, 0.2), woodMat);
    lintel.position.set(width / 2, facadeHeight - 0.4, 0);
    lintel.castShadow = true;
    doorGroup.add(lintel);

     doorGroup.position.set(pivotX, 0, zOffset);
    doorGroup.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
    facade.add(doorGroup);
  }

      addDoor(xDoorL, doorWidth, 0, -0.8);
  addDoor(xDoorR, doorWidth, 0, -0.8);

  // --- 3 marches devant chaque porte, partent du seuil reculé (z=-0.8) et descendent vers l'extérieur ---
  function createFacadeStairs(x, z, width) {
    const stairWidth = width + 0.3;
    const stepDepth = 0.38;
    const stepHeight = 0.12;
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.85 });

    for (let i = 0; i < 3; i++) {
      const height = stepHeight * (3 - i);
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(stairWidth, height, stepDepth),
        stoneMat
      );
      step.position.set(x, height / 2, z + stepDepth * i + stepDepth / 2);
      step.castShadow = true;
      step.receiveShadow = true;
      facade.add(step);
    }
  }
        createFacadeStairs(xDoorL, -0.8, doorWidth);
  createFacadeStairs(xDoorR, -0.8, doorWidth);

  // --- Pots à fleurs longs, à côté de chaque porte ---
  function createFacadePlanter(x, z, length) {
    const planter = new THREE.Group();

    const potMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(length, 0.32, 0.28), potMat);
    box.position.y = 0.16;
    box.castShadow = true;
    box.receiveShadow = true;
    planter.add(box);

    const soil = new THREE.Mesh(
      new THREE.BoxGeometry(length - 0.04, 0.04, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.95 })
    );
    soil.position.y = 0.33;
    planter.add(soil);

    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.8 });
    const count = Math.max(3, Math.round(length / 0.22));
    for (let i = 0; i < count; i++) {
      const fx = -length / 2 + 0.15 + i * ((length - 0.3) / (count - 1));
      const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.13 + Math.random() * 0.04, 10, 10), foliageMat);
      foliage.position.set(fx, 0.42 + Math.random() * 0.03, 0);
      foliage.scale.set(1, 1.15, 1);
      foliage.castShadow = true;
      planter.add(foliage);
    }

          planter.position.set(x, 0, z);
    facade.add(planter);
  }

      createFacadePlanter(xWinL, 0.55, 1.0); // vitrine gauche
  createFacadePlanter(xWinR, 0.55, 1.0); // vitrine droite

     // --- Logo circulaire doré au centre de la vitrine centrale ---
  // Même hiérarchie que le logo principal du site : titre "CAFÉ CENTRAL"
  // (empilé sur 2 lignes pour rester lisible dans le cercle) + sous-titre
  // jaune "TAPAS & CAFELITOS" en dessous, plus petit.
    function createFacadeLogoCircle(x, y, z, radius, line1, line2, subtitle) {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xb8843f, roughness: 0.3, metalness: 0.7 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.025, 10, 48), goldMat);
    ring.position.set(x, y, z);
    facade.add(ring);

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 5;

    // Réduit la police de chaque ligne jusqu'à ce qu'elle tienne réellement
    // dans le cercle à cette hauteur (mesuré, pas deviné) — le cercle est
    // plus étroit en haut/en bas qu'au milieu.
    function fitText(text, centerY, maxSize) {
      const offset = Math.abs(centerY - 200);
      const safeRadius = 175;
      const maxWidth = 2 * Math.sqrt(Math.max(0, safeRadius * safeRadius - offset * offset)) * 0.9;
      let size = maxSize;
      do {
        ctx.font = `bold ${size}px Georgia, "Times New Roman", serif`;
        size -= 2;
      } while (ctx.measureText(text).width > maxWidth && size > 10);
      return size + 2;
    }

    // "CAFÉ" et "CENTRAL" — blanc
    ctx.fillStyle = '#f5f0e6';
    const size1 = fitText(line1, 140, 60);
    ctx.font = `bold ${size1}px Georgia, "Times New Roman", serif`;
    ctx.fillText(line1, 200, 140);

    const size2 = fitText(line2, 195, 50);
    ctx.font = `bold ${size2}px Georgia, "Times New Roman", serif`;
    ctx.fillText(line2, 200, 195);

    // Sous-titre — jaune, plus petit
    ctx.fillStyle = '#ffcc33';
    const size3 = fitText(subtitle, 250, 26);
    ctx.font = `${size3}px Georgia, "Times New Roman", serif`;
    ctx.fillText(subtitle, 200, 250);

    const texture = new THREE.CanvasTexture(canvas);
    const textPlane = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.9, 48),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    );
    textPlane.position.set(x, y, z + 0.008);
    facade.add(textPlane);
  }

    // --- Petit texte "CAFÉ" doré, encadré d'un cercle, appliqué sur une vitrine latérale ---
  function createFacadeGlassText(x, y, z, text, fontSize, width) {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xb8843f, roughness: 0.3, metalness: 0.7 });
    const ringRadius = width * 0.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, ringRadius * 0.03, 10, 40), goldMat);
    ring.position.set(x, y, z);
    facade.add(ring);

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 110;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d8b878';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4;
    ctx.font = `bold ${fontSize}px Georgia, "Times New Roman", serif`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * (canvas.height / canvas.width)),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    );
    plane.position.set(x, y, z + 0.005);
    facade.add(plane);
  }

  // Centre vertical exact du vitrage (identique pour les 3 fenêtres)
  const glassCenterY = baseHeight + (facadeHeight - baseHeight - 0.8) / 2;

        createFacadeLogoCircle(xWinC, glassCenterY, 0.03, 0.45, 'CAFÉ', 'CENTRAL', 'TAPAS & CAFELITOS');
  createFacadeGlassText(xWinL, glassCenterY, 0.03, 'CAFÉ', 44, 1.0);
  createFacadeGlassText(xWinR, glassCenterY, 0.03, 'CAFÉ', 44, 1.0);

  // --- Enseignes lumineuses (plaque sombre + cadre LED jaune + texte rétroéclairé) ---
        function createFacadeSign(x, text, width = 1.9, height = 0.42, zPos = 0.14, lightMult = 1) {
    const signWidth = width;
    const signHeight = height;
    const sign = new THREE.Group();

    // Plaque de fond sombre
    const plaqueMat = new THREE.MeshStandardMaterial({ color: 0x0d1a12, roughness: 0.6 });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(signWidth, signHeight, 0.06), plaqueMat);
    sign.add(plaque);

    // Cadre jaune lumineux tout autour de la plaque
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xffe066, emissive: 0xffcc33, emissiveIntensity: 1.8, roughness: 0.4
    });
    const ft = 0.035;
    const fd = 0.04;
    const hBar = new THREE.BoxGeometry(signWidth, ft, fd);
    const vBar = new THREE.BoxGeometry(ft, signHeight - ft * 2, fd);

    const top = new THREE.Mesh(hBar, frameMat);
    top.position.set(0, signHeight / 2 - ft / 2, 0.05);
    sign.add(top);

    const bottom = new THREE.Mesh(hBar, frameMat);
    bottom.position.set(0, -(signHeight / 2 - ft / 2), 0.05);
    sign.add(bottom);

    const left = new THREE.Mesh(vBar, frameMat);
    left.position.set(-(signWidth / 2 - ft / 2), 0, 0.05);
    sign.add(left);

    const right = new THREE.Mesh(vBar, frameMat);
    right.position.set(signWidth / 2 - ft / 2, 0, 0.05);
    sign.add(right);

        // Canvas dimensionné selon le VRAI format de la plaque (signWidth/signHeight),
    // pas une taille fixe — le texte remplit maintenant chaque plaque dans les mêmes
    // proportions, petite ou grande.
    const canvas = document.createElement('canvas');
    canvas.height = 200;
    canvas.width = Math.round(200 * (signWidth / signHeight));
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let fontSize = 150;
    do {
      ctx.font = `bold ${fontSize}px Georgia, "Times New Roman", serif`;
      fontSize -= 2;
    } while (ctx.measureText(text).width > canvas.width * 0.88 && fontSize > 20);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.shadowColor = '#ffcc33';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#ffe680';
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 10;
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#fffbe6';
    ctx.fillText(text, cx, cy);

    const texture = new THREE.CanvasTexture(canvas);
    const textW = signWidth * 0.9;
    const textH = signHeight * 0.9;
    const textPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(textW, textH),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    );
    textPlane.position.set(0, 0, 0.07);
    sign.add(textPlane);

    sign.position.set(x, 3.0, zPos);
    facade.add(sign);
  }

  createFacadeSign(xDoorL, 'CAFÉ', 1.9, 0.42, -0.3);
  createFacadeSign(-2.025, 'CENTRAL', 3.95, 0.55);
  createFacadeSign(2.025, 'TAPAS', 3.95, 0.55);
  createFacadeSign(xDoorR, 'CAFELITOS', 1.9, 0.42, -0.1);

  facade.position.set(facadeX, 0, facadeZ);
  facade.rotation.y = THREE.MathUtils.degToRad(facadeRotationDeg);
  scene.add(facade);
}

/* =========================================================
   PROJECTEUR EXTÉRIEUR SUR PIED — mât + base + tête orientable
   qui éclaire le bâtiment depuis un point haut et éloigné
   ========================================================= */

function createFloodlight(x, y, z, targetX, targetY, targetZ) {
  // ===== PARAMÈTRES RÉGLABLES =====
  const housingLength = 1.7;        // longueur du projecteur
  const housingRadius = 0.42;       // épaisseur du projecteur
   const lightIntensity = 3000;      // puissance de la lumière (à fond)
  const beamAngleDeg = 9;           // largeur du faisceau visible
  const beamOpacityInner = 0.4;     // opacité du cœur du faisceau (à fond)
  const beamOpacityOuter = 0.18;    // opacité du halo extérieur (à fond)
  const beamLengthRatio = 0.8;      // longueur visible du faisceau / distance réelle jusqu'à la cible
  // ================================

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.4, metalness: 0.7 });

  const head = new THREE.Group();

  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(housingRadius * 0.87, housingRadius, housingLength, 16),
    metalMat
  );
  housing.rotation.x = -Math.PI / 2;
  housing.castShadow = true;
  head.add(housing);

    const lens = new THREE.Mesh(
    new THREE.CircleGeometry(housingRadius * 0.8, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 5 })
  );
  lens.position.z = -housingLength / 2;
  head.add(lens);

  const yoke = new THREE.Mesh(new THREE.TorusGeometry(housingRadius * 1.05, 0.045, 8, 16, Math.PI), metalMat);
  yoke.rotation.y = Math.PI / 2;
  head.add(yoke);

  head.position.set(x, y, z);
  head.lookAt(targetX, targetY, targetZ);
  scene.add(head);

  // --- Faisceau visible : 2 cônes imbriqués (halo + cœur) pour un effet diffus ---
  const dx = targetX - x, dy = targetY - y, dz = targetZ - z;
  const fullDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const beamLength = fullDist * beamLengthRatio;

  function addBeamCone(angleDeg, opacity) {
    const radius = beamLength * Math.tan(THREE.MathUtils.degToRad(angleDeg));
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(radius, beamLength, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = -beamLength / 2;
    return cone;
  }

  const beamGroup = new THREE.Group();
  beamGroup.add(addBeamCone(beamAngleDeg, beamOpacityOuter));
  beamGroup.add(addBeamCone(beamAngleDeg * 0.45, beamOpacityInner));
  beamGroup.position.set(x, y, z);
  beamGroup.lookAt(targetX, targetY, targetZ);
  scene.add(beamGroup);

  // Vraie lumière — blanc pur et neutre
  const spot = new THREE.SpotLight(0xffffff, lightIntensity, 40, THREE.MathUtils.degToRad(beamAngleDeg + 8), 0.3, 1.5);
  spot.position.set(x, y, z);
  spot.target.position.set(targetX, targetY, targetZ);
  spot.castShadow = true;
    spot.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  scene.add(spot);
  scene.add(spot.target);
}

/* =========================================================
   7. CONSTRUCTION DE LA SCÈNE
   ========================================================= */

// ---------------------------------------------------------
// TABLE RONDE À GAUCHE
// ---------------------------------------------------------

createTable(-1.8, 4.5);

createChair(
  -1.8,
  5,
  Math.PI,
  0xb0263a
); // chaise rouge

createChair(
  -1.8,
  4,
  0,
  0x777777
); // chaise grise

createPendantLight(-1.8, 4.5);

// ---------------------------------------------------------
// TABLE CARRÉE À GAUCHE
// ---------------------------------------------------------

createSquareTable(-3.2, 2.5);


// ---------------------------------------------------------
// TABLE CARRÉE À DROITE
// ---------------------------------------------------------

createSquareTable(3.2, 2.5);


// ---------------------------------------------------------
// TABLE RONDE À DROITE
// ---------------------------------------------------------

createTable(1.8, 4.5);

createChair(
  1.8,
  5,
  Math.PI,
  0xb0263a
); // chaise rouge

createChair(
  1.8,
  4,
  0,
  0x777777
); // chaise grise

createPendantLight(1.8, 4.5);


// ---------------------------------------------------------
// DÉCORATION
// ---------------------------------------------------------

createPlant(4.3, -2.2);


// ---------------------------------------------------------
// PLAFOND
// ---------------------------------------------------------


createLatticeCeiling(3.2, 1.5, 7.2, 0.5, 90, 0.01);   // côté droit
createLatticeCeiling(-4.72, 1.5, 7.2, 0.5, 90, -0.01); // côté gauche
createCeilingFanLight(2.82, 2.5);  // ventilateur droite
createCeilingFanLight(-3.72, 2.5); // ventilateur gauche
// ---------------------------------------------------------
// BAR
// ---------------------------------------------------------
/* =========================================================
   11. LAMPES DU BAR — 3 LAMPES SUSPENDUES
   ========================================================= */

function createBarPendantLight(x, z) {

  // Fil
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.65, 8),
    new THREE.MeshStandardMaterial({
      color: 0x111111
    })
  );

  cord.position.set(x, 2.65, z);
  scene.add(cord);

  // Abat-jour
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 0.35, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xc47a35,
      roughness: 0.45,
      metalness: 0.25
    })
  );

  shade.position.set(x, 2.35, z);
  scene.add(shade);

  // Ampoule
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffdca8,
      emissive: 0xff9d42,
      emissiveIntensity: 1.5
    })
  );

  bulb.position.set(x, 2.28, z);
  scene.add(bulb);

    // Lumière
  const light = new THREE.PointLight(
    0xffaa55,
    25 * roomLightScale,
    5,
    2
  );

    light.position.set(x, 2.28, z);
  light.castShadow = true;

  scene.add(light);
}

/* =========================================================
   GRANDE LAMPE-VENTILATEUR — pales en bois marron, globe blanc
   ========================================================= */

function createCeilingFanLight(x, z) {
  const fan = new THREE.Group();

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.75 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.55, metalness: 0.05 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xfff8ec, emissive: 0xfff2d8, emissiveIntensity: 0.9, roughness: 0.3, transparent: true, opacity: 0.9
  });

  // Tige de fixation au plafond
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.15, 8), metalMat);
  rod.position.y = -0.075;
  fan.add(rod);

  // Moteur central
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 16), metalMat);
  motor.position.y = -0.22;
  motor.castShadow = true;
  fan.add(motor);

  // 4 pales en bois marron, légèrement inclinées
  const bladeLength = 0.75;
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeLength, 0.025, 0.22), woodMat);
    blade.position.set(bladeLength / 2 + 0.13, -0.26, 0);
    blade.rotation.z = THREE.MathUtils.degToRad(-4);
    blade.castShadow = true;

    const pivot = new THREE.Group();
    pivot.add(blade);
    pivot.rotation.y = (Math.PI * 2 / 4) * i;
    fan.add(pivot);
  }

  // Tige jusqu'à la lampe
  const lightStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), metalMat);
  lightStem.position.y = -0.35;
  fan.add(lightStem);

  // Globe blanc
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), glassMat);
  globe.position.y = -0.49;
  fan.add(globe);

    // Lumière blanche
  const fanLight = new THREE.PointLight(0xfff2d8, 20 * roomLightScale, 7, 2);
  fanLight.position.y = -0.49;
  fanLight.castShadow = true;
  fan.add(fanLight);

  fan.position.set(x, 2.95, z);
  scene.add(fan);
}

/* =========================================================
   13. CHAISE HAUTE DE BAR
   ========================================================= */

function createBarStool(x, z) {

  const stool = new THREE.Group();

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x242424,
    roughness: 0.3,
    metalness: 0.8
  });

  const seatMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b3f25,
    roughness: 0.45,
    metalness: 0.1
  });


  // Assise
  const seat = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.28,
      0.28,
      0.10,
      24
    ),
    seatMaterial
  );

  seat.position.y = 0.95;
  seat.castShadow = true;

  stool.add(seat);


  // Pied central
  const centralLeg = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.055,
      0.08,
      0.88,
      16
    ),
    metalMaterial
  );

  centralLeg.position.y = 0.50;
  centralLeg.castShadow = true;

  stool.add(centralLeg);


  // Base
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.32,
      0.32,
      0.05,
      24
    ),
    metalMaterial
  );

  base.position.y = 0.05;
  base.castShadow = true;

  stool.add(base);


  // Repose-pieds
  const footRest = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.22,
      0.025,
      8,
      24
    ),
    metalMaterial
  );

  footRest.rotation.x = Math.PI / 2;
  footRest.position.y = 0.38;

  stool.add(footRest);


  stool.position.set(x, 0, z);

  scene.add(stool);
}
createBar(0, -1.2);
// =========================================================
// 3 LAMPES AU MILIEU DU BAR
// =========================================================

createBarPendantLight(-1.8, -0.65);
createBarPendantLight(0, -0.65);
createBarPendantLight(1.8, -0.65);


// =========================================================
// MEUBLE À BOUTEILLES DANS LE CORNER
// =========================================================

createCornerGlassRack(
  5.3,    // position X
  2.0,    // position Y (hauteur)
  -1.9,   // position Z
  -45,    // rotation (degrés) — suit l'angle du corner
  2.2,    // longueur du porte-verres
  0.4     // hauteur de l'étagère au-dessus du porte-verres
);
// Porte-verres + bouteilles du corner gauche — miroir exact du corner droit
createCornerGlassRack(
  -5.3,   // position X (miroir de 5.3)
  2.0,    // position Y — identique
  -1.9,   // position Z — identique
  45,     // rotation (miroir de -45)
  2.2,    // longueur — identique
  0.4     // hauteur d'étagère — identique
);

// =========================================================
// CHAISES HAUTES DEVANT LE BAR
// =========================================================

createBarStool(-3.0, -0.4);
createBarStool(-1.5, -0.4);
createBarStool(0, -0.4);
// Mur droit : positionné après l'extrémité du corner (pas au niveau du pilier), incliné 10°
createDividerWall(6.9, -3.4, 6.1, 0.2, 10);

// Mur gauche : droit (0°), décalé plus loin vers l'extérieur ; le couloir reste
// ouvert entre le mur du fond (z=-3) et z=0.6
createDividerWall(-7.8, -3.3, 6.1, 0.35, 0);

// Connecteur droit : referme l'écart entre le mur incliné (bout réel ≈7.72, 6.03) et le poteau reculé de la façade (6.9, 6.0)
const rightConnector = new THREE.Mesh(
  new THREE.BoxGeometry(0.85, 3.4, 0.2),
  new THREE.MeshStandardMaterial({ map: createWallTexture(0x61201c), roughness: 0.9 })
);
rightConnector.position.set(7.32, 1.7, 6.0);
rightConnector.castShadow = true;
rightConnector.receiveShadow = true;
scene.add(rightConnector);

// Connecteur gauche : referme l'écart entre le mur gauche (-7.8, 6.1) et son poteau reculé (-7, 6.0)
const leftConnector = new THREE.Mesh(
  new THREE.BoxGeometry(0.85, 3.4, 0.35),
  new THREE.MeshStandardMaterial({ map: createWallTexture(0x61201c), roughness: 0.9 })
);
leftConnector.position.set(-7.4, 1.7, 6.05);
leftConnector.castShadow = true;
leftConnector.receiveShadow = true;
scene.add(leftConnector);

createBarStool(1.5, -0.4);
createBarStool(3.0, -0.4);
createBarStool(5.98, -1.68); // tabouret corner droit, côté façade
createBarStool(5.5, -0.99); // tabouret corner droit, côté salle
createSpotLights();
// Fil LED blanc tout autour de la façade du bar : segment principal + les 2 corners
// (coordonnées corrigées pour tenir compte du décalage z=-1.2 de createBar(0, -1.2))
createLedStrip(0, 1.28, -0.5, 9, 90);        // façade principale
createLedStrip(4.90, 1.15, -1.7, 2.85, -45);   // corner droit
createLedStrip(-4.90, 1.15, -1.7, 2.85, 45);   // corner gauche
createLoungeTV(6.5, 1.9, 3.2, 1.8, 1.05, 10);
createCafeFacade();

// ---------------------------------------------------------
// TOIT — referme le dessus du bâtiment (murs + façade)
// ---------------------------------------------------------
const roof = new THREE.Mesh(
  new THREE.BoxGeometry(15.4, 0.15, 10.2),
  new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9, metalness: 0.02 })
);
roof.position.set(-0.24, 3.48, 1.9); // centré sur l'empreinte réelle du bâtiment (murs + façade)
roof.castShadow = true;
roof.receiveShadow = true;
scene.add(roof);


// ---------------------------------------------------------
// CAMÉRA
// ---------------------------------------------------------

const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.06;

controls.target.set(0, 1.5, 1.9);

controls.minDistance = 2.5;
controls.maxDistance = 32;

controls.maxPolarAngle = Math.PI / 2 + 0.1;

controls.update();

/* =========================================================
   ENTRÉE DANS L'EXPÉRIENCE 3D
   ========================================================= */

const heroEl = document.getElementById('hero');
const journeySpacerEl = document.getElementById('journey-spacer');

// 3 étapes du parcours : départ (vue d'ensemble) -> entrée dans la salle (vers le bar) -> arrivée près de la façade
// Reliées par une vraie courbe (au lieu de 2 lignes droites bout à bout), pour
// que la caméra tourne en douceur au niveau du bar plutôt que de changer
// brusquement de direction.
const journeyStartPos = new THREE.Vector3(0, 5, 22);
const journeyStartTarget = new THREE.Vector3(0, 1.5, 1.9);

const journeyPositionCurve = new THREE.CatmullRomCurve3([
  journeyStartPos,
  new THREE.Vector3(0, 2.6, 6.4),  // reculée mais RESTE à l'intérieur (avant la façade à z=6.8)
  new THREE.Vector3(0, 2.0, 10),
]);
const journeyTargetCurve = new THREE.CatmullRomCurve3([
  journeyStartTarget,
  new THREE.Vector3(0, 1.1, -1.2),
  new THREE.Vector3(0, 1.775, 6.8), // pile la hauteur/profondeur du logo circulaire de la façade
]);

// Direction fixe (départ -> cible d'origine), utilisée pour reculer/avancer
// la caméra de départ sans changer son angle de vue
const journeyStartDir = journeyStartPos.clone().sub(journeyStartTarget).normalize();
const journeyStartBaseDistance = journeyStartPos.distanceTo(journeyStartTarget); // ≈ 20.40, la distance actuelle desktop

// Le canvas 3D ne doit plus jamais intercepter la souris/le doigt : réglé
// une seule fois au chargement, pas besoin d'y revenir à chaque frame.
controls.enabled = false;
renderer.domElement.style.pointerEvents = 'none';

// Renvoie true si la visite automatique est encore en cours (scroll dans le hero + l'espace ajouté)
function updateScrollJourney() {
  const journeyScrollHeight = heroEl.offsetHeight + journeySpacerEl.offsetHeight;
  const rawProgress = Math.min(Math.max(window.scrollY / journeyScrollHeight, 0), 1);
  if (rawProgress >= 1) return false;

  const eased = rawProgress < 0.5
    ? 4 * rawProgress * rawProgress * rawProgress
    : 1 - Math.pow(-2 * rawProgress + 2, 3) / 2;

  camera.position.copy(journeyPositionCurve.getPoint(eased));
  controls.target.copy(journeyTargetCurve.getPoint(eased));

  // Transition douce de la netteté sur les 15 derniers % du trajet (zone de
  // la façade), au lieu d'un changement d'un coup pile à la sortie/entrée
  const blendStart = 0.85;
  const resBlend = rawProgress > blendStart ? (rawProgress - blendStart) / (1 - blendStart) : 0;
  renderer.setPixelRatio(journeyPixelRatio + (fullPixelRatio - journeyPixelRatio) * resBlend);

  return true;
}

/* =========================================================
   9. ADAPTATION À LA TAILLE DE LA FENÊTRE
   ========================================================= */

// Largeur réelle du bâtiment (façade + connecteurs), avec une petite marge —
// c'est ce qui doit tenir à l'horizontale quel que soit le format d'écran
const BUILDING_HALF_WIDTH = 8;
const BASE_FOV_DEG = 50;   // FOV desktop d'origine — jamais dépassé vers le bas
const MAX_FOV_DEG = 68;    // plafond, pour ne jamais déformer la scène

function updateResponsiveScene() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;

  // FOV élargi seulement sur les formats étroits (aspect < 1.3), plafonné à MAX_FOV_DEG.
  // Sur desktop/laptop/tablette paysage (aspect >= 1.3), le FOV reste 50° pile.
    let fovDeg = BASE_FOV_DEG;
  let narrowT = 0;
  if (aspect < 1.3) {
    narrowT = Math.min(1, (1.3 - aspect) / (1.3 - 0.45));
    fovDeg = BASE_FOV_DEG + (MAX_FOV_DEG - BASE_FOV_DEG) * narrowT;
  }
  camera.fov = fovDeg;
  camera.updateProjectionMatrix();

  // Distance recalculée pour que la largeur du bâtiment tienne dans le FOV
  // horizontal réel de cet écran — jamais moins que la distance desktop d'origine
  const fovRad = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
    const requiredDistance = BUILDING_HALF_WIDTH / Math.tan(hFov / 2);
  const distance = Math.max(journeyStartBaseDistance, requiredDistance * 1.08);

  journeyStartPos.copy(journeyStartTarget).addScaledVector(journeyStartDir, distance);

    // Sur écran étroit/vertical, le FOV élargi (nécessaire pour la largeur)
  // montre aussi beaucoup plus de hauteur — dont une grande partie de sol
  // vide, puisque la caméra reste en plongée. On aplatit donc l'angle :
  // cible remontée vers le centre du bâtiment + caméra rapprochée en hauteur.
    journeyStartTarget.y = 1.5 + narrowT * 1.6; // remonte davantage la cible : coupe le vide du bas
  journeyStartPos.y = 5 - narrowT * 1.0;      // caméra qui descend moins : angle plus horizontal, moins de sol visible

  renderer.setSize(window.innerWidth, window.innerHeight);
  needsRender = true;
}
/* =========================================================
   10. BOUCLE D'ANIMATION
   ========================================================= */

let needsRender = true;
let wasInJourney = null; // pour ne changer la résolution qu'au moment où l'état bascule, pas à chaque frame

window.addEventListener('resize', updateResponsiveScene);
window.addEventListener('orientationchange', updateResponsiveScene);
updateResponsiveScene(); // appel initial, au chargement — après la déclaration de needsRender, dont cette fonction a besoin

function animate() {
  requestAnimationFrame(animate);
  const inJourney = updateScrollJourney();

    if (inJourney !== wasInJourney) {
    if (!inJourney) renderer.setPixelRatio(fullPixelRatio); // garantit la pleine netteté exacte, une fois le trajet terminé
    wasInJourney = inJourney;
  }

  if (inJourney) {
    renderer.render(scene, camera);
    needsRender = true; // garantit un dernier rendu propre dès la sortie de la visite
  } else if (needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
}

animate();