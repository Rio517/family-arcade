# Caribbean Strategic Sailing and Safe-Return Loop

**Date:** 2026-08-24
**Status:** Approved by standing product direction
**Branch:** `codex/caribbean-game`

## Outcome

Turn Bridgetown's disabled **Set Sail** action into the smallest durable career
loop that makes the existing port and naval battle belong to one game:

```text
Bridgetown
  -> authored eastbound sea leg
  -> Red Jackdaw contact: pursue or avoid
  -> existing full-bleed naval battle when pursued
  -> one persisted outcome
  -> safe return to Bridgetown
```

An avoided contact, a withdrawal, a separation, an escape, or a player loss
returns safely and leaves the Red Jackdaw lead active, so the player can make
another attempt while provisions and the lead's clock allow it. A decisive
player victory completes the one authored lead and closes Set Sail with a plain
reason. This is repeatable play, not an infinite fiction in which the same sunk
ship reappears.

This package is a shipping slice. It proves a coherent port-to-sea-to-battle
story with save/reload recovery, not a general navigation engine or a content
generator.

## Scope

The package adds exactly:

- a canonical Set Sail eligibility decision;
- one deterministic authored route east of Bridgetown;
- one explicit Continue east action on that route;
- one contact with the Red Jackdaw and the meaningful choice to pursue or
  avoid;
- campaign-owned generation of the existing naval input from campaign RNG and
  flagship facts;
- the approved full-bleed naval battle on the production route;
- explicit battle withdrawal, terminal resolution, safe return, and a compact
  Captain's Log outcome;
- autosave after each resolved campaign transition; and
- exact resume behavior for port, sailing, encounter, and naval modes.

The package explicitly defers prize fleets, capture allocation, a second port,
regional economies, conquest, romance, relationships, free-roaming 3D
overworld navigation, procedural traffic/content, retirement, a detailed
calendar, persistent tactical damage, repairs, specialist rules, and deeper
crew or morale systems. Boarding still ends at the existing
`boarding-ready` outcome; no sword duel follows.

Only landscape playfields at least `960x600` are supported. Phones and every
portrait viewport continue to show the existing blocking notice and mount no
campaign or battle session.

## Architecture Approaches

### Chosen: durable campaign phases plus a transient naval session

Use the already-reserved `CampaignMode` variants as persisted phase carriers.
Each user action appends one semantic event and atomically saves the resulting
journal. `naval` mode stores the exact `NavalBattleInput`; the real-time
`NavalSession` remains transient and mutates no campaign state. A validated
terminal naval summary becomes one campaign event only when the player chooses
**Return to Bridgetown**.

This is the simplest approach that survives reload at every seam, preserves
event replay, reuses the current writer/recovery machinery, and keeps 60 Hz
battle state out of campaign saves.

### Rejected: keep the whole voyage transient and append one final event

This would add little domain code, but reload during sailing, contact, or battle
would return to the prior port snapshot. It cannot satisfy pause/reload/resume
or safe recovery without a parallel browser-state record.

### Rejected: persist `NavalSession` checkpoints or command logs in the campaign

This could resume at the exact battle tick, but it couples campaign migrations
to opponent memory, reload work, event windows, and frame-session internals. It
also violates the existing rule that the campaign journal stores semantic
outcomes rather than tactical positions and commands. Exact-tick battle resume
is not required for this slice; deterministic restart from saved input is.

### Rejected: add a second `activeVoyage` save beside the campaign journal

A sidecar record avoids widening campaign validation but creates two authorities
and an atomicity problem across writer locks, current/previous rotation,
quarantine, and abandonment. Campaign mode is already the authoritative place
for this state.

## Canonical Voyage Contract

### Authored route

`src/games/caribbean/content/voyage.ts` owns the only route definition. These
values are product rules, not UI fixtures:

```ts
export const RED_JACKDAW_VOYAGE = {
  routeId: 'bridgetown-red-jackdaw',
  portId: 'bridgetown',
  bearingLabel: 'East by north',
  windLabel: 'Fresh trade wind from ENE',
  start: {
    tick: 0,
    position: { x: 0, z: 0 },
    heading: Math.PI / 2,
    elapsedDays: 0,
    provisionsUsed: 0,
  },
  contact: {
    tick: 3_600,
    position: { x: 24, z: 4 },
    heading: Math.PI / 2,
    elapsedDays: 1,
    provisionsUsed: 1,
  },
  returnCost: { elapsedDays: 1, provisionsUsed: 1 },
} as const;
```

The coordinates are local authored course coordinates, not Caribbean map data.
There is no collision, free steering, traffic clock, or hidden route
simulation. The fixed leg is deliberately honest about being one designed
passage.

### Set Sail readiness

`voyageReadiness(state)` is the only eligibility oracle. It returns `ready`
only when all canonical conditions are true:

1. mode is `port` at `bridgetown`;
2. the Red Jackdaw lead exists and is `active`;
3. `world.targetDefeated` is false;
4. the flagship record exists; and
5. the flagship carries at least two provisions, the exact outbound-plus-return
   cost.

The closed failure codes and UI copy are:

| Code | Player-facing reason |
| --- | --- |
| `not-in-bridgetown` | Return to Bridgetown before setting a new course. |
| `lead-not-active` | Mark the Red Jackdaw rumour in the Tavern first. |
| `target-defeated` | The Red Jackdaw lead is complete. |
| `flagship-unavailable` | The flagship record is unavailable. |
| `insufficient-provisions` | Buy at least 2 provisions for the round trip. |

React displays the selector result and never recreates these rules.

### Stable IDs and RNG lineage

The start event derives `voyageId = voyage-${state.lastEventId + 1}`. Contact
and battle IDs derive from it as `${voyageId}-contact` and
`${voyageId}-battle`; no clock, UUID, or random call participates.

The authored sea leg advances `state.rng.navigation` once with the existing LCG
`nextSeed`. Pursuit advances `state.rng.naval` once with the same helper and
uses the resulting uint32 as `NavalBattleInput.seed`. Both events record
`before` and `after`; reducers recompute and reject a mismatch. World RNG is
untouched.

## Campaign State and Events

### Backward-compatible state widening

The existing reserved `sailing`, `encounter`, and `naval` mode shapes become
valid. `capture`, `boarding`, `treasure`, `shares`, and `retired` remain invalid
at the persistence boundary because their resume screens do not ship here.

One optional compact summary is added beneath `world`:

```ts
export interface LastVoyageSummary {
  voyageId: string;
  battleId: string | null;
  result: 'avoided' | 'withdrew' | 'victory' | 'defeat' | 'unresolved';
  outcome: NavalOutcome | null;
  returnedDay: number;
}

world: {
  ports: Record<PortId, { prosperity: 'modest'; defense: 'guarded' }>;
  targetDefeated: boolean;
  lastVoyage?: LastVoyageSummary;
};
```

The field is optional solely for byte-compatible legacy V1 saves. New campaign
construction omits it until the first return. Every reducer-created return
sets it, so journal compaction retains the last outcome even after its event
array is checkpointed away. UI resolves prose from codes and naval facts; no
display sentence enters canonical state.

### Event union

The package adds six events:

```ts
type StrategicSailingEvent =
  | {
      type: 'voyage-started';
      payload: { voyageId: string };
    }
  | {
      type: 'sea-leg-completed';
      payload: {
        voyageId: string;
        encounterId: string;
        checkpoint: SailingCheckpoint;
        navigationRng: { before: number; after: number };
      };
    }
  | {
      type: 'encounter-avoided';
      payload: { voyageId: string; encounterId: string };
    }
  | {
      type: 'naval-engaged';
      payload: {
        voyageId: string;
        encounterId: string;
        battleId: string;
        navalRng: { before: number; after: number };
        input: NavalBattleInput;
      };
    }
  | {
      type: 'battle-withdrawn';
      payload: { voyageId: string; battleId: string };
    }
  | {
      type: 'naval-resolved';
      payload: {
        voyageId: string;
        battleId: string;
        resolution: NavalResolution;
      };
    };
```

`appendJournal` continues to derive `id` and `atDay`. UI constructs drafts
only through the pure helpers in `domain/voyage.ts`; event validation checks
untrusted syntax and the reducer checks predecessor-dependent semantics.

### Transition table

| Predecessor | Event | State effect |
| --- | --- | --- |
| Bridgetown port | `voyage-started` | enter `sailing` at the authored start checkpoint; close transient port activity |
| matching sailing | `sea-leg-completed` | spend 1 provision, advance 1 day and navigation RNG, enter matching `encounter` |
| matching encounter | `encounter-avoided` | spend return provision/day, write `lastVoyage: avoided`, return to Bridgetown |
| matching encounter | `naval-engaged` | advance naval RNG, persist exact canonical input, enter matching `naval` |
| matching naval | `battle-withdrawn` | spend return provision/day, write `lastVoyage: withdrew`, return to Bridgetown |
| matching naval | `naval-resolved` | validate the resolution, spend return provision/day, write summary, resolve lead when appropriate, return to Bridgetown |

Every transition checks matching voyage/encounter/battle IDs. Time and
provisions change together inside the reducer. No UI phase, naval callback, or
renderer directly changes them.

After a non-victory return, the lead becomes `expired` when the new campaign
day is at or beyond its exact `expiresDay`; otherwise it stays active. A player
victory sets `world.targetDefeated = true` and the lead to `completed`.

## Naval Handoff and Resolution

### One battle-input builder

`content/naval.ts` gains
`createRedJackdawBattleInput({ battleId, seed, player })`. It owns wind,
arena, time limit, objective, positions, and the Red Jackdaw ship definition.
`BATTLE_LAB_INPUT` is rebuilt through the same helper, while the campaign
passes a snapshot of its current flagship. This removes the current risk that
the lab and campaign silently copy different encounter numbers.

Aim legality remains in `domain/naval/geometry.ts`; boarding, surrender,
escape, and separation remain in `domain/naval/outcomes.ts`; damage and volley
rules remain in their existing modules. Strategic sailing never copies those
thresholds.

### Semantic terminal summary

`domain/naval/resolution.ts` is the naval domain's sole bridge from terminal
state to campaign fact:

```ts
export interface NavalResolution {
  battleId: string;
  outcome: NavalOutcome;
  atTick: number;
  seedAfter: number;
  player: { hull: number; sails: number; crew: number; cannon: number };
  opponent: { hull: number; sails: number; crew: number; cannon: number };
  decisive: NavalDecisiveFact;
}

export function summarizeNavalResolution(state: NavalState): NavalResolution;
export function validateNavalResolution(
  input: NavalBattleInput,
  value: unknown,
): { ok: true; value: NavalResolution } | { ok: false; issues: string[] };
```

`NavalDecisiveFact` is a discriminated union produced from the existing outcome
rules: surrendered ship and threshold fact, sunk ship and hull zero, boarding
range/relative-speed/sail/crew facts, escaped ship/radius/outward fact, or the
separation tick limit. Validation calls naval-owned rule helpers so campaign
code does not reproduce aim, boarding, or outcome thresholds.

The campaign reducer accepts only a terminal resolution whose battle ID equals
the persisted input and whose exact bounded facts validate against that input.
It does not accept a bare `NavalOutcome` from React.

### Safe-return ruling

The event records final tactical hull, sails, crew, and cannon, but this package
does not copy that damage into `fleet`. Persistent damage without repair,
replacement crew, tow, capture, or ship-loss decisions can strand a campaign
after one loss and contradict the requested safe repeatable return. On return,
the pre-battle flagship remains serviceable and the UI states that Bridgetown's
harbour crew made Mistral ready for the next departure. The real costs in this
slice are time, provisions, lead expiry, and target completion.

This is a deliberate bounded rule, not an accidental omission. The future
fleet/shipyard package must replace it in one migration-aware design rather
than partially applying damage here.

## Controller and Exactly-Once Ownership

`useCaribbean` keeps its existing writer, optimistic revision, consent,
conflict, recovery, and memory-only paths. It adds named controller methods
that create a draft from the current journal state and delegate to the same
`dispatch` function:

```ts
setSail(): Promise<CampaignDispatchOutcome>;
completeSeaLeg(): Promise<CampaignDispatchOutcome>;
avoidEncounter(): Promise<CampaignDispatchOutcome>;
engageEncounter(): Promise<CampaignDispatchOutcome>;
withdrawBattle(): Promise<CampaignDispatchOutcome>;
resolveBattle(resolution: NavalResolution): Promise<CampaignDispatchOutcome>;
```

The naval battle performs no campaign write while ticks are running. Terminal
outcome merely disables the deck and shows the result. The player then chooses
**Return to Bridgetown**. That button derives a `NavalResolution`, calls
`resolveBattle`, and disables synchronously until the promise settles.

Exactly-once behavior has four layers:

1. the button has a synchronous in-flight guard;
2. `busyRef` rejects a concurrent controller mutation;
3. the reducer requires matching current `naval` mode and battle ID; and
4. the first applied event returns to `port`, so the same draft is no longer a
   legal successor even in memory-only mode.

A save failure does not visually claim return. The existing consent/conflict
flow owns the pending candidate. **Continue without saving** publishes that
candidate once for the mounted session; **Reload external save** discards it;
retry uses the original expected revision. No battle component adopts a
revision or writes storage directly.

## Pause, Reload, Resume, and Abandonment

- Port, sailing, encounter, and naval campaign modes autosave before their
  corresponding screen is shown.
- Sailing and encounter contain no running simulation. Closing or backgrounding
  the tab changes nothing.
- `NavalSession` pauses when the document becomes hidden. Returning to the tab
  leaves it paused until the player resumes, preventing background catch-up.
- A normal in-memory pause resumes the same transient naval session.
- Reload in `naval` mode constructs a fresh `NavalSession` from the exact saved
  input. It starts again at tick zero with explicit copy: “Reloading restarts
  this engagement from first contact.” Exact-tick battle resume is not claimed.
- Resize into an unsupported viewport unmounts and disposes the session. Resize
  back constructs the same fresh duel from saved input.
- **Withdraw to Bridgetown** is available from the battle Options disclosure.
  It appends `battle-withdrawn`; it never fabricates an `escaped` naval outcome.
- Encounter **Avoid and return** appends `encounter-avoided`.
- The existing destructive **Abandon campaign** remains a storage recovery
  action, not a voyage shortcut. It quarantines the entire active journal,
  including any sailing/encounter/naval mode, through the current exact-revision
  protocol.
- Recovery of a valid previous snapshot resumes the exact mode contained in
  that snapshot. Recovery never auto-returns a voyage or invents a battle
  result.

## Failure Ownership

| Failure | Owner | Required behavior |
| --- | --- | --- |
| invalid voyage draft or predecessor | campaign domain | reject without partial state or save |
| invalid/tampered battle input | campaign reducer plus naval input validator | reject before entering naval mode |
| canonical naval drift | `NavalSession` | pause, show diagnostic, restart from saved input; append no campaign event |
| Three.js construction/render failure | existing naval viewport | keep the labelled HTML tactical chart and working battle rules |
| storage unavailable/lock denied | controller | require explicit memory-only consent; do not claim persistence |
| save conflict | controller | freeze writes; reload/export/memory-only choices remain authoritative |
| unreadable current/previous slot | storage recovery | preserve and quarantine exact raw bytes before mutation |
| invalid terminal resolution | naval resolution validator/campaign reducer | keep result unsaved and offer deterministic restart/withdrawal |
| unsupported screen | `MinimumScreenGate` | focused notice; no controller or naval session mounted |

## Experience and Visual Direction

The voyage pages continue the approved modern maritime identity instead of
imitating parchment or creating a miniature management dashboard.

### Token plan

- Deep Keel `#07151d`: night-ink structure and readable backplates.
- Harbour Glass `#0b3340`: lower sea and compact panels.
- Trade Wind `#4ec5c1`: wind/bearing information and focus.
- Sailcloth `#f1d6a1`: primary text.
- Brass `#c79a45`: authored route, chronology, and contact bearing.
- Signal Red `#d94b3d`: danger and destructive/withdrawal emphasis only.

Type roles stay with the established offline/system stack: Avenir Next
Condensed/Roboto Condensed/Arial Narrow for place and encounter headings,
Avenir Next/system sans for decisions, and system monospace for wind, bearing,
day, and ship telemetry. No font or asset download is added.

### Composition

```text
+------------------------------------------------------------------+
| BRIDGETOWN -> EAST BY NORTH       DAY / WIND / PROVISIONS         |
|------------------------------------------------------------------|
|                                                                  |
|  quiet open sky                    RED JACKDAW contact panel      |
|                                                                  |
|  Bridgetown o====== brass wake/course ======o contact            |
|                  small Mistral silhouette                         |
|                                                                  |
|  exact voyage consequence              [Avoid] [Pursue]           |
+------------------------------------------------------------------+
```

The signature is one functional brass wake line that changes from departure to
contact and encodes the actual authored sequence. It is not a decorative
compass. The sea is broad and quiet; compact opaque decision backplates carry
the information. Inline SVG supplies the sloop silhouette, wind arrow, and
course marks without introducing a remote image or a fake map.

The self-critique ruling is to avoid the existing abstract grid as the dominant
surface. It made pre-art Bridgetown feel futuristic. The voyage page instead
uses broad sky/sea colour, a period-readable one-mast silhouette, and one brass
route instrument. Motion is limited to a short wake reveal under
`no-preference`; reduced motion renders the final state immediately.

## Accessibility

- Every action remains a real button with a stable `data-testid`, visible
  focus, and at least `44x44` CSS pixels.
- The route SVG is decorative; a text sentence states origin, course, wind,
  cost, and contact.
- Pursue and avoid state their consequences before activation.
- Busy transitions expose one persistent polite status and prevent duplicate
  pointer/keyboard activation without moving controls.
- Contact focus moves to the encounter heading after the saved sea-leg event.
- Return focus lands on Set Sail or the Captain's Log outcome after return.
- Outcome, diagnostic, and pause dialogs preserve the existing modal/inert
  behavior and Escape rules.
- Text remains at least 14 px and all contrast is measured against opaque local
  backplates, not sampled open sea.
- Reduced motion removes wake reveal, sea drift, camera shake, bob, rapid
  particles, and dramatic camera movement without changing domain timing.
- Screen-reader copy uses port/starboard and named bearings, never only
  left/right or colour.

## Save, Replay, and Migration Policy

The package deliberately keeps:

- `CampaignStateV1.schemaVersion === 1`;
- `contentVersion === 'caribbean-slice-1'`;
- save envelope `version === 1`; and
- the exact `current` and `previous` storage keys.

No transform is justified because no existing field is removed, renamed,
reinterpreted, narrowed, or newly required. The foundation explicitly permits
validation widening for reserved mode discriminants. Optional
`world.lastVoyage` lets old port saves remain byte-valid without normalization.
`migrateSaveEnvelope` therefore remains an exhaustive V1 identity dispatcher.

Compatibility requirements are exact:

- an existing port save loads without a byte rewrite;
- existing Voyage/Legend values remain valid compatibility values;
- appending the first new event to an old save produces valid replay and rotates
  the untouched old current raw into previous;
- a returned journal compacts to its state and preserves `lastVoyage`, RNG,
  calendar, provisions, target, lead, and monotonic `lastEventId`;
- append after compaction continues at `lastEventId + 1`;
- current/previous recovery works for sailing, encounter, and naval snapshots;
  and
- a future unknown envelope or state schema remains unreadable and preserved.

Checkpoint replay starts from any validated `initial.lastEventId`; new events
must not assume a campaign began at event zero.

## Testing and Evidence

### Domain and mutation resistance

- literal Set Sail readiness cases for every closed reason;
- exact authored checkpoint, two-provision round trip, day advance, lead expiry,
  and RNG before/after;
- wrong mode/ID/checkpoint/RNG/input/resolution rejection with no mutation;
- battle input equality between authored builder, campaign transition, and
  `BATTLE_LAB_INPUT` defaults;
- one terminal summary for every naval outcome branch;
- mutations of boarding, aim, surrender, and escape thresholds caught in their
  existing naval source-of-truth tests rather than copied campaign assertions;
- avoid, withdraw, defeat, unresolved, and victory returns;
- victory alone completes the lead and target; and
- replay/compaction/migration/recovery from nonzero checkpoints and every newly
  accepted mode.

### Controller and component proof

- each named action delegates exactly one draft through existing writer logic;
- duplicate clicks, StrictMode effects, late promises, storage failures,
  conflicts, memory consent, runtime replacement, and external reload never
  apply a result twice;
- Set Sail reason/enablement, focus, encounter choices, status, Captain's Log,
  and exact mode routing;
- campaign battle uses the same `NavalBattlePage`, full-bleed scene, controls,
  HTML fallback, audio, outcome, and diagnostics;
- campaign result action returns while Battle Lab's default remains rematch;
- hidden document pauses, visible return stays paused, reload restarts from
  byte-identical input, and unsupported resize disposes the session; and
- no campaign event occurs between `naval-engaged` and withdrawal/resolution.

### Deterministic browser evidence

Extend the normal-route Caribbean evidence to schema version 3 while retaining
every version-2 field and adding one exact `strategicSailing` branch. Run twice
from clean localStorage with fixed seed/clock/UUID boundaries. The gate drives:

1. create campaign and mark the Red Jackdaw lead;
2. enable Set Sail and persist `sailing`;
3. reload/resume sailing;
4. reach and persist the encounter;
5. avoid and verify safe return/outcome;
6. depart again, pursue, and verify byte-equal saved naval input;
7. reload and prove a fresh tick-zero battle from that input;
8. resolve through real naval rules, not a component-only victory switch;
9. save exactly one terminal campaign event and return to Bridgetown;
10. reload, inspect Captain's Log, and verify the completed lead/disabled Set
    Sail state; and
11. corrupt/recover an active intermediate snapshot without losing raw bytes.

Record normal screenshots for sea leg, encounter, campaign battle, result,
returned log, exact `960x600`, HTML battle fallback, and unsupported portrait.
The gate measures 14 px text, 44 px targets, contrast, focus, clipping,
horizontal overflow, request/page/console failures, event counts, mode sequence,
RNG lineage, input checksum, exactly-once resolution, reload restart, recovery,
and two-run byte identity.

Normal production now intentionally contains a lazy production naval chunk and
the precached local sloop GLB. Isolation changes from “naval absent” to:

- no `CaribbeanLab`, debug bridge, preview HTML, or harness-only module marker
  in the normal route;
- naval JS/CSS/GLB is not requested on setup, port, sailing, or avoid paths;
- pursuing the encounter loads it locally with no remote request; and
- `BUILD_HARNESS=1` still builds and passes its independent naval gate.

Headless Chromium evidence remains engineering evidence. Human first-time
comprehension and target-iPad Safari/touch/thermal/offline observations remain
explicitly unobserved unless a person performs them.

## Delivery Boundary

Completion means the normal production route delivers the saved Bridgetown ->
sea -> decision -> battle -> outcome -> Bridgetown story with zero-finding
review and deterministic evidence. It does not authorize merge, push, content
expansion, or a claim that the still-missing human/iPad naval gate has passed.
