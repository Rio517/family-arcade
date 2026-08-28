const RUDDER_RELEASE_MS = 140;

export function pulseRudder(setHeld, setTimer = globalThis.setTimeout) {
  setHeld(true);
  return setTimer(() => setHeld(false), RUDDER_RELEASE_MS);
}
