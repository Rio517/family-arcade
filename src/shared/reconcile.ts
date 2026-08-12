/**
 * Given our event log and a peer's, return the authoritative one.
 *
 * Invariant (shared by every log-reconciling game): each log position is
 * written by exactly one peer, and both peers process events in the same
 * order, so one honest log is always a prefix of the other. The longer log
 * therefore supersedes the shorter with no merge conflict; on a tie we keep
 * our own copy so the result is stable and idempotent.
 *
 * We only adopt a longer peer log when it genuinely *extends* ours — the
 * caller supplies the game's own `isPrefix` equality. A longer log that
 * diverges from our history can't have come from an honest peer following the
 * invariant (it's corrupt or forged), so we keep our own rather than let it
 * overwrite a valid game. Shape validation happens earlier, in each game's
 * message guard; this is the consistency check on top of it.
 *
 * This function existed byte-identically in battleship's and chess's
 * protocols; it lives here so the invariant has exactly one home. It sits at
 * the shared root (not shared/net) because domain code imports it and the
 * domain layer stays free of transport imports.
 */
export function reconcileLogs<T>(
  ours: T[],
  theirs: T[],
  isPrefix: (short: T[], long: T[]) => boolean,
): T[] {
  return theirs.length > ours.length && isPrefix(ours, theirs) ? theirs : ours;
}
