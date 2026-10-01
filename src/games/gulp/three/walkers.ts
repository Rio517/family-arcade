/**
 * The people and the police as drawn: walkers in batches (one per outfit)
 * with a "!" over anyone running from a hole, and responders, police cars
 * racing in and officers waving their batons.
 */
import * as THREE from 'three';
import { KINDS } from '../domain/catalog';
import { wrapAngle } from '../domain/space';
import type { Person, World } from '../domain/world';
import { modelFor } from './models';
import { buildKindGeometry } from './props';
import { alarmTexture } from './canvasTextures';
import { groundAt } from './ground';

/** How many "!" marks can show at once. */
const ALARMS = 24;
/** Where a batch puts someone it is not showing. */
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class Walkers {
  private people: Array<{ person: Person; mesh: THREE.InstancedMesh; index: number }> = [];
  private geometries: THREE.BufferGeometry[] = [];
  /** Which way each person faces: they turn smoothly toward the way they walk. */
  private facing = new Map<number, number>();
  private alarms: THREE.Sprite[] = [];
  private alarmTex = alarmTexture();
  private responders = new Map<number, { group: THREE.Group; baton?: THREE.Object3D }>();
  private batonGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6);
  private batonMat = new THREE.MeshStandardMaterial({ color: 0x1d1f33, roughness: 0.5 });
  private dummy = new THREE.Object3D();
  private touched = new Set<THREE.InstancedMesh>();
  /** The walkers' batches, and whether they are drawn (not from high above, see `showPeople`). */
  private crowds: THREE.InstancedMesh[] = [];
  private peopleShown = true;

  constructor(
    private scene: THREE.Scene,
    /** The one flat-shaded, vertex-coloured material every model shares. */
    private material: THREE.MeshStandardMaterial,
    world: World,
    private reducedMotion: boolean,
  ) {
    const byLook = new Map<string, Person[]>();
    for (const p of world.people) {
      const key = `${p.kind}:${p.variant % KINDS[p.kind].variants}`;
      byLook.set(key, [...(byLook.get(key) ?? []), p]);
    }
    for (const list of byLook.values()) {
      const geo = buildKindGeometry(list[0].kind, list[0].variant);
      this.geometries.push(geo);
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      mesh.castShadow = true;
      // They move every frame, so their bounds are the whole island.
      mesh.frustumCulled = false;
      list.forEach((person, index) => this.people.push({ person, mesh, index }));
      scene.add(mesh);
      this.crowds.push(mesh);
    }
    // A pool of "!" marks for people running away.
    for (let i = 0; i < ALARMS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.alarmTex, depthTest: false, transparent: true, sizeAttenuation: false }));
      sprite.scale.set(0.025, 0.035, 1);
      sprite.renderOrder = 13;
      sprite.visible = false;
      scene.add(sprite);
      this.alarms.push(sprite);
    }
  }

  /** Everyone where the world says. `time` is the scene's clock. */
  sync(world: World, time: number, dt: number): void {
    if (this.peopleShown) this.syncPeople(world, time, dt);
    this.syncResponders(world, time);
  }

  /**
   * Draw the people walking about, or not: from high above (a giant's
   * camera) they are specks, and their "!" marks are clutter. Hidden, they
   * are not moved either.
   */
  showPeople(shown: boolean): void {
    if (shown === this.peopleShown) return;
    this.peopleShown = shown;
    for (const m of this.crowds) m.visible = shown;
    if (!shown) for (const a of this.alarms) a.visible = false;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.alarmTex.dispose();
    this.batonGeo.dispose();
    this.batonMat.dispose();
  }

  /** Walkers bob gently; people running from a hole hop high and quick with a "!" over their heads. */
  private syncPeople(world: World, time: number, dt: number): void {
    const d = this.dummy;
    const touched = this.touched;
    touched.clear();
    let alarm = 0;
    for (const { person: p, mesh, index } of this.people) {
      if (!p.alive) {
        mesh.setMatrixAt(index, HIDDEN);
      } else {
        const running = p.state === 'flee';
        const bob = this.reducedMotion ? 0 : Math.abs(Math.sin(time * (running ? 14 : 6) + p.id)) * (running ? 0.45 : 0.07);
        // Turn smoothly toward the way they walk (corners and turn-rounds).
        let face = this.facing.get(p.id) ?? p.heading;
        face += wrapAngle(p.heading - face) * (this.reducedMotion ? 1 : Math.min(1, dt * (running ? 18 : 10)));
        this.facing.set(p.id, face);
        const y = groundAt(world.city, p.x, p.z);
        d.position.set(p.x, y + bob, p.z);
        d.rotation.set(0, face, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        mesh.setMatrixAt(index, d.matrix);
        if (running && p.kind === 'person' && alarm < this.alarms.length) {
          const a = this.alarms[alarm++];
          a.visible = true;
          a.position.set(p.x, y + 2.6 + bob, p.z);
        }
      }
      touched.add(mesh);
    }
    for (let i = alarm; i < this.alarms.length; i++) this.alarms[i].visible = false;
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }

  /** Police cars racing in, and officers waving their batons at the hole. */
  private syncResponders(world: World, time: number): void {
    const live = new Set<number>();
    for (const r of world.responders) {
      if (r.done) continue;
      if (r.kind === 'car' && r.state !== 'drive') continue;
      live.add(r.id);
      let view = this.responders.get(r.id);
      if (!view) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(modelFor(r.kind === 'car' ? 'policecar' : 'police', 0, 1), this.material);
        body.castShadow = true;
        group.add(body);
        let baton: THREE.Object3D | undefined;
        if (r.kind === 'officer') {
          // A baton in the right hand, held up and waved.
          const arm = new THREE.Group();
          arm.position.set(-0.45, 1.25, 0.1);
          const stick = new THREE.Mesh(this.batonGeo, this.batonMat);
          stick.position.y = 0.4;
          arm.add(stick);
          group.add(arm);
          baton = arm;
        }
        this.scene.add(group);
        view = { group, baton };
        this.responders.set(r.id, view);
      }
      view.group.position.set(r.x, groundAt(world.city, r.x, r.z), r.z);
      view.group.rotation.y = r.heading;
      if (view.baton) view.baton.rotation.z = this.reducedMotion ? 0.3 : 0.3 + Math.sin(time * 9 + r.id) * 0.7;
    }
    for (const [id, view] of this.responders) {
      if (live.has(id)) continue;
      this.scene.remove(view.group);
      this.responders.delete(id);
    }
  }
}
