/**
 * Authored ship meshes, and the details that make them read at board scale.
 *
 * Every hull is hand-authored in Blender and optimised down to a few thousand
 * triangles (`npm run glb`). They arrive as finished game assets — named
 * nodes, their own materials, real UVs, textures — so the only thing done here
 * is placement (orientation, waterline, cell fit) and the team tint: each
 * spec names the one material that follows the player's fleet colour.
 *
 * (An earlier image-generated pipeline — projected deck decals, height-banded
 * vertex shading — lived here too; it died when the last generated hull was
 * replaced by authored art, and it lives on only in git history.)
 *
 * No runtime downloads: the .glb is imported so Vite hashes it into `dist/`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { FleetEra, ShipId } from '@games/battleship/domain/types';
// Assets carry their era in the name. Two complete navies sail: the classic
// WWII fleet (Shōkaku, Iowa, Cleveland, Type VIIC, Fletcher) and the modern
// one (Ford, Kirov, Type 055, Virginia, Hobart). Each captain picks their
// era on the fleet screen — a purely local, purely cosmetic choice.
import carrierClassicUrl from '@games/battleship/assets/ships/carrier-classic.glb';
import battleshipClassicUrl from '@games/battleship/assets/ships/battleship-classic.glb';
import cruiserClassicUrl from '@games/battleship/assets/ships/cruiser-classic.glb';
import submarineClassicUrl from '@games/battleship/assets/ships/submarine-classic.glb';
import destroyerClassicUrl from '@games/battleship/assets/ships/destroyer-classic.glb';
import carrierModernUrl from '@games/battleship/assets/ships/carrier-modern.glb';
import battleshipModernUrl from '@games/battleship/assets/ships/battleship-modern.glb';
import cruiserModernUrl from '@games/battleship/assets/ships/cruiser-modern.glb';
import submarineModernUrl from '@games/battleship/assets/ships/submarine-modern.glb';
import destroyerModernUrl from '@games/battleship/assets/ships/destroyer-modern.glb';

/**
 * Per-ship placement. The meshes come out of Blender in their own orientation
 * and scale, so each needs to be told which way is forward and how deep it
 * floats. `yaw` turns the model's long axis onto the board's +x; `sink` is the
 * fraction of hull height left below the waterline.
 */
interface ModelSpec {
  url: string;
  /** Radians about Y to bring the bow to +x. */
  yaw: number;
  /** Fraction of hull height left below the waterline. */
  sink: number;
  /** Material whose colour follows the player's fleet skin. */
  teamMaterial?: string;
  /**
   * Darkening factor on the team tint (default 1 — the skin colour as-is).
   * For hulls whose whole skin is the team material (the Virginia's anechoic
   * coat), a full-strength tint reads as a rubber toy; a deep shade keeps it
   * a black boat with the team's cast.
   */
  teamShade?: number;
  /**
   * Length multiplier on the standard cell-run fit. The flat 0.24-cell
   * clearance reads fine on a 5-cell carrier but swallows 12% of a 2-cell
   * destroyer, leaving the short hulls looking lost in their squares. Kept
   * small enough that a hull tip pokes at most a few hundredths of a cell
   * past its run — ships may be placed touching, and bows must not collide.
   */
  grow?: number;
}

const SPECS: Record<FleetEra, Partial<Record<ShipId, ModelSpec>>> = {
  classic: {
    carrier: {
      url: carrierClassicUrl,
      yaw: 0, // authored bow-along-x already
      sink: 0.18,
      // The Shōkaku wears its team colour on the antifouling band at the
      // waterline, like the rest of the classic navy.
      teamMaterial: 'Shokaku Antifouling',
    },
    battleship: {
      url: battleshipClassicUrl,
      yaw: 0,
      sink: 0.18,
      // The Iowa v5 wears its team colour on the antifouling band at the
      // waterline — the same convention as the carrier's waterline stripe.
      teamMaterial: 'Iowa V3 Antifouling Red',
    },
    cruiser: {
      url: cruiserClassicUrl,
      yaw: 0,
      sink: 0.18,
      // The Cleveland follows the Iowa's convention: team colour on the
      // antifouling band at the waterline.
      teamMaterial: 'Cleveland Antifouling Red',
    },
    submarine: {
      url: submarineClassicUrl,
      yaw: 0,
      // A surfaced U-boat rides decks-awash: far more hull under the water
      // than the surface ships.
      sink: 0.42,
      // No antifouling band on the Type VIIC — the aged lower hull is its
      // below-the-waterline paint, so that's where the fleet colour goes.
      teamMaterial: 'Type VIIC Aged Lower Hull',
      grow: 1.12,
    },
    destroyer: {
      url: destroyerClassicUrl,
      yaw: 0,
      sink: 0.18,
      // The Fletcher wears its colour on the waterline band like the rest of
      // the classic surface navy. (V7 renamed the material with its prefix.)
      teamMaterial: 'Fletcher V3 Antifouling',
      grow: 1.15,
    },
  },
  modern: {
    carrier: {
      url: carrierModernUrl,
      yaw: 0,
      sink: 0.18,
      // The Ford's team colour rides its waterline band, matching the
      // classic navy's convention.
      teamMaterial: 'Carrier Waterline',
    },
    battleship: {
      url: battleshipModernUrl,
      yaw: 0,
      sink: 0.18,
      teamMaterial: 'Kirov Antifouling',
    },
    cruiser: {
      url: cruiserModernUrl,
      yaw: 0,
      sink: 0.18,
      teamMaterial: 'Type 055 Antifouling',
    },
    submarine: {
      url: submarineModernUrl,
      yaw: 0,
      // A modern boat rides even lower than the U-boat — a black whale-back
      // with only the sail proud of the water.
      sink: 0.45,
      // No waterline band on the Virginia; the whole anechoic hull takes a
      // deep shade of the fleet colour (multiplied down in restyle below, so
      // it stays a black boat with the team's cast, not a rubber toy).
      teamMaterial: 'Virginia Anechoic Tile',
      teamShade: 0.5,
      grow: 1.12,
    },
    destroyer: {
      url: destroyerModernUrl,
      yaw: 0,
      sink: 0.18,
      teamMaterial: 'Hobart Antifouling',
      grow: 1.15,
    },
  },
};

const cache = new Map<string, THREE.Group>(); // key: `${era}:${shipId}`

/**
 * Load one era's ship meshes once. Resolves when all have arrived (or
 * failed) so the caller can rebuild the fleet with real hulls. Only the era
 * being sailed is decoded — the other navy costs nothing until picked.
 */
export async function loadShipModels(era: FleetEra = 'classic'): Promise<void> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const ids = Object.keys(SPECS[era]) as ShipId[];
  await Promise.all(
    ids.map(async (id) => {
      if (cache.has(`${era}:${id}`)) return;
      const spec = SPECS[era][id];
      if (!spec) return;
      try {
        const gltf = await loader.loadAsync(spec.url);
        cache.set(`${era}:${id}`, gltf.scene);
      } catch {
        // A missing or corrupt model must never take the scene down: the
        // caller falls back to procedural geometry for this hull.
      }
    }),
  );
}

/**
 * A board-ready instance of a ship, or null if its mesh isn't loaded.
 *
 * The model is normalised into the same convention the procedural ships use:
 * length along +x, centred on its cell span, waterline at y = 0. Everything
 * the artist made is kept; only the team material follows the skin colour
 * (and a sunk hull darkens all over).
 */
export function buildModelShip(
  id: ShipId,
  size: number,
  sunk: boolean,
  skinColor: string,
  era: FleetEra = 'classic',
): THREE.Group | null {
  const source = cache.get(`${era}:${id}`);
  const spec = SPECS[era][id];
  if (!source || !spec) return null;

  const model = source.clone(true);
  model.rotation.y = spec.yaw;

  // Measure after the yaw so "length" is the board's x axis.
  const box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());
  if (dims.x <= 0 || dims.y <= 0) return null;

  const target = (size - 0.24) * (spec.grow ?? 1); // standard clearance, per-ship fill
  const scale = target / dims.x;

  // Re-centre on the cell span and float the hull at the waterline.
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  model.position.y += dims.y * (0.5 - spec.sink);

  // Keep everything the artist made; only the team stripe follows the skin.
  const restyle = (m: THREE.Material): THREE.Material => {
    const std = m as THREE.MeshStandardMaterial;
    const isTeam = spec.teamMaterial !== undefined && m.name === spec.teamMaterial;
    if (!isTeam && !sunk) return m; // leave the artist's material untouched
    const next = std.clone();
    if (isTeam) next.color = new THREE.Color(skinColor).multiplyScalar(spec.teamShade ?? 1);
    if (sunk && next.color) next.color = next.color.clone().multiplyScalar(0.45);
    return next;
  };

  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    // Preserve arity: handing a single-material mesh an array of one makes
    // it render nothing, because three only uses arrays with geometry groups.
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(restyle)
      : restyle(mesh.material);
  });

  const hull = new THREE.Group();
  hull.add(model);
  hull.scale.setScalar(scale);
  return hull;
}
