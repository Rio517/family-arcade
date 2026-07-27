/**
 * The three.js chess scene — a real 3D set with lathe-turned pieces, soft
 * shadows, an orbitable camera, and tweened piece moves. Framework-free: the
 * React wrapper (Chess3D) feeds it positions and marks, and receives square
 * taps back. All geometry is procedural, so nothing is downloaded and the
 * PWA stays fully offline.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FILES, RANKS, type Board, type Color, type PieceType, type Square } from '@games/chess/domain/types';
import { SCENE_PALETTES, type ScenePalette } from '../chessTheme';

const sqName = (s: Square) => `${FILES[s.col]}${8 - s.row}`;
/** Board square → world position (a1 near white; row 0 = rank 8 = -z). */
const worldPos = (s: Square) => new THREE.Vector3(s.col - 3.5, 0, s.row - 3.5);

interface Marks {
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  checkSq: Square | null;
}

interface Tween {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
  dur: number;
  arc: number;
  fade?: boolean;
  onDone?: () => void;
}

export class ChessScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private tiles: THREE.Mesh[] = [];
  private pieces = new Map<string, THREE.Group>(); // key: square name
  private templates = new Map<string, THREE.Group>(); // key: `${color}${type}`
  private markGroup = new THREE.Group();
  private checkMat: THREE.MeshBasicMaterial | null = null;
  private tweens: Tween[] = [];
  private raf = 0;
  private down: { x: number; y: number } | null = null;
  private resizeObs: ResizeObserver | null = null;
  private disposed = false;

  private palette: ScenePalette;
  private accentMat: THREE.MeshStandardMaterial | null = null;
  private glowMats: { w: THREE.MeshStandardMaterial | null; b: THREE.MeshStandardMaterial | null } = { w: null, b: null };
  private sideAccentMats: { w: THREE.MeshStandardMaterial | null; b: THREE.MeshStandardMaterial | null } = { w: null, b: null };

  constructor(
    private container: HTMLElement,
    private opts: { orientation: Color; reducedMotion: boolean; onTap: (sq: Square) => void; palette?: ScenePalette },
  ) {
    this.palette = opts.palette ?? SCENE_PALETTES.classic;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(this.palette.background);
    // Deep space keeps its fog further out so the starfield reads.
    this.scene.fog = this.palette.stars
      ? new THREE.Fog(this.palette.background, 20, 40)
      : new THREE.Fog(this.palette.background, 15, 28);
    if (this.palette.accent) {
      this.accentMat = new THREE.MeshStandardMaterial({
        color: this.palette.accent,
        roughness: 0.25,
        metalness: 0.65,
      });
    }
    for (const side of ['w', 'b'] as const) {
      const glow = side === 'w' ? this.palette.whiteGlow : this.palette.blackGlow;
      if (glow) {
        this.glowMats[side] = new THREE.MeshStandardMaterial({
          color: glow,
          emissive: glow,
          emissiveIntensity: 2.0,
          roughness: 0.4,
        });
      }
      const acc = side === 'w' ? this.palette.whiteAccent : this.palette.blackAccent;
      if (acc) {
        this.sideAccentMats[side] = new THREE.MeshStandardMaterial({ color: acc, roughness: 0.3, metalness: 0.4 });
      }
    }

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
    const zSide = opts.orientation === 'w' ? 1 : -1;
    this.camera.position.set(0, 6.4, 9.0 * zSide);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = !opts.reducedMotion;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 17;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minPolarAngle = 0.12;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.buildLights();
    this.buildBoard();
    if (this.palette.stars) this.buildStars();
    this.scene.add(this.markGroup);

    // Tap vs orbit: only fire a tap when the pointer barely moved.
    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer.domElement.addEventListener('pointerup', this.onUp);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop(performance.now());
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#cfe0ff', '#1a1408', 0.55));
    const key = new THREE.DirectionalLight('#fff2dd', 2.2);
    key.position.set(5, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#4aa8ff', 0.5);
    rim.position.set(-6, 4, -6);
    this.scene.add(rim);
  }

  private buildBoard() {
    const lightSq = new THREE.MeshStandardMaterial({ color: this.palette.tileLight, roughness: 0.42 });
    const darkSq = new THREE.MeshStandardMaterial({ color: this.palette.tileDark, roughness: 0.48 });
    const tileG = new THREE.BoxGeometry(1, 0.12, 1);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const t = new THREE.Mesh(tileG, (r + c) % 2 ? darkSq : lightSq);
        t.position.set(c - 3.5, -0.06, r - 3.5);
        t.receiveShadow = true;
        t.name = sqName({ row: r, col: c });
        this.tiles.push(t);
        this.scene.add(t);
      }
    }
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(9.0, 0.34, 9.0),
      new THREE.MeshStandardMaterial({ color: this.palette.frame, roughness: 0.3, metalness: 0.25 }),
    );
    frame.position.y = -0.24;
    frame.receiveShadow = true;
    this.scene.add(frame);
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(9.06, 0.05, 9.06),
      new THREE.MeshStandardMaterial({
        color: this.palette.edge,
        emissive: this.palette.edge,
        emissiveIntensity: this.palette.edgeEmissive ?? 1.4,
        metalness: (this.palette.edgeEmissive ?? 1.4) < 1 ? 0.7 : 0, // dim rim = polished brass
      }),
    );
    edge.position.y = -0.075;
    this.scene.add(edge);
  }

  /** A still starfield around the deep-space board (seeded, so tests are stable). */
  private buildStars() {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pts: number[] = [];
    for (let i = 0; i < 220; i++) {
      const r = 13 + rand() * 9;
      const az = rand() * Math.PI * 2;
      const el = rand() * 1.25 - 0.1; // mostly above the horizon
      pts.push(r * Math.cos(el) * Math.cos(az), r * Math.sin(el), r * Math.cos(el) * Math.sin(az));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: '#dce8ff', size: 0.09, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false, fog: false,
    }));
    this.scene.add(stars);
  }

  // ── Procedural pieces (lathe-turned; knight is an extruded silhouette) ──
  private material(color: Color) {
    return new THREE.MeshStandardMaterial({
      color: color === 'w' ? this.palette.whitePiece : this.palette.blackPiece,
      roughness: this.palette.pieceRoughness,
      metalness: this.palette.pieceStyle === 'ships' ? 0.5 : color === 'b' && !this.palette.accent ? 0.12 : 0.05,
    });
  }

  private template(type: PieceType, color: Color): THREE.Group {
    const key = `${color}${type}`;
    let tpl = this.templates.get(key);
    if (!tpl) {
      tpl = buildPiece(
        type,
        this.material(color),
        color === 'b',
        this.palette.pieceStyle,
        this.sideAccentMats[color] ?? this.accentMat ?? undefined,
        this.glowMats[color] ?? undefined,
      );
      this.templates.set(key, tpl);
    }
    const clone = tpl.clone(true);
    clone.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    return clone;
  }

  /** Sync every piece to `board`; if `move` is given, tween that piece. */
  setPosition(board: Board, move: { from: Square; to: Square } | null) {
    const wanted = new Map<string, { type: PieceType; color: Color }>();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) wanted.set(sqName({ row: r, col: c }), { type: p.type, color: p.color });
      }
    }

    // Animate the headline move when its actor is in place (castle rook, en
    // passant victim, and promotions are corrected by the sync pass below).
    if (move && !this.opts.reducedMotion) {
      const fromKey = sqName(move.from);
      const toKey = sqName(move.to);
      const actor = this.pieces.get(fromKey);
      const want = wanted.get(toKey);
      if (actor && want && actor.userData.type === want.type && actor.userData.color === want.color) {
        const victim = this.pieces.get(toKey);
        if (victim) {
          this.pieces.delete(toKey);
          this.tweens.push({ obj: victim, from: victim.position.clone(), to: victim.position.clone().setY(-0.9), start: performance.now(), dur: 260, arc: 0, fade: true, onDone: () => this.scene.remove(victim) });
        }
        this.pieces.delete(fromKey);
        this.pieces.set(toKey, actor);
        this.tweens.push({ obj: actor, from: worldPos(move.from), to: worldPos(move.to), start: performance.now(), dur: 300, arc: 0.45 });
      }
    }

    // Hard sync: add/replace/remove so the scene always matches the board.
    for (const [key, want] of wanted) {
      const cur = this.pieces.get(key);
      if (cur && cur.userData.type === want.type && cur.userData.color === want.color) continue;
      if (cur) this.scene.remove(cur);
      const g = this.template(want.type, want.color);
      g.userData = { type: want.type, color: want.color };
      const col = FILES.indexOf(key[0]);
      const row = RANKS.indexOf(key[1]);
      g.position.copy(worldPos({ row, col }));
      this.pieces.set(key, g);
      this.scene.add(g);
    }
    for (const [key, g] of this.pieces) {
      if (!wanted.has(key)) {
        this.pieces.delete(key);
        this.scene.remove(g);
      }
    }
  }

  /** Selection ring, target dots, last-move tint, check pulse. */
  setMarks(m: Marks) {
    this.markGroup.clear();
    this.checkMat = null;
    const plane = (sq: Square, color: string, opacity: number) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.96, 0.96),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(worldPos(sq)).setY(0.005);
      this.markGroup.add(mesh);
      return mesh.material as THREE.MeshBasicMaterial;
    };
    if (m.lastMove) {
      plane(m.lastMove.from, '#fbbf24', 0.22);
      plane(m.lastMove.to, '#fbbf24', 0.3);
    }
    if (m.checkSq) this.checkMat = plane(m.checkSq, '#ef4444', 0.45);
    if (m.selected) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.46, 40),
        new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.9, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(worldPos(m.selected)).setY(0.008);
      this.markGroup.add(ring);
    }
    for (const t of m.targets) {
      const dot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24),
        new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.85 }),
      );
      dot.position.copy(worldPos(t)).setY(0.03);
      this.markGroup.add(dot);
    }
  }

  private onDown = (e: globalThis.PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: globalThis.PointerEvent) => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 7) return; // that was an orbit, not a tap
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    // Prefer the tapped piece's square; fall back to the tile.
    const pieceHit = this.raycaster.intersectObjects([...this.pieces.values()], true)[0];
    if (pieceHit) {
      let g: THREE.Object3D | null = pieceHit.object;
      while (g && !g.userData.type) g = g.parent;
      if (g) {
        for (const [key, grp] of this.pieces) {
          if (grp === g) return this.tapSquare(key);
        }
      }
    }
    const tileHit = this.raycaster.intersectObjects(this.tiles)[0];
    if (tileHit) this.tapSquare(tileHit.object.name);
  };

  private tapSquare(name: string) {
    const col = FILES.indexOf(name[0]);
    const row = RANKS.indexOf(name[1]);
    if (col >= 0 && row >= 0) this.opts.onTap({ row, col });
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      const k = Math.min(1, (now - t.start) / t.dur);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      t.obj.position.lerpVectors(t.from, t.to, e);
      t.obj.position.y += Math.sin(e * Math.PI) * t.arc;
      if (t.fade) {
        t.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m) { m.transparent = true; m.opacity = 1 - e; }
        });
      }
      if (k >= 1) {
        t.onDone?.();
        this.tweens.splice(i, 1);
      }
    }
    if (this.checkMat) this.checkMat.opacity = 0.3 + 0.2 * Math.sin(now / 180);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.controls.dispose();
    this.renderer.dispose();
    this.container.contains(this.renderer.domElement) && this.container.removeChild(this.renderer.domElement);
  }
}

// ── Piece geometry ──────────────────────────────────────────────────────────

const v2 = (pts: [number, number][]) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const BASE: [number, number][] = [[0, 0], [0.30, 0], [0.30, 0.05], [0.24, 0.09], [0.20, 0.14]];

function lathe(pts: [number, number][], mat: THREE.Material) {
  return new THREE.Mesh(new THREE.LatheGeometry(v2(pts), 40), mat);
}
function ball(r: number, y: number, mat: THREE.Material, sy = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 20), mat);
  m.position.y = y;
  m.scale.y = sy;
  return m;
}

/**
 * Build one piece in the theme's sculpt style: `standard` turns a staunton
 * set (royal details cast in the accent when one is given — the War Room's
 * brass), `fantasy` swaps in the unicorn knight and faerie bishop, and
 * `ships` builds the Galaxy Fleet — every piece a display-model starship on
 * a slender pylon, engines burning in the team's glow colour.
 */
function buildPiece(
  type: PieceType,
  mat: THREE.Material,
  black: boolean,
  style: ScenePalette['pieceStyle'],
  accent?: THREE.Material,
  glow?: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  if (style === 'ships') {
    buildShip(g, type, mat, black, accent ?? mat, glow ?? mat);
    return g;
  }
  switch (type) {
    case 'p':
      g.add(lathe([...BASE, [0.11, 0.22], [0.09, 0.34], [0.13, 0.38], [0, 0.40]], mat));
      g.add(ball(0.135, 0.47, mat));
      break;
    case 'r': {
      g.add(lathe([...BASE, [0.14, 0.24], [0.13, 0.44], [0.20, 0.50], [0.20, 0.62], [0.15, 0.62], [0, 0.62]], mat));
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.10), mat);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        c.position.set(Math.cos(a) * 0.145, 0.665, Math.sin(a) * 0.145);
        g.add(c);
      }
      break;
    }
    case 'b': {
      if (style === 'fantasy' && accent) {
        buildFaerie(g, mat, accent, black);
        break;
      }
      g.add(lathe([...BASE, [0.10, 0.24], [0.075, 0.44], [0.12, 0.50], [0, 0.52]], mat));
      g.add(ball(0.115, 0.60, mat, 1.35));
      g.add(ball(0.035, 0.76, mat));
      break;
    }
    case 'q': {
      if (style === 'fantasy' && accent) {
        buildPrincess(g, mat, accent, black);
        break;
      }
      g.add(lathe([...BASE, [0.12, 0.26], [0.085, 0.52], [0.16, 0.66], [0.13, 0.70], [0, 0.72]], mat));
      const crownMat = accent ?? mat;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const b = ball(0.045, 0.735, crownMat);
        b.position.set(Math.cos(a) * 0.12, 0.735, Math.sin(a) * 0.12);
        g.add(b);
      }
      g.add(ball(0.07, 0.79, crownMat));
      break;
    }
    case 'k': {
      g.add(lathe([...BASE, [0.13, 0.26], [0.09, 0.56], [0.17, 0.70], [0.13, 0.74], [0.09, 0.76], [0, 0.78]], mat));
      const crownMat = accent ?? mat;
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.05), crownMat);
      c1.position.y = 0.88;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), crownMat);
      c2.position.y = 0.90;
      g.add(c1, c2);
      break;
    }
    case 'n': {
      if (style === 'fantasy' && accent) {
        buildUnicorn(g, mat, accent, black);
        break;
      }
      g.add(lathe([...BASE, [0.155, 0.20], [0.17, 0.24]], mat));
      const s = new THREE.Shape();
      const P: [number, number][] = [[-0.14, 0], [0.15, 0], [0.12, 0.12], [0.05, 0.17], [0.07, 0.26], [0.30, 0.34], [0.32, 0.42],
        [0.16, 0.43], [0.11, 0.50], [0.08, 0.60], [0.0, 0.50], [-0.08, 0.54], [-0.13, 0.44], [-0.17, 0.26], [-0.16, 0.10]];
      s.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 });
      geo.center();
      const head = new THREE.Mesh(geo, mat);
      head.position.y = 0.44;
      head.scale.setScalar(0.92);
      head.rotation.y = black ? Math.PI / 2 : -Math.PI / 2;
      g.add(head);
      break;
    }
  }
  return g;
}

/**
 * The unicorn-theme knight: a sculpted unicorn bust — arched neck, elongated
 * head with muzzle, pricked ears, a beaded mane down the back of the neck, and
 * the golden horn. `dir` is +1/-1 so each side faces its enemy.
 */
function buildUnicorn(g: THREE.Group, mat: THREE.Material, accent: THREE.Material, black: boolean) {
  const dir = black ? 1 : -1;
  g.add(lathe([...BASE, [0.17, 0.2], [0.185, 0.26]], mat));

  // Shoulders/chest sitting on the base.
  const chest = ball(0.155, 0.3, mat, 0.9);
  chest.scale.x = 1.15;
  g.add(chest);

  // Arched neck, leaning toward the enemy.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.14, 0.42, 18), mat);
  neck.position.set(dir * 0.05, 0.5, 0);
  neck.rotation.z = -dir * 0.38;
  g.add(neck);

  // Head — an elongated sphere with a shorter muzzle sphere at the tip.
  const head = ball(0.105, 0.7, mat);
  head.scale.set(1.55, 0.82, 0.78);
  head.position.x = dir * 0.16;
  head.rotation.z = -dir * 0.32;
  g.add(head);
  const muzzle = ball(0.062, 0.655, mat);
  muzzle.scale.set(1.15, 0.8, 0.72);
  muzzle.position.x = dir * 0.3;
  g.add(muzzle);

  // Pricked ears.
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 10), mat);
    ear.position.set(dir * 0.07, 0.795, side * 0.05);
    ear.rotation.z = -dir * 0.25;
    ear.castShadow = true;
    g.add(ear);
  }

  // The golden horn, from the forehead, following the head's tilt.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.27, 12), accent);
  horn.position.set(dir * 0.135, 0.9, 0);
  horn.rotation.z = -dir * 0.42;
  horn.castShadow = true;
  g.add(horn);

  // A beaded mane down the back of the neck, in a deeper shade of the coat.
  const bodyColor = (mat as THREE.MeshStandardMaterial).color;
  const maneMat = new THREE.MeshStandardMaterial({
    color: bodyColor.clone().multiplyScalar(0.72),
    roughness: 0.5,
  });
  const maneSpots: [number, number][] = [[-0.02, 0.76], [-0.07, 0.68], [-0.11, 0.59], [-0.145, 0.5], [-0.17, 0.4]];
  for (const [mx, my] of maneSpots) {
    const tuft = ball(0.052, my, maneMat);
    tuft.position.x = dir * mx;
    g.add(tuft);
  }
}

/**
 * The unicorn-theme bishop: a faerie facing her enemy — a gowned figure with
 * hair in a bun under a gold circlet, REAL double-lobed gossamer wings (flat
 * translucent silhouettes, like a butterfly's), a raised golden wand, and a
 * drift of sparkle dust.
 */
function buildFaerie(g: THREE.Group, mat: THREE.Material, accent: THREE.Material, black: boolean) {
  // White sits at +z facing -z; wings go on the back, wand out the front.
  const back = black ? -1 : 1;

  g.add(lathe([...BASE, [0.12, 0.19]], mat));

  // The gown — bell hem, drawn-in waist, small bodice and shoulders.
  g.add(lathe([
    [0.165, 0.17], [0.155, 0.22], [0.125, 0.3], [0.09, 0.38], [0.062, 0.46],
    [0.052, 0.52], [0.062, 0.56], [0.052, 0.61], [0, 0.63],
  ], mat));

  // Head, hair (a deeper shade) swept into a bun, and the golden circlet.
  g.add(ball(0.072, 0.70, mat));
  const bodyColor = (mat as THREE.MeshStandardMaterial).color;
  const hairMat = new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.66), roughness: 0.55 });
  const hair = ball(0.076, 0.715, hairMat);
  hair.scale.set(1, 0.92, 1);
  hair.position.z = back * 0.018;
  g.add(hair);
  const face = ball(0.062, 0.695, mat);
  face.position.z = -back * 0.028;
  g.add(face);
  const bun = ball(0.034, 0.77, hairMat);
  bun.position.z = back * 0.045;
  g.add(bun);
  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.011, 8, 22), accent);
  circlet.position.y = 0.745;
  circlet.rotation.x = Math.PI / 2 - 0.12;
  circlet.castShadow = true;
  g.add(circlet);

  // Real fairy wings: a flat silhouette with a big upper lobe and a small
  // lower lobe, translucent and softly glowing from both sides.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.10, 0.10, 0.20, 0.16);
  wingShape.quadraticCurveTo(0.30, 0.22, 0.28, 0.10);
  wingShape.quadraticCurveTo(0.26, 0.0, 0.12, -0.02);
  wingShape.quadraticCurveTo(0.22, -0.06, 0.18, -0.14);
  wingShape.quadraticCurveTo(0.13, -0.20, 0.05, -0.10);
  wingShape.quadraticCurveTo(0.015, -0.05, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 18);
  const wingMat = new THREE.MeshStandardMaterial({
    color: '#f6f8ff',
    transparent: true,
    opacity: 0.68,
    roughness: 0.12,
    side: THREE.DoubleSide,
    emissive: '#ffd9f2',
    emissiveIntensity: 0.55,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    // Mirror the pair and make them proudly oversized.
    wing.scale.set(side * 1.2, 1.2, 1);
    wing.position.set(side * 0.035, 0.52, back * 0.055);
    // Splayed mostly outward (visible from the front), a gentle sweep back
    // and an upward rake.
    wing.rotation.set(back * -0.12, back * side * 0.5, side * 0.3);
    g.add(wing);
  }

  // The golden wand, raised in front, with a star at its tip.
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.2, 8), accent);
  wand.position.set(0.085, 0.5, -back * 0.055);
  wand.rotation.z = -0.5;
  wand.castShadow = true;
  g.add(wand);
  const star = ball(0.026, 0.59, accent);
  star.position.set(0.135, 0.59, -back * 0.055);
  g.add(star);

  // A drift of sparkle dust trailing off the wand.
  const dustMat = new THREE.MeshStandardMaterial({ color: '#fff3fb', emissive: '#ffc9ec', emissiveIntensity: 0.9 });
  const dust: [number, number, number, number][] = [
    [0.19, 0.66, -back * 0.03, 0.012],
    [0.24, 0.60, -back * 0.08, 0.009],
    [0.21, 0.52, -back * 0.11, 0.007],
  ];
  for (const [dx, dy, dz, r] of dust) {
    const mote = ball(r, dy, dustMat);
    mote.position.set(dx, dy, dz);
    g.add(mote);
  }
}

/**
 * The unicorn-theme queen: a proper princess. A grand ballgown with a gold
 * hem, puff sleeves, long hair falling down her back beneath a pointed
 * gold tiara with a jewel — unmistakably the princess of the set, and a
 * head shorter than the star-crowned king.
 */
function buildPrincess(g: THREE.Group, mat: THREE.Material, accent: THREE.Material, black: boolean) {
  // Like the faerie: white faces -z, so hair falls toward +z ("back").
  const back = black ? -1 : 1;

  g.add(lathe([...BASE, [0.14, 0.19]], mat));

  // The ballgown — a wide sweeping bell, a cinched waist, a small bodice.
  g.add(lathe([
    [0.195, 0.17], [0.185, 0.23], [0.15, 0.33], [0.105, 0.43], [0.075, 0.51],
    [0.06, 0.58], [0.07, 0.63], [0.06, 0.68], [0, 0.7],
  ], mat));
  // Gold trim around the hem.
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.012, 8, 36), accent);
  hem.position.y = 0.2;
  hem.rotation.x = Math.PI / 2;
  g.add(hem);

  // Puff sleeves at the shoulders.
  for (const side of [-1, 1]) {
    const sleeve = ball(0.042, 0.635, mat);
    sleeve.position.x = side * 0.078;
    g.add(sleeve);
  }

  // Head, face, and long princess hair — a cap, two locks falling down the
  // back, all in a deeper shade of the gown.
  g.add(ball(0.075, 0.775, mat));
  const bodyColor = (mat as THREE.MeshStandardMaterial).color;
  const hairMat = new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.66), roughness: 0.55 });
  const cap = ball(0.08, 0.79, hairMat);
  cap.scale.set(1, 0.9, 1);
  cap.position.z = back * 0.016;
  g.add(cap);
  const face = ball(0.064, 0.77, mat);
  face.position.z = -back * 0.03;
  g.add(face);
  for (const side of [-1, 1]) {
    const lock = ball(0.03, 0.66, hairMat);
    lock.scale.set(1, 2.6, 1);
    lock.position.set(side * 0.05, 0.66, back * 0.06);
    g.add(lock);
  }

  // The tiara: a gold circlet with three points and a jewel at its brow.
  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.011, 8, 24), accent);
  circlet.position.y = 0.845;
  circlet.rotation.x = Math.PI / 2 - 0.12;
  circlet.castShadow = true;
  g.add(circlet);
  for (const px of [-0.036, 0, 0.036]) {
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.011, px === 0 ? 0.05 : 0.034, 8), accent);
    point.position.set(px, px === 0 ? 0.885 : 0.875, -back * 0.038);
    point.castShadow = true;
    g.add(point);
  }
  const jewel = ball(0.014, 0.856, mat);
  jewel.position.z = -back * 0.058;
  g.add(jewel);
}

/**
 * The Galaxy Fleet — every piece a little display-model starship hovering on
 * a slender pylon, nose toward the enemy, engines burning in the side's glow
 * colour. Light flies the rebel fleet, dark the Empire; the sculpts are
 * loving procedural nods to the ships every kid knows.
 */
function buildShip(
  g: THREE.Group,
  type: PieceType,
  mat: THREE.Material,
  black: boolean,
  accent: THREE.Material,
  glow: THREE.Material,
) {
  // White sits at +z and flies toward -z; black the opposite.
  const f = black ? 1 : -1;

  // Display plinth + pylon — slim, so the ship is the star of the model.
  g.add(lathe([[0, 0], [0.24, 0], [0.24, 0.04], [0.18, 0.075], [0.12, 0.11], [0.1, 0.13]], mat));
  const HOVER: Record<PieceType, number> = { p: 0.4, n: 0.44, b: 0.48, r: 0.5, q: 0.56, k: 0.56 };
  const h = HOVER[type];
  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.026, h - 0.13, 10), mat);
  pylon.position.y = 0.13 + (h - 0.13) / 2;
  g.add(pylon);

  const ship = new THREE.Group();
  ship.position.y = h;
  ship.scale.setScalar(1.22);
  g.add(ship);

  /** A cone lying along z, tip toward the enemy. */
  const zcone = (r: number, len: number, m: THREE.Material, segments = 18) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, len, segments), m);
    c.rotation.x = (f * Math.PI) / 2;
    ship.add(c);
    return c;
  };
  /** A cylinder lying along z (fuselages, nacelles, hulls). */
  const zcyl = (r: number, len: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), m);
    c.rotation.x = Math.PI / 2;
    c.position.set(x, y, z);
    ship.add(c);
    return c;
  };
  const engine = (x: number, z: number, r: number, y = 0) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), glow);
    e.position.set(x, y, -f * z);
    ship.add(e);
  };
  const detail = (x: number, y: number, z: number, r: number, m: THREE.Material = accent) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
    d.position.set(x, y, f * z);
    ship.add(d);
    return d;
  };
  /** A flattened 4-sided cone = the capital-ship wedge hull. */
  const wedge = (r: number, len: number, widen: number, flatten: number) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, len, 4), mat);
    m.rotation.x = (f * Math.PI) / 2;
    m.scale.set(widen, 1, flatten); // local z is world-vertical after the tilt
    ship.add(m);
    return m;
  };

  void accent; // referenced through `detail`'s default
  if (black) buildEmpireShip(type, ship, mat, glow, f, { zcone, zcyl, engine, detail, wedge });
  else buildRebelShip(type, ship, mat, glow, f, { zcone, zcyl, engine, detail, wedge });
}

interface ShipKit {
  zcone: (r: number, len: number, m: THREE.Material, segments?: number) => THREE.Mesh;
  zcyl: (r: number, len: number, m: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh;
  engine: (x: number, z: number, r: number, y?: number) => void;
  detail: (x: number, y: number, z: number, r: number, m?: THREE.Material) => THREE.Mesh;
  wedge: (r: number, len: number, widen: number, flatten: number) => THREE.Mesh;
}

/** The rebel fleet (light side). */
function buildRebelShip(
  type: PieceType,
  ship: THREE.Group,
  mat: THREE.Material,
  glow: THREE.Material,
  f: number,
  kit: ShipKit,
) {
  const { zcone, zcyl, engine, detail, wedge } = kit;
  switch (type) {
    case 'p': { // X-wing — long fuselage, four S-foils open in an X
      zcyl(0.032, 0.34, mat, 0, 0, f * -0.02);
      const nose = zcone(0.032, 0.12, mat);
      nose.position.z = f * 0.2;
      detail(0, 0.035, 0.04, 0.028); // canopy stripe
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const foil = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.013, 0.085), mat);
          foil.position.set(sx * 0.11, sy * 0.028, -f * 0.1);
          foil.rotation.z = sx * sy * 0.3; // the open X
          ship.add(foil);
        }
      }
      engine(-0.055, 0.17, 0.024);
      engine(0.055, 0.17, 0.024);
      break;
    }
    case 'n': { // A-wing — a darting little delta with twin tail fins
      wedge(0.1, 0.3, 1.25, 0.5);
      detail(0, 0.03, 0.04, 0.026);
      for (const sx of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.08), mat);
        fin.position.set(sx * 0.06, 0.05, -f * 0.1);
        ship.add(fin);
      }
      engine(-0.045, 0.17, 0.028);
      engine(0.045, 0.17, 0.028);
      break;
    }
    case 'b': { // Y-wing — cockpit up front, two long engine nacelles behind
      zcyl(0.03, 0.3, mat, 0, 0, f * 0.06);
      const pod = detail(0, 0.005, 0.2, 0.05, mat);
      pod.scale.set(0.85, 0.75, 1.5);
      detail(0, 0.04, 0.22, 0.024); // canopy
      for (const sx of [-1, 1]) {
        zcyl(0.032, 0.3, mat, sx * 0.095, 0, -f * 0.05);
        detail(sx * 0.095, 0, 0.11, 0.032, mat); // nacelle nose cap
        engine(sx * 0.095, 0.21, 0.026);
      }
      break;
    }
    case 'r': { // blockade runner — hammerhead bow, banked engine cluster
      zcyl(0.05, 0.36, mat);
      const head = detail(0, 0, 0.2, 0.075, mat);
      head.scale.set(1.15, 0.7, 0.85); // the hammerhead
      detail(0, 0.055, 0.02, 0.02); // sensor dish
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.07), mat);
      block.position.set(0, 0, -f * 0.19);
      ship.add(block);
      engine(-0.05, 0.235, 0.022);
      engine(0, 0.235, 0.022, 0.025);
      engine(0.05, 0.235, 0.022);
      engine(0, 0.235, 0.022, -0.025);
      break;
    }
    case 'q': { // the saucer freighter — disc, mandibles, offset cockpit
      const disc = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 16), mat);
      disc.scale.set(1, 0.28, 1);
      ship.add(disc);
      for (const sx of [-1, 1]) {
        const mand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.13), mat);
        mand.position.set(sx * 0.055, 0, f * 0.17);
        ship.add(mand);
      }
      const cockpit = zcyl(0.026, 0.09, mat, 0.125, 0.01, f * 0.1);
      cockpit.rotation.x = Math.PI / 2;
      detail(0.125, 0.012, 0.15, 0.024); // cockpit glass
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.014), glow);
      band.position.set(0, 0, -f * 0.15);
      ship.add(band); // the long blue-white engine strip
      detail(0, 0.05, 0.02, 0.022); // top dish
      break;
    }
    case 'k': { // Mon Cal flagship — whale-backed cruiser, bristling with domes
      const hull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 22, 16), mat);
      hull.scale.set(0.9, 0.55, 2.4);
      ship.add(hull);
      detail(-0.035, 0.05, 0.08, 0.018, mat);
      detail(0.04, 0.055, -0.02, 0.022, mat);
      detail(-0.02, 0.05, -0.1, 0.016, mat);
      detail(0.02, 0.06, 0.14, 0.014); // command dome, in rebel red
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), mat);
      mast.position.y = 0.12;
      ship.add(mast);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), glow);
      beacon.position.y = 0.21;
      ship.add(beacon);
      engine(-0.04, 0.24, 0.02);
      engine(0, 0.245, 0.024);
      engine(0.04, 0.24, 0.02);
      break;
    }
  }
}

/** The Empire (dark side). */
function buildEmpireShip(
  type: PieceType,
  ship: THREE.Group,
  mat: THREE.Material,
  glow: THREE.Material,
  f: number,
  kit: ShipKit,
) {
  const { engine, detail, wedge } = kit;
  /** The TIE ball cockpit with its round viewport. */
  const ball = (r: number) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
    ship.add(b);
    const eye = detail(0, 0, r * 0.82, r * 0.42);
    eye.scale.z = 0.5;
    return b;
  };
  /** A TIE wing panel; `rake` angles interceptor daggers forward. */
  const panel = (x: number, wHeight: number, wDepth: number, rake = 0) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.014, wHeight, wDepth), mat);
    p.position.set(x, 0, 0);
    p.rotation.y = -Math.sign(x) * f * rake;
    ship.add(p);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.abs(x), 8), mat);
    strut.rotation.z = Math.PI / 2;
    strut.position.set(x / 2, 0, 0);
    ship.add(strut);
  };
  switch (type) {
    case 'p': // TIE fighter — ball cockpit between two flat panels
      ball(0.062);
      panel(-0.115, 0.17, 0.13);
      panel(0.115, 0.17, 0.13);
      engine(0, 0.07, 0.02);
      break;
    case 'n': // TIE interceptor — the daggers rake toward the enemy
      ball(0.058);
      panel(-0.12, 0.2, 0.15, 0.5);
      panel(0.12, 0.2, 0.15, 0.5);
      engine(-0.03, 0.07, 0.018);
      engine(0.03, 0.07, 0.018);
      break;
    case 'b': { // the trifoil shuttle — tall dorsal fin, drooped wings
      const body = kit.zcone(0.06, 0.3, mat);
      body.position.z = f * 0.03;
      detail(0, 0.035, 0.13, 0.026); // cockpit
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.22, 0.13), mat);
      fin.position.set(0, 0.12, -f * 0.06);
      fin.rotation.x = -f * 0.3;
      ship.add(fin);
      for (const sx of [-1, 1]) {
        const wingM = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.2, 0.14), mat);
        wingM.position.set(sx * 0.085, -0.07, -f * 0.02);
        wingM.rotation.z = -sx * 0.55; // drooped for landing-bay drama
        ship.add(wingM);
      }
      engine(0, 0.13, 0.032);
      break;
    }
    case 'r': { // Star Destroyer — the wedge, neck, and twin-domed bridge
      wedge(0.15, 0.55, 1.4, 0.45);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.06), mat);
      neck.position.set(0, 0.045, -f * 0.16);
      ship.add(neck);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.028, 0.045), mat);
      bridge.position.set(0, 0.082, -f * 0.16);
      ship.add(bridge);
      detail(-0.04, 0.105, -0.16, 0.013); // deflector domes, atop the bridge
      detail(0.04, 0.105, -0.16, 0.013);
      engine(-0.06, 0.29, 0.024);
      engine(0, 0.29, 0.028);
      engine(0.06, 0.29, 0.024);
      break;
    }
    case 'q': { // the Executor — a longer, crueller blade
      wedge(0.13, 0.82, 1.5, 0.32);
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.4), mat);
      ridge.position.set(0, 0.028, -f * 0.06);
      ship.add(ridge);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.024, 0.035), mat);
      bridge.position.set(0, 0.062, -f * 0.28);
      ship.add(bridge);
      detail(0, 0.085, -0.28, 0.012);
      engine(-0.05, 0.42, 0.02);
      engine(0, 0.42, 0.024);
      engine(0.05, 0.42, 0.02);
      break;
    }
    case 'k': { // the battle station — sphere, equatorial trench, the dish
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 22), mat);
      ship.add(core);
      const bodyColor = (mat as THREE.MeshStandardMaterial).color;
      const trenchMat = new THREE.MeshStandardMaterial({ color: bodyColor.clone().multiplyScalar(0.55), roughness: 0.7 });
      const trench = new THREE.Mesh(new THREE.TorusGeometry(0.169, 0.012, 8, 40), trenchMat);
      trench.rotation.x = Math.PI / 2;
      ship.add(trench);
      // The superlaser dish, up-and-forward where everyone expects it.
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), trenchMat);
      dish.scale.set(1, 1, 0.35);
      const dishDir = new THREE.Vector3(0.35, 0.55, f * 0.75).normalize();
      dish.position.copy(dishDir.clone().multiplyScalar(0.155));
      dish.lookAt(dishDir.clone().multiplyScalar(2));
      ship.add(dish);
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), glow);
      lens.position.copy(dishDir.clone().multiplyScalar(0.165));
      ship.add(lens);
      break;
    }
  }
}
