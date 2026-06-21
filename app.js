/*
 * 3D view layer (Three.js). The chess rules live in engine.js (window.Chess)
 * and the AI in ai.js (window.ChessAI); this module only renders and handles
 * input, driving those unchanged modules.
 *
 * World layout: the board spans x,z in [-3.5, 3.5]. Square (file, rank) maps to
 * world (x = file - 3.5, z = row - 3.5). Row 7 (rank 1, White's back rank) sits
 * at +z, nearest the default camera.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const { Game, colorOf, typeOf } = window.Chess;

const GLYPHS = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
};

// --- Type variant system ---
const PIECE_VARIANTS = {
  p: ['Normal', 'Fire', 'Grass'],
  n: ['Fighting', 'Water', 'Normal'],
  b: ['Psychic', 'Grass', 'Normal'],
  r: ['Rock', 'Water', 'Fire'],
  q: ['Water', 'Fire', 'Grass', 'Dragon', 'Psychic'],
  k: ['Dragon', 'Fire', 'Normal'],
};

const TYPE_COLORS = {
  Normal: 0xa8a878, Fighting: 0xc03028, Psychic: 0xd6468a,
  Rock: 0x9a7d3a, Fire: 0xe8702a, Dragon: 0x6a4ad6,
  Water: 0x6890f0, Grass: 0x78c850,
};

const DEX_ALL = [
  { piece: 'p', name: 'Pawn',   variants: ['Normal', 'Fire', 'Grass'] },
  { piece: 'n', name: 'Knight', variants: ['Fighting', 'Water', 'Normal'] },
  { piece: 'b', name: 'Bishop', variants: ['Psychic', 'Grass', 'Normal'] },
  { piece: 'r', name: 'Rook',   variants: ['Rock', 'Water', 'Fire'] },
  { piece: 'q', name: 'Queen',  variants: ['Water', 'Fire', 'Grass', 'Dragon', 'Psychic'] },
  { piece: 'k', name: 'King',   variants: ['Dragon', 'Fire', 'Normal'] },
];
const DEX_TOTAL = DEX_ALL.reduce((s, e) => s + e.variants.length, 0);

let variantBoard = new Array(64).fill(null); // elemental type variant per square
let initVariantSnap = null;                  // snapshot after new game (for undo replay)
let pokedex = new Set(JSON.parse(localStorage.getItem('chessDex') || '[]'));

function randomVariantFor(pieceType) {
  const opts = PIECE_VARIANTS[pieceType];
  return opts ? opts[Math.floor(Math.random() * opts.length)] : 'Normal';
}

function initVariants() {
  variantBoard = new Array(64).fill(null);
  for (let i = 0; i < 64; i++) {
    if (game.board[i]) variantBoard[i] = randomVariantFor(typeOf(game.board[i]));
  }
  initVariantSnap = variantBoard.slice();
}

function applyVariantMove(move) {
  if (move.enPassant) variantBoard[move.capturedSquare] = null;
  variantBoard[move.to] = variantBoard[move.from];
  variantBoard[move.from] = null;
  if (move.castle) {
    const homeRow = colorOf(move.piece) === 'w' ? 7 : 0;
    const rf = move.castle === 'K' ? homeRow * 8 + 7 : homeRow * 8 + 0;
    const rt = move.castle === 'K' ? homeRow * 8 + 5 : homeRow * 8 + 3;
    variantBoard[rt] = variantBoard[rf];
    variantBoard[rf] = null;
  }
}

function rebuildVariantsFromHistory() {
  if (!initVariantSnap) return;
  variantBoard = initVariantSnap.slice();
  for (const move of game.history) {
    if (move.battleLost) {
      variantBoard[move.from] = null;
    } else {
      if (move.enPassant) variantBoard[move.capturedSquare] = null;
      variantBoard[move.to] = variantBoard[move.from];
      variantBoard[move.from] = null;
      if (move.castle) {
        const homeRow = colorOf(move.piece) === 'w' ? 7 : 0;
        const rf = move.castle === 'K' ? homeRow * 8 + 7 : homeRow * 8 + 0;
        const rt = move.castle === 'K' ? homeRow * 8 + 5 : homeRow * 8 + 3;
        variantBoard[rt] = variantBoard[rf];
        variantBoard[rf] = null;
      }
    }
  }
}

function addToDex(pieceType, variantType) {
  if (!variantType || !pieceType) return;
  const key = pieceType + '_' + variantType;
  if (pokedex.has(key)) return;
  pokedex.add(key);
  try { localStorage.setItem('chessDex', JSON.stringify([...pokedex])); } catch (_) {}
  renderDex();
}

function renderDex() {
  const grid = document.getElementById('dexGrid');
  const countEl = document.getElementById('dexCount');
  if (!grid) return;
  if (countEl) countEl.textContent = pokedex.size + ' / ' + DEX_TOTAL;
  grid.innerHTML = '';
  for (const entry of DEX_ALL) {
    const row = document.createElement('div');
    row.className = 'dex-row';
    for (const v of entry.variants) {
      const key = entry.piece + '_' + v;
      const found = pokedex.has(key);
      const cell = document.createElement('div');
      cell.className = 'dex-entry' + (found ? ' found' : ' unknown');
      cell.title = found ? entry.name + ' — ' + v : '???';
      cell.innerHTML =
        `<span class="dex-glyph">${GLYPHS['w' + entry.piece]}</span>` +
        `<span class="dex-type type-${v.toLowerCase()}">${found ? v : '?'}</span>`;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
}

// --- Constants ---
const TILE_H = 0.1;
const PIECE_Y = TILE_H;          // pieces rest on the board surface
const MARKER_Y = TILE_H + 0.02;
// Camera framing differs by viewport: phones get a steeper, tighter angle so the
// board fills the square instead of wasting the top third on empty backdrop.
function camParams() {
  return window.innerWidth <= 720 ? { y: 7.8, z: 5.6 } : { y: 6.8, z: 7.2 };
}

// --- DOM ---
const container = document.getElementById('scene');
const statusEl = document.getElementById('status');
const moveListEl = document.getElementById('moveList');
const capturedWhiteEl = document.getElementById('capturedWhite');
const capturedBlackEl = document.getElementById('capturedBlack');
const modeEl = document.getElementById('mode');
const sideEl = document.getElementById('side');
const depthEl = document.getElementById('depth');
const sideControl = document.getElementById('sideControl');
const depthControl = document.getElementById('depthControl');
const promotionEl = document.getElementById('promotion');
const promotionChoicesEl = document.getElementById('promotionChoices');

// --- Game state ---
let game = new Game();
let selected = null;
let legalForSelected = [];
let lastMove = null;
let aiThinking = false;
let animating = false;
let inBattle = false;
let viewSide = 'w';
let customOver = null; // app-level game-over override (e.g. king exposed after a lost battle)

function effectiveStatus() {
  return customOver || game.status();
}
function battleEnabled() {
  return document.getElementById('battleMode').value === 'on';
}

// --- Three.js scene ---
const scene = new THREE.Scene();
// Transparent background so the CSS gradient on .scene shows through as a backdrop.

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, camParams().y, camParams().z);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI / 2.05; // don't dip under the board
controls.update();

// Lighting.
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.55));
const keyLight = new THREE.DirectionalLight(0xfff2e0, 1.15);
keyLight.position.set(5, 11, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 7;
keyLight.shadow.camera.bottom = -7;
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x88aaff, 0.25);
fillLight.position.set(-6, 5, -5);
scene.add(fillLight);

// --- Materials ---
const MAT = {
  light: new THREE.MeshStandardMaterial({ color: 0xe9d8b4, roughness: 0.65, metalness: 0.05 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x6b4429, roughness: 0.6, metalness: 0.05 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x2c1d12, roughness: 0.5, metalness: 0.15 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.35, metalness: 0.1 }),
  black: new THREE.MeshStandardMaterial({ color: 0x26262b, roughness: 0.4, metalness: 0.2 }),
  marker: new THREE.MeshStandardMaterial({
    color: 0x46c24a, emissive: 0x2f8a33, emissiveIntensity: 0.9,
    transparent: true, opacity: 0.85,
  }),
};

// --- Board ---
const boardGroup = new THREE.Group();
scene.add(boardGroup);
const piecesGroup = new THREE.Group();
scene.add(piecesGroup);
const markerGroup = new THREE.Group();
scene.add(markerGroup);

const tiles = new Array(64);

function buildBoard() {
  // Frame underneath.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 9), MAT.frame);
  frame.position.y = -0.175;
  frame.receiveShadow = true;
  boardGroup.add(frame);

  // Beveled inner lip.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.12, 8.4), MAT.frame);
  lip.position.y = 0.005;
  lip.receiveShadow = true;
  boardGroup.add(lip);

  const tileGeo = new THREE.BoxGeometry(1, TILE_H, 1);
  for (let index = 0; index < 64; index++) {
    const row = Math.floor(index / 8);
    const col = index % 8;
    const isLight = (row + col) % 2 === 0;
    // Per-tile material clone so we can highlight individually.
    const mat = (isLight ? MAT.light : MAT.dark).clone();
    const tile = new THREE.Mesh(tileGeo, mat);
    const { x, z } = squareToWorld(index);
    tile.position.set(x, TILE_H / 2, z);
    tile.receiveShadow = true;
    tile.userData.index = index;
    tile.userData.base = mat.color.clone();
    boardGroup.add(tile);
    tiles[index] = tile;
  }
}

function squareToWorld(index) {
  return { x: (index % 8) - 3.5, z: Math.floor(index / 8) - 3.5 };
}
function worldOf(index, y = PIECE_Y) {
  const { x, z } = squareToWorld(index);
  return new THREE.Vector3(x, y, z);
}

// --- Piece geometry builders (turned/stacked primitives) ---
function cyl(rt, rb, h, y, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 28), mat);
  m.position.y = y;
  return m;
}
function sph(r, y, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
  m.position.y = y;
  return m;
}
function box(w, h, d, y, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y;
  return m;
}

function makeBase(mat) {
  const g = new THREE.Group();
  g.add(cyl(0.30, 0.34, 0.12, 0.06, mat));
  g.add(cyl(0.33, 0.30, 0.04, 0.14, mat));
  return g;
}

function knightHead(mat) {
  // Horse-head silhouette in the x-y plane, extruded along z.
  const pts = [
    [-0.30, 0.00], [0.30, 0.00], [0.33, 0.10], [0.18, 0.18],
    [0.30, 0.34], [0.40, 0.40], [0.42, 0.50], [0.30, 0.54],
    [0.20, 0.56], [0.10, 0.66], [0.06, 0.82], [-0.02, 0.66],
    [-0.10, 0.80], [-0.18, 0.62], [-0.14, 0.46], [-0.22, 0.40],
    [-0.16, 0.28], [-0.26, 0.20], [-0.24, 0.08],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.34, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2,
  });
  geo.translate(0, 0, -0.20); // center the thickness on z
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.12;
  return mesh;
}

function makePiece(type, color) {
  const mat = color === 'w' ? MAT.white : MAT.black;
  const g = new THREE.Group();
  g.add(makeBase(mat));

  if (type === 'p') {
    g.add(cyl(0.10, 0.20, 0.20, 0.24, mat));
    g.add(sph(0.17, 0.46, mat));
  } else if (type === 'r') {
    g.add(cyl(0.17, 0.24, 0.34, 0.31, mat));
    g.add(cyl(0.25, 0.20, 0.10, 0.53, mat));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = box(0.08, 0.12, 0.08, 0.60, mat);
      b.position.x = Math.cos(a) * 0.18;
      b.position.z = Math.sin(a) * 0.18;
      g.add(b);
    }
  } else if (type === 'n') {
    g.add(knightHead(mat));
    if (color === 'b') g.rotation.y = Math.PI; // knights face each other
  } else if (type === 'b') {
    g.add(cyl(0.09, 0.24, 0.44, 0.36, mat));
    g.add(cyl(0.16, 0.10, 0.06, 0.60, mat));
    g.add(sph(0.14, 0.68, mat));
    g.add(sph(0.05, 0.82, mat));
  } else if (type === 'q') {
    g.add(cyl(0.11, 0.26, 0.50, 0.39, mat));
    g.add(cyl(0.20, 0.12, 0.10, 0.69, mat));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = sph(0.05, 0.80, mat);
      s.position.x = Math.cos(a) * 0.17;
      s.position.z = Math.sin(a) * 0.17;
      g.add(s);
    }
    g.add(sph(0.08, 0.84, mat));
  } else if (type === 'k') {
    g.add(cyl(0.11, 0.26, 0.54, 0.41, mat));
    g.add(cyl(0.20, 0.13, 0.10, 0.73, mat));
    g.add(box(0.05, 0.22, 0.05, 0.92, mat));
    g.add(box(0.15, 0.05, 0.05, 0.89, mat));
  }

  g.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  return g;
}

// --- Piece bookkeeping ---
const meshAt = new Map(); // square index -> piece Group

function disposeMesh(group) {
  group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  piecesGroup.remove(group);
}

function resetPieces() {
  for (const g of meshAt.values()) disposeMesh(g);
  meshAt.clear();
  for (let i = 0; i < 64; i++) {
    const piece = game.board[i];
    if (!piece) continue;
    addPieceMesh(i, typeOf(piece), colorOf(piece));
  }
}

function addVariantRing(mesh, variantType) {
  const color = TYPE_COLORS[variantType];
  if (!color) return;
  const geo = new THREE.TorusGeometry(0.31, 0.04, 8, 32);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: new THREE.Color(color), emissiveIntensity: 0.55,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.01; // just above board surface, relative to piece group
  mesh.add(ring);          // child of piece — moves and scales with it automatically
}

function addPieceMesh(index, type, color) {
  const g = makePiece(type, color);
  g.position.copy(worldOf(index));
  if (variantBoard[index]) addVariantRing(g, variantBoard[index]);
  piecesGroup.add(g);
  meshAt.set(index, g);
  return g;
}

// --- Tween manager ---
const tweens = [];
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function animate(duration, onUpdate) {
  return new Promise((resolve) => {
    tweens.push({ duration, elapsed: 0, onUpdate, onComplete: resolve });
  });
}

// --- Move animation ---
function animateMove(move) {
  animating = true;
  const color = colorOf(move.piece);
  const moving = meshAt.get(move.from);
  meshAt.delete(move.from);

  // Captured piece (normal or en passant).
  let capMesh = null;
  if (move.enPassant) {
    capMesh = meshAt.get(move.capturedSquare);
    meshAt.delete(move.capturedSquare);
  } else if (move.captured) {
    capMesh = meshAt.get(move.to);
    meshAt.delete(move.to);
  }
  if (capMesh) {
    animate(260, (t) => {
      const s = 1 - easeInOut(t);
      capMesh.scale.setScalar(Math.max(0.001, s));
      capMesh.position.y = PIECE_Y + easeInOut(t) * 0.4;
    }).then(() => disposeMesh(capMesh));
  }

  const promises = [];

  // Slide (or hop, for knights) the moving piece.
  if (moving) {
    meshAt.set(move.to, moving);
    const from = worldOf(move.from);
    const to = worldOf(move.to);
    const hop = typeOf(move.piece) === 'n' ? 0.7 : 0.08;
    promises.push(animate(320, (t) => {
      const e = easeInOut(t);
      moving.position.x = from.x + (to.x - from.x) * e;
      moving.position.z = from.z + (to.z - from.z) * e;
      moving.position.y = PIECE_Y + Math.sin(t * Math.PI) * hop;
    }));
  }

  // Castling: also slide the rook.
  if (move.castle) {
    const homeRow = color === 'w' ? 7 : 0;
    const rookFrom = move.castle === 'K' ? homeRow * 8 + 7 : homeRow * 8 + 0;
    const rookTo = move.castle === 'K' ? homeRow * 8 + 5 : homeRow * 8 + 3;
    const rook = meshAt.get(rookFrom);
    if (rook) {
      meshAt.delete(rookFrom);
      meshAt.set(rookTo, rook);
      const rf = worldOf(rookFrom);
      const rt = worldOf(rookTo);
      promises.push(animate(320, (t) => {
        const e = easeInOut(t);
        rook.position.x = rf.x + (rt.x - rf.x) * e;
        rook.position.z = rf.z + (rt.z - rf.z) * e;
      }));
    }
  }

  return Promise.all(promises).then(() => {
    // Promotion: swap the pawn mesh for the promoted piece.
    if (move.promotion) {
      const old = meshAt.get(move.to);
      if (old) disposeMesh(old);
      meshAt.delete(move.to);
      addPieceMesh(move.to, typeOf(move.promotion), color);
    }
    animating = false;
  });
}

// --- Highlights & markers ---
function clearMarkers() {
  while (markerGroup.children.length) {
    const m = markerGroup.children.pop();
    m.geometry.dispose();
  }
}

function showMarkers() {
  clearMarkers();
  for (const m of legalForSelected) {
    const isCapture = game.board[m.to] || m.enPassant;
    const geo = isCapture
      ? new THREE.TorusGeometry(0.36, 0.05, 12, 24)
      : new THREE.CylinderGeometry(0.15, 0.15, 0.035, 22);
    const mesh = new THREE.Mesh(geo, MAT.marker);
    const { x, z } = squareToWorld(m.to);
    mesh.position.set(x, MARKER_Y, z);
    if (isCapture) mesh.rotation.x = Math.PI / 2;
    markerGroup.add(mesh);
  }
}

function refreshHighlights(st) {
  for (let i = 0; i < 64; i++) {
    const tile = tiles[i];
    tile.material.color.copy(tile.userData.base);
    tile.material.emissive.setHex(0x000000);
    tile.material.emissiveIntensity = 0;
  }
  const set = (i, hex, intensity) => {
    if (i < 0) return;
    tiles[i].material.emissive.setHex(hex);
    tiles[i].material.emissiveIntensity = intensity;
  };
  if (lastMove) {
    set(lastMove.from, 0xb9a93a, 0.5);
    set(lastMove.to, 0xb9a93a, 0.6);
  }
  if (st && !st.over && st.check) set(findKing(game.turn), 0xd83a3a, 0.85);
  if (selected !== null) set(selected, 0x46c24a, 0.7);
}

function findKing(color) {
  const target = color + 'k';
  for (let i = 0; i < 64; i++) if (game.board[i] === target) return i;
  return -1;
}

// --- UI panel ---
function refreshUI() {
  const st = effectiveStatus();
  refreshHighlights(st);
  updateStatus(st);
  renderMoves();
  renderCaptured();
}

function updateStatus(st) {
  if (st.over) {
    statusEl.textContent = st.reason;
    statusEl.classList.add('game-over');
    return;
  }
  statusEl.classList.remove('game-over');
  if (aiThinking) { statusEl.textContent = 'Computer is thinking…'; return; }
  const mover = game.turn === 'w' ? 'White' : 'Black';
  statusEl.textContent = mover + ' to move' + (st.check ? ' — check' : '');
}

function renderMoves() {
  moveListEl.innerHTML = '';
  const hist = game.history;
  for (let i = 0; i < hist.length; i += 2) {
    const li = document.createElement('li');
    const white = hist[i] ? hist[i].san : '';
    const black = hist[i + 1] ? hist[i + 1].san : '';
    li.innerHTML = `<span class="mv">${white}</span><span class="mv">${black}</span>`;
    moveListEl.appendChild(li);
  }
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

function renderCaptured() {
  const byWhite = [];
  const byBlack = [];
  for (const m of game.history) {
    if (!m.captured) continue;
    if (colorOf(m.captured) === 'b') byWhite.push(m.captured);
    else byBlack.push(m.captured);
  }
  const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
  const sortFn = (a, b) => order[typeOf(a)] - order[typeOf(b)];
  byWhite.sort(sortFn);
  byBlack.sort(sortFn);
  capturedWhiteEl.textContent = byWhite.map((p) => GLYPHS[p]).join(' ');
  capturedBlackEl.textContent = byBlack.map((p) => GLYPHS[p]).join(' ');
}

// --- Input ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  downPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved < 6) handlePick(e);
});

function handlePick(event) {
  const st = effectiveStatus();
  if (st.over || aiThinking || animating || inBattle) return;
  if (isAImode() && game.turn === aiColor()) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([boardGroup, piecesGroup], true);
  if (!hits.length) return;

  const p = hits[0].point;
  const col = Math.round(p.x + 3.5);
  const row = Math.round(p.z + 3.5);
  if (col < 0 || col > 7 || row < 0 || row > 7) return;
  onSquareClick(row * 8 + col);
}

function onSquareClick(index) {
  const piece = game.board[index];
  const move = selected !== null && legalForSelected.find((m) => m.to === index);
  if (move) { handleMove(move); return; }

  if (piece && colorOf(piece) === game.turn) {
    selected = index;
    legalForSelected = game.legalMovesFrom(index);
    showMarkers();
  } else {
    selected = null;
    legalForSelected = [];
    clearMarkers();
  }
  refreshHighlights(effectiveStatus());
}

function handleMove(move) {
  if (move.promotion) {
    const variants = legalForSelected.filter((m) => m.to === move.to && m.promotion);
    askPromotion(colorOf(move.piece), (choice) => {
      playMove(variants.find((m) => typeOf(m.promotion) === choice));
    });
    return;
  }
  playMove(move);
}

// Central entry point for any chosen move (human- or AI-initiated).
function playMove(move) {
  selected = null;
  legalForSelected = [];
  clearMarkers();
  refreshHighlights(effectiveStatus());

  const isCapture = !!(move.captured || move.enPassant);
  if (battleEnabled() && isCapture) {
    animateBattleCharge(move).then(() => {
      runBattle(move).then((attackerWon) => {
        if (attackerWon) resolveWin(move);
        else resolveLoss(move);
      });
    });
  } else {
    resolveWin(move);
  }
}

function isHumanCombatant(color) {
  if (isAImode()) return color === humanColor();
  return true; // two-player: both sides are at the keyboard
}

function runBattle(move) {
  inBattle = true;
  aiThinking = false;
  statusEl.textContent = 'Battle!';
  const attackerColor = colorOf(move.piece);
  const defenderPiece = move.captured;
  const defSquare = move.enPassant ? move.capturedSquare : move.to;
  return window.ChessBattle.run({
    attacker: { color: attackerColor, type: typeOf(move.piece), variant: variantBoard[move.from] },
    defender: { color: colorOf(defenderPiece), type: typeOf(defenderPiece), variant: variantBoard[defSquare] },
    attackerHuman: isHumanCombatant(attackerColor),
    defenderHuman: isHumanCombatant(colorOf(defenderPiece)),
  }).then((won) => { inBattle = false; return won; });
}

// Attacker won the battle: the capture proceeds as a normal move.
function resolveWin(move) {
  const defSquare = move.enPassant ? move.capturedSquare : move.to;
  if (move.captured) addToDex(typeOf(move.captured), variantBoard[defSquare]);
  applyVariantMove(move);
  game.makeMove(move);
  lastMove = { from: move.from, to: move.to };
  animateMove(move).then(afterMove);
}

// Attacker lost the battle: the capturing piece is destroyed; the move fails.
function resolveLoss(move) {
  variantBoard[move.from] = null; // attacker's variant is lost
  game.makeFailedCapture(move);
  lastMove = { from: move.from, to: move.to };
  animateFailedCapture(move).then(afterMove);
}

function afterMove() {
  const mover = game.turn === 'w' ? 'b' : 'w';
  const hist = game.history[game.history.length - 1];
  if (hist && hist.kingFell) {
    customOver = {
      over: true,
      result: game.turn,
      reason: (mover === 'w' ? 'White' : 'Black') + "'s king fell in battle",
    };
  } else if (game.inCheck(mover)) {
    customOver = {
      over: true,
      result: game.turn,
      reason: (mover === 'w' ? 'White' : 'Black') + "'s king fell — exposed after a lost battle",
    };
  }
  refreshUI();
  const st = effectiveStatus();
  if (!st.over && isAImode() && game.turn === aiColor()) triggerAI();
}

function triggerAI() {
  aiThinking = true;
  updateStatus(effectiveStatus());
  setTimeout(() => {
    const depth = Number(depthEl.value);
    const move = window.ChessAI.bestMove(game, depth);
    aiThinking = false;
    if (!move) { refreshUI(); return; }
    playMove(move);
  }, 30);
}

// Pre-battle: attacker leaps toward the defender and bounces back, defender shakes on impact.
function animateBattleCharge(move) {
  animating = true;
  const attMesh = meshAt.get(move.from);
  const defSquare = move.enPassant ? move.capturedSquare : move.to;
  const defMesh = meshAt.get(defSquare);
  if (!attMesh) { animating = false; return Promise.resolve(); }

  const from = worldOf(move.from);
  const to = worldOf(move.to);
  const defPos = worldOf(defSquare);

  // Big arcing leap toward the target and back (sin arc peaks at midpoint, returns to 0).
  return animate(500, (t) => {
    const reach = Math.sin(t * Math.PI);
    attMesh.position.x = from.x + (to.x - from.x) * reach;
    attMesh.position.z = from.z + (to.z - from.z) * reach;
    attMesh.position.y = PIECE_Y + Math.sin(t * Math.PI) * 1.4;
  }).then(() => {
    attMesh.position.set(from.x, PIECE_Y, from.z);
    if (!defMesh) { animating = false; return Promise.resolve(); }
    return animate(220, (t) => {
      const shock = Math.sin(t * Math.PI * 5) * 0.08 * (1 - t);
      defMesh.position.x = defPos.x + shock;
      defMesh.position.z = defPos.z + shock;
    }).then(() => {
      defMesh.position.set(defPos.x, PIECE_Y, defPos.z);
      animating = false;
    });
  });
}

function animateFailedCapture(move) {
  animating = true;
  const mesh = meshAt.get(move.from);
  meshAt.delete(move.from);
  if (!mesh) { animating = false; return Promise.resolve(); }
  return animate(750, (t) => {
    mesh.position.y = PIECE_Y + Math.sin(t * Math.PI) * 0.5;
    mesh.rotation.y = t * Math.PI * 4;
    mesh.scale.setScalar(Math.max(0.001, 1 - easeInOut(t)));
  }).then(() => { disposeMesh(mesh); animating = false; });
}

function askPromotion(color, callback) {
  promotionChoicesEl.innerHTML = '';
  for (const t of ['q', 'r', 'b', 'n']) {
    const btn = document.createElement('button');
    btn.className = 'promo-choice';
    btn.textContent = GLYPHS[color + t];
    btn.addEventListener('click', () => {
      promotionEl.hidden = true;
      callback(t);
    });
    promotionChoicesEl.appendChild(btn);
  }
  promotionEl.hidden = false;
}

// --- View / camera ---
function setView(side, withAnim) {
  viewSide = side;
  const { y, z } = camParams();
  const target = new THREE.Vector3(0, y, side === 'w' ? z : -z);
  if (!withAnim) {
    camera.position.copy(target);
    controls.update();
    return;
  }
  const from = camera.position.clone();
  animate(600, (t) => {
    camera.position.lerpVectors(from, target, easeInOut(t));
    controls.update();
  });
}

// --- Controls wiring ---
function isAImode() { return modeEl.value === 'ai'; }
function humanColor() { return sideEl.value; }
function aiColor() { return humanColor() === 'w' ? 'b' : 'w'; }

function newGame() {
  game = new Game();
  selected = null;
  legalForSelected = [];
  lastMove = null;
  aiThinking = false;
  animating = false;
  inBattle = false;
  customOver = null;
  clearMarkers();
  initVariants();
  resetPieces();
  renderDex();
  setView(isAImode() && humanColor() === 'b' ? 'b' : 'w', false);
  refreshUI();
  if (isAImode() && game.turn === aiColor()) triggerAI();
}

document.getElementById('newGame').addEventListener('click', newGame);

document.getElementById('undo').addEventListener('click', () => {
  if (aiThinking || animating || inBattle) return;
  customOver = null;
  game.undo();
  if (isAImode() && game.history.length && game.turn === aiColor()) game.undo();
  rebuildVariantsFromHistory();
  selected = null;
  legalForSelected = [];
  clearMarkers();
  const last = game.history[game.history.length - 1];
  lastMove = last ? { from: last.from, to: last.to } : null;
  resetPieces();
  refreshUI();
});

document.getElementById('flip').addEventListener('click', () => {
  setView(viewSide === 'w' ? 'b' : 'w', true);
});

modeEl.addEventListener('change', () => {
  const ai = isAImode();
  sideControl.style.display = ai ? '' : 'none';
  depthControl.style.display = ai ? '' : 'none';
  newGame();
});
sideEl.addEventListener('change', newGame);

// --- Resize ---
function onResize() {
  const size = container.clientWidth;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(size, size, false);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  setView(viewSide, false); // re-frame for the new viewport (desktop vs mobile)
}
window.addEventListener('resize', onResize);

// --- Render loop ---
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = clock.getDelta() * 1000;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.elapsed += dt;
    const t = Math.min(1, tw.elapsed / tw.duration);
    tw.onUpdate(t);
    if (t >= 1) {
      tweens.splice(i, 1);
      tw.onComplete();
    }
  }
  controls.update();
  renderer.render(scene, camera);
}

// --- Init ---
function init() {
  const ai = isAImode();
  sideControl.style.display = ai ? '' : 'none';
  depthControl.style.display = ai ? '' : 'none';
  buildBoard();
  onResize();
  newGame();
  loop();
}
init();
