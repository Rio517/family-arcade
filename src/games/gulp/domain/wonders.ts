/**
 * Which wonders a round gets. They are dealt from a shuffled deck that
 * carries over from round to round, so every wonder turns up once before
 * any comes back. The page keeps the deck in storage; this is the pure part.
 */
import { KINDS, type PropKind } from './catalog';

type Rng = () => number;

/** Every wonder there is. */
const ALL_WONDERS: readonly PropKind[] = (Object.keys(KINDS) as PropKind[]).filter((k) => KINDS[k].wonder);

function shuffled(list: readonly PropKind[], rng: Rng): PropKind[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deal `n` wonders from the deck. When it runs out, a fresh shuffle of all
 * of them follows, never repeating one already dealt this round.
 */
export function dealWonders(deck: readonly PropKind[], n: number, rng: Rng): { dealt: PropKind[]; deck: PropKind[] } {
  const rest = deck.filter((k) => ALL_WONDERS.includes(k));
  const dealt: PropKind[] = [];
  while (dealt.length < n) {
    if (!rest.length) rest.push(...shuffled(ALL_WONDERS.filter((k) => !dealt.includes(k)), rng));
    if (!rest.length) break;
    dealt.push(rest.shift() as PropKind);
  }
  return { dealt, deck: rest };
}
