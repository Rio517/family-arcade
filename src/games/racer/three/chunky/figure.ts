/**
 * What a racer is made of before it is rigged: rigid parts and where their
 * hinges sit. `index.ts` turns a Figure into a Rider.
 */
import type { Part, V3 } from './kit';

/** A rigid part on its own hinge at `at`, in the figure's frame. */
export interface Hinge {
  part: Part;
  at: V3;
}

export interface Wings {
  /** The left wing (+x) first. */
  parts: [Part, Part];
  /** The left hinge; the right one mirrors it. */
  at: V3;
  /** Resting lift (radians about the body's long axis), and how far a flap swings. */
  rest: number;
  amp: number;
  /** Folded away to nothing until a wings power-up opens them (the cloud). */
  folded?: boolean;
}

export interface Figure {
  body: Part;
  /** Tilts and nods; `lift` turns it up while the body leans into the wind. */
  head?: Hinge & { lift?: number };
  /** A seated rider's head, which tilts on its own. */
  rider?: Hinge;
  wings: Wings;
  /** Sways side to side. */
  tail?: Hinge;
  /** Fixed forward lean in flight (radians, head forward), about the height `leanAbout`. */
  lean?: number;
  leanAbout?: number;
}

/**
 * A rider climbing on: draws their body into the mount's body at `seat` and
 * returns their head on its own hinge.
 */
export type Rides = (body: Part, seat: V3) => Hinge;
