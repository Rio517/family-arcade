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
    this.scene.fog = new THREE.Fog(this.palette.background, 15, 28);
    if (this.palette.accent) {
      this.accentMat = new THREE.MeshStandardMaterial({
        color: this.palette.accent,
        roughness: 0.25,
        metalness: 0.65,
      });
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
      new THREE.MeshStandardMaterial({ color: this.palette.edge, emissive: this.palette.edge, emissiveIntensity: 1.4 }),
    );
    edge.position.y = -0.075;
    this.scene.add(edge);
  }

  // ── Procedural pieces (lathe-turned; knight is an extruded silhouette) ──
  private material(color: Color) {
    return new THREE.MeshStandardMaterial({
      color: color === 'w' ? this.palette.whitePiece : this.palette.blackPiece,
      roughness: this.palette.pieceRoughness,
      metalness: color === 'b' && !this.palette.accent ? 0.12 : 0.05,
    });
  }

  private template(type: PieceType, color: Color): THREE.Group {
    const key = `${color}${type}`;
    let tpl = this.templates.get(key);
    if (!tpl) {
      tpl = buildPiece(type, this.material(color), color === 'b', this.accentMat ?? undefined);
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
 * Build one piece. When `accent` is given (the unicorn set's gold), the
 * knight grows a horn and the royal details — coronet, cross, queen's orb —
 * are cast in it.
 */
function buildPiece(type: PieceType, mat: THREE.Material, black: boolean, accent?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
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
      if (accent) {
        buildFaerie(g, mat, accent);
        break;
      }
      g.add(lathe([...BASE, [0.10, 0.24], [0.075, 0.44], [0.12, 0.50], [0, 0.52]], mat));
      g.add(ball(0.115, 0.60, mat, 1.35));
      g.add(ball(0.035, 0.76, mat));
      break;
    }
    case 'q': {
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
      if (accent) {
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
 * The unicorn-theme bishop: a faerie — slender gown, a small head with a gold
 * circlet, and two gossamer wings that light passes through.
 */
function buildFaerie(g: THREE.Group, mat: THREE.Material, accent: THREE.Material) {
  g.add(lathe([...BASE, [0.11, 0.2]], mat));

  // The gown — a gentle A-line from base to shoulders.
  g.add(lathe([[0.155, 0.18], [0.12, 0.3], [0.08, 0.42], [0.05, 0.52], [0.055, 0.56], [0, 0.58]], mat));

  // Head with a golden circlet.
  g.add(ball(0.075, 0.65, mat));
  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 20), accent);
  circlet.position.y = 0.695;
  circlet.rotation.x = Math.PI / 2 - 0.25;
  circlet.castShadow = true;
  g.add(circlet);

  // Gossamer wings — translucent, softly glowing, catching light both sides.
  const wingMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.5,
    roughness: 0.15,
    side: THREE.DoubleSide,
    emissive: '#ffd9f2',
    emissiveIntensity: 0.3,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), wingMat);
    wing.scale.set(0.55, 1.35, 0.12);
    wing.position.set(side * 0.14, 0.47, -0.06);
    wing.rotation.z = side * 0.55;
    wing.rotation.y = side * 0.25;
    g.add(wing);
  }

  // A tiny golden wand-star held at the side.
  const star = ball(0.028, 0.46, accent);
  star.position.x = 0.11;
  g.add(star);
}
