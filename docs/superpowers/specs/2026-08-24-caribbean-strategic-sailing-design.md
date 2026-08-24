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

When several conditions fail, the selector returns the first failure in this
exact precedence: `not-in-bridgetown`, `target-defeated`, `lead-not-active`,
`flagship-unavailable`, `insufficient-provisions`. Target completion must
outrank lead status because a victory intentionally makes the lead
`completed`; the resulting instruction must never tell the player to accept an
already-completed rumour. The closed failure codes and UI copy are:

| Code | Player-facing reason |
| --- | --- |
| `not-in-bridgetown` | Return to Bridgetown before setting a new course. |
| `target-defeated` | The Red Jackdaw lead is complete. |
| `lead-not-active` | Mark the Red Jackdaw rumour in the Tavern first. |
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

### Canonical intermediate-mode validity

Because `compactJournal` may turn the current state into an event-free,
authoritative checkpoint, each accepted strategic mode must be reachable from
the one authored route without consulting an earlier event. Validation uses
`RED_JACKDAW_VOYAGE`, `createRedJackdawBattleInput`, the current flagship, and
the current `lastEventId`; it does not duplicate their literals in storage
code.

| Mode | Exact invariants at validate/load/compact/recover boundaries |
| --- | --- |
| `sailing` | `voyageId === voyage-${lastEventId}`; checkpoint is deeply equal to `RED_JACKDAW_VOYAGE.start`; active Red Jackdaw lead; undefeated target; current flagship exists; flagship has at least 2 provisions. |
| `encounter` | `voyageId === voyage-${lastEventId - 1}`; `encounterId === ${voyageId}-contact`; `returnCheckpoint` is deeply equal to `RED_JACKDAW_VOYAGE.contact`; active lead; undefeated target; current flagship exists; at least 1 provision remains for the guaranteed return. |
| `naval` | `voyageId === voyage-${lastEventId - 2}`; `battleId === ${voyageId}-battle`; wrapper and `input.battleId` both equal that ID; `returnCheckpoint` deeply equals the authored contact; active lead; undefeated target; current flagship exists; at least 1 provision remains; `input.seed === rng.naval`; and the entire input deeply equals `createRedJackdawBattleInput({ battleId, seed: rng.naval, player: currentFlagshipSnapshot })`. |

The arithmetic requires a positive safe integer result; underflow is invalid.
The full builder comparison covers stable ship IDs, names, class, positions,
headings, systems, wind, arena, objective, and time limit. Unknown or extra
keys remain invalid.

The compatibility matrix is mandatory for each of `sailing`, `encounter`, and
`naval`:

| Operation | Required positive case | Required mutation failures |
| --- | --- | --- |
| direct validation | exact literal reachable state accepted | route checkpoint; lineage ID; active lead; undefeated target; flagship; guaranteed return provision; plus naval RNG/input equality where applicable |
| save/load | save envelope round-trips canonical equality | one invariant mutation in `current` rejects without rewriting raw bytes |
| compact/load | compacted nonzero `initial.lastEventId` loads with empty events and canonical equality | the same per-mode mutations in the compacted `initial` reject even though no predecessor event exists |
| corrupt-current recovery | exact previous intermediate snapshot resumes its same mode | mutated previous is not promoted; both exact raw slots remain exportable/quarantinable |

Port-only legacy V1 bytes remain accepted without `lastVoyage`; this strictness
applies only to newly accepted active modes.

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

`LastVoyageSummary.result` uses this exhaustive mapping; campaign code has no
second interpretation:

| Return fact | Stored `result` | Lead/target effect |
| --- | --- | --- |
| encounter avoided | `avoided` | active unless the return day expires it; target undefeated |
| battle withdrawn | `withdrew` | active unless the return day expires it; target undefeated |
| `surrender`, `sunk`, or `boarding-ready` with `victorShipId: 'player'` | `victory` | lead completed; target defeated |
| `surrender`, `sunk`, or `boarding-ready` with `victorShipId: 'opponent'` | `defeat` | active unless expired; target undefeated |
| `escaped` with either `shipId` | `unresolved` | active unless expired; target undefeated |
| `separated` with either `shipId` | `unresolved` | active unless expired; target undefeated |

Opponent escape is not a strategic victory, and player escape is not a stored
defeat: neither resolves the authored target.

## Naval Handoff and Resolution

### One battle-input builder

`content/naval.ts` gains
`createRedJackdawBattleInput({ battleId, seed, player })`. It owns wind,
arena, time limit, objective, positions, and the Red Jackdaw ship definition.
`BATTLE_LAB_INPUT` is rebuilt through the same helper, while the campaign
passes a snapshot of its current flagship. This removes the current risk that
the lab and campaign silently copy different encounter numbers.

Builder tests compare the entire `NavalBattleInput` with `toEqual`, including
every player and opponent field. They include a damaged non-default flagship
and prove each call owns fresh nested position objects; partial object matching
is not sufficient for this persistence boundary.

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
`atTick` is an integer in `0..input.timeLimitTicks`. Each final hull, sails,
crew, and cannon value is an integer no lower than zero and no greater than
that same ship's saved input value; combat cannot heal or add crew/cannon. The
validator rejects a value that is within class maximum but above its own
engagement input. It does not accept a bare `NavalOutcome` from React.

### Safe-return ruling

The event records final tactical hull, sails, crew, and cannon, but this package
does not copy that damage into `fleet`. Persistent damage without repair,
replacement crew, tow, capture, or ship-loss decisions can strand a campaign
after one loss and contradict the requested safe repeatable return. On return,
the pre-battle flagship remains serviceable. Every naval result shown in the
Captain's Log includes this exact player-facing sentence:
“Bridgetown’s harbour crew made Mistral ready for the next departure; the
battle outcome remains in this log, but its damage is not carried onto the
ready flagship.”
The real costs in this slice are time, provisions, lead expiry, and target
completion.

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
2. a separate synchronous named-action gate stores an invocation token plus the
   controller generation before reading state or constructing a draft and
   remains held through dispatch settlement in persisted and memory-only modes;
3. the reducer requires matching current `naval` mode and battle ID; and
4. the first applied event returns to `port`, so the same draft is no longer a
   legal successor even in memory-only mode.

`busyRef` continues to own writer/runtime serialization; it is not reused as
the named-action guard because memory-only dispatch does not set it. A runtime
replacement resets the gate for the new generation. An old invocation releases
only when both its token and generation still own the gate; stale completion A
cannot clear new-runtime invocation B and admit C. Direct domain draft-helper
calls throw on a wrong predecessor. Named controller actions normalize an
expected wrong-predecessor/domain-precondition failure to
`{ kind: 'not-applied' }`; simultaneous duplicate promises both fulfill,
exactly one may be `applied`, and none rejects as an exact-once mechanism.
Unexpected implementation errors still reject and remain test-visible.

A save failure does not visually claim return. The existing consent/conflict
flow owns the pending candidate. **Continue without saving** publishes that
candidate once for the mounted session; **Reload external save** discards it;
retry uses the original expected revision. No battle component adopts a
revision or writes storage directly.

An active predecessor route remains mounted whenever a journal exists and the
persistence phase becomes `consent-required` or `save-conflict`.
`CaribbeanPage` renders the current port/sailing/encounter/naval screen plus a
top-level accessible persistence decision dialog; it does not replace the
route with the commission form. The dialog makes the route inert, takes focus,
and returns focus to the initiating control when dismissed. For a terminal
battle, the transient session and result modal remain mounted beneath it:

- **Continue without saving** publishes the pending port candidate once and
  only then unmounts the naval route;
- **Reload newer save** discards the candidate and shows the externally loaded
  route; if it is the same naval predecessor, the existing terminal modal is
  still present and can retry Return;
- export never publishes or changes route state; and
- a further save/lock conflict keeps the same predecessor and candidate
  ownership.

No UI infers return until `controller.journal.state.mode.kind === 'port'`.

All transient consequences of an event live at one campaign-candidate
publication boundary, not on the initiating named-action promise. Its input is
exactly `{ predecessor, publishedJournal, appendedEvent }`. `appendedEvent` is
captured from the original single-event candidate before persistence;
`publishedJournal` is the journal actually adopted by memory or returned by
the writer. The boundary adopts `publishedJournal` and applies the event token
`{ campaignId, id: appendedEvent.id, type: appendedEvent.type }` at most once
per controller generation:

- `voyage-started` resets port activity to `menu`;
- `encounter-avoided`, `battle-withdrawn`, and `naval-resolved` set one-shot
  `portFocusTarget: 'last-voyage'`; and
- every other event has no transient effect.

An immediate persisted save adopts `outcome.journal`, including an event-free
threshold-compacted result, while still consuming the original appended event.
Direct memory-only dispatch and delayed **Continue without saving** use the
same input shape with their memory candidate as `publishedJournal`. A later
retry may replace that live memory journal with the writer's compacted journal,
but the retained appended-event token is already consumed and cannot apply its
activity/focus effect again. Repeated consent and conflict refresh behave the
same. Pending, denied, failed, and conflicted candidates have no transient
effect before publication; external reload discards the candidate and event
without applying it.

The threshold proof uses only reducer-legal histories. The departure history
is event 1 `lead-accepted`, events 2–256 as 255 alternating valid Bridgetown
provision trades, and event 257 `voyage-started`. The resolution history is
event 1 `lead-accepted`, events 2–253 as 252 alternating valid Bridgetown
provision trades, event 254 `voyage-started`, event 255
`sea-leg-completed`, event 256 `naval-engaged`, and the matching event 257
`naval-resolved`. For each history, both immediate save and denied save ->
memory publication -> retry must end with `events: []`, canonical/deep equality
between `initial` and `state`, and distinct `initial !== state` object
references. Live/saved canonical equality and the triggering activity/focus
effect exactly once remain mandatory.

Set Sail is governed only by `voyageReadiness`, even while any Governor,
Tavern, Market, Shipyard, Shares, or Log activity is open. Before candidate
publication, activity/focus remain exactly as they were. The publication
boundary above owns departure clearing and return focus whether publication is
immediate or delayed by consent. On a reload/resume directly into port,
`PortPage` focuses Set Sail when readiness is `ready`; otherwise it focuses
Captain's Log when `lastVoyage` exists, falling back to the harbour heading
only when neither is applicable. Consuming focus intent never mutates the
journal.

### Terminal resolution presentation states

The campaign wrapper distinguishes three terminal presentations:

| State | Modal actions | Campaign effect |
| --- | --- | --- |
| valid terminal summary, no dispatch pending | campaign-specific result copy plus **Return to Bridgetown** only | none until Return |
| Return dispatch is `not-applied` because consent/conflict is pending | same terminal modal remains beneath the persistence dialog | pending candidate remains controller-owned |
| summary/validation/reducer contract error before a candidate exists | `Battle result could not be verified.` plus **Restart engagement** and **Withdraw to Bridgetown** | restart rebuilds transient session from saved input; withdraw appends `battle-withdrawn`; no automatic dispatch |

The invalid-resolution escape hatch is intentionally different from a normal
terminal result. It never displays Battle Lab copy. Restart clears only the
transient error/session; withdrawal is available only in this explicit error
branch or from nonterminal Options, never beside a valid Return action. Focus,
inert background behavior, and diagnostics remain modal-safe.

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
- Resize into an unsupported viewport unmounts the entire controller and
  disposes the session; only the focused notice remains. The outer minimum-
  screen gate retains no controller but increments a support generation when
  an unsupported viewport becomes supported again. That generation tells the
  newly mounted controller to auto-resume the already loaded persisted journal
  even when the URL lacks `?resume=1`. A saved naval route therefore returns
  automatically as a new session at tick zero from byte-identical input with
  the first-contact restart disclosure. Empty/unreadable storage still follows
  setup/recovery and never fabricates a resume.
- **Withdraw to Bridgetown** is available from the battle Options disclosure.
  For a nonterminal battle, the wrapper calls `session.setPaused(true)`
  synchronously before invoking `withdrawBattle`, so no RAF tick overlaps the
  writer wait. Applied publication unmounts to port. Writer denial, write
  failure, or conflict keeps the predecessor battle mounted and paused beneath
  the decision overlay. Memory consent publishes and unmounts; external reload
  either replaces the route or retains the reloaded naval predecessor paused;
  an unexpected rejection keeps it paused with explicit Retry withdrawal and
  Resume battle choices. Nothing auto-resumes. Terminal-error withdrawal is
  already terminal and is asserted separately. Withdrawal appends
  `battle-withdrawn`; it never fabricates an `escaped` naval outcome.
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
| save conflict | controller plus active-route persistence dialog | freeze writes; keep predecessor route/result mounted; reload/export/memory-only choices remain authoritative |
| unreadable current/previous slot | storage recovery | preserve and quarantine exact raw bytes before mutation |
| invalid terminal resolution | naval resolution validator plus campaign result-error modal | keep result unsaved; show campaign-specific error; offer deterministic restart/withdrawal |
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

`validateJournal` evolves a validated state through events in order. It checks
the next literal ID, then calls `reduceCampaign(current, event)`; the reducer is
the only owner of `event.atDay === current.calendar.elapsedDays` and of each
transition's day change. Replay validation does not compare every event to the
initial day or duplicate which event advances time. The canonical direct
stream includes event days `0 -> 1 -> 2`; a post-leg event stamped day 0 is
invalid, and the same rule starts from a nonzero compacted checkpoint/day.

## Testing and Evidence

### Domain and mutation resistance

- literal Set Sail readiness cases for every closed reason;
- literal post-victory readiness proves `target-defeated` outranks the completed
  lead's `lead-not-active` condition;
- exact authored checkpoint, two-provision round trip, day advance, lead expiry,
  and RNG before/after;
- exact per-mode save/compact/load/recover matrix plus wrong
  mode/ID/checkpoint/lead/target/provision/RNG/input rejection with no mutation;
- battle input equality between authored builder, campaign transition, and
  `BATTLE_LAB_INPUT` defaults, using whole-object equality and damaged inputs;
- one terminal summary for every naval outcome branch;
- resolution system monotonicity against each saved ship input and exact time
  limit enforcement;
- mutations of boarding, aim, surrender, and escape thresholds caught in their
  existing naval source-of-truth tests rather than copied campaign assertions;
- every row of the exhaustive outcome-to-result table plus avoid and withdraw;
- victory alone completes the lead and target; and
- replay/compaction/migration/recovery from nonzero checkpoints and every newly
  accepted mode.

### Controller and component proof

- each named action delegates exactly one draft through existing writer logic;
- simultaneous duplicates in persisted and memory-only modes fulfill with at
  most one applied result and no duplicate-promise rejection;
- in both persistence modes, literal invocation A acquires generation 1,
  runtime replacement resets to generation 2, B acquires generation 2, stale
  A settles, C is rejected while B remains owner, and only B can release;
- duplicate clicks, StrictMode effects, late promises, storage failures,
  conflicts, memory consent, runtime replacement, and external reload never
  apply a result twice;
- departure clearing and return focus occur exactly once at candidate
  publication for immediate saved, direct memory, and delayed consent paths;
  denial, write failure, conflict, retry, repeated consent, and reload-discard
  prove zero early or duplicate transient effects;
- for both exact legal departure and naval-resolution histories at
  `JOURNAL_EVENT_LIMIT + 1`, immediate saved publication adopts an event-free,
  deep-equal/reference-distinct checkpoint while consuming the original event
  once; denied-save memory publication consumes it once, and a later compacting
  retry adopts that checkpoint without consuming it again;
- consent/conflict uses an active-route modal and preserves a terminal battle
  result until the pending candidate is published or discarded;
- Set Sail reason/enablement, focus, encounter choices, status, Captain's Log,
  and exact mode routing;
- every naval `lastVoyage` keeps its terminal outcome in the log while the
  flagship remains byte-unchanged and the exact harbour-readiness sentence is
  visible;
- successful departure from every open port activity clears it only after
  publication; all return paths and reload have the exact focus rules above;
- campaign battle uses the same `NavalBattlePage`, full-bleed scene, controls,
  HTML fallback, audio, outcome, and diagnostics;
- campaign result action returns while Battle Lab's default remains rematch;
- invalid campaign resolution uses restart/withdraw error actions while a valid
  result exposes Return only;
- hidden document pauses, visible return stays paused, reload restarts from
  byte-identical input, and unsupported resize disposes the session; and
- an unsupported-to-supported transition on a fresh route has no controller
  under the notice, then automatically resumes the persisted naval journal as
  a new tick-zero session with byte-identical input and restart disclosure; and
- nonterminal withdrawal pauses synchronously before a deferred writer can
  observe even one more RAF tick, and every applied/pending/conflict/rejection/
  reload branch keeps the pause/unmount contract above; and
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
returned log, exact `960x600`, HTML battle fallback, unsupported portrait, and
the unsupported naval-resize notice.
The voyage UI commit owns and stages the four sea/encounter/minimum/portrait
screenshots after its normal-production browser pass. The battle UI commit owns
and stages the five battle/result/log/fallback/resize screenshots after its
normal-production browser pass. The final evidence task may recapture the same
nine files cumulatively; it does not defer either UI commit's browser proof.
The gate measures 14 px text, 44 px targets, contrast, focus, clipping,
horizontal overflow, request/page/console failures, event counts, mode sequence,
RNG lineage, input checksum, exactly-once resolution, reload restart, recovery,
and two-run byte identity.

The normal victory is driven through public battle controls by one committed
golden command trace for the exact second-voyage input produced from campaign
seed `1702`: `voyage-5-battle`, naval seed `1971161494`, Mistral
`100/100/50/8`, and the authored Red Jackdaw. The trace samples the existing
`captureCaptain` policy at six-tick HUD boundaries but is stored as literal
JSON; the browser never imports the test captain or calls a session/debug
bridge. A pure replay test locks the trace to `boarding-ready` for `player` at
tick `11855`, `seedAfter: 1310878278`, player `78/61/44/8`, and opponent
`88/14/9/8`.

`BattleHud` exposes a visible elapsed-engagement value with a read-only exact
tick attribute. The clock fixture order is locked: install the context seed,
UUID, lock, and storage fixtures; create the page; install Playwright's clock;
install the page-scoped `Date.now` fixture after that clock; navigate; and
assert the recorded campaign timestamp consumed the page fixture. Pause the
clock on the encounter before activating Pursue, so the real `NavalSession`
is constructed and mounted under the installed paused clock. Mount must expose
tick 0. The first `page.clock.runFor(16)` only primes the first RAF and must
still expose tick 0.

The winning driver applies each trace row through rendered public controls.
Held/released keyboard input drives rudder, and the rendered sail,
ammunition, and fire controls drive their commands. It then advances one real
RAF quantum at a time with `page.clock.runFor(16)`, reading the public HUD
after each quantum until it observes exactly the next six-tick boundary or
the exact terminal tick `11855`. It never equates 100 milliseconds with six
simulation ticks. A skipped boundary, unexpected tick, different input, or
non-player-victory outcome fails closed. The real-session integration covers
the tick-zero mount, first-RAF priming, reload/remount at tick zero, a terminal
tick in the middle of a six-tick cadence, the held-key rudder path, the
rendered rudder button's existing 140 ms release timer, and exact
`nowConsumed`. A real Node wall timer—not the installed browser clock—aborts
each victory run after `330_000ms`; the two-clean-run package budget is eight
minutes. The suite observes a pure scheduler RED, then a real-browser
truncated-trace RED, before either implementation turns green.

`caribbean:naval-check` has three required, mutually exclusive modes:

- `--semantic-probe` generates into a uniquely created temporary directory,
  runs the real harness and semantic evaluator, never compares provenance or
  tracked bytes, cleans the directory in `finally`, and exits 0 with exactly
  `NAVAL_SEMANTIC_PROBE_OK tracked=stale` or
  `NAVAL_SEMANTIC_PROBE_OK tracked=current` when semantics pass. Current/stale
  is determined only from source plus stable manifest, never variable
  observations;
- `--capture` requires a clean tracked Task 6 HEAD, writes through
  `saveIfChanged` only to `docs/screenshots/caribbean-naval`, and exits 0 with
  `NAVAL_CAPTURE_OK head=<sha> changed=<n>`; and
- `--verify` is the post-capture/post-commit gate. It generates into a unique
  temporary directory, validates semantics, requires the tracked capture HEAD
  to be an ancestor, requires the current source-file manifest and source hash
  to match the capture, and requires a clean tracked worktree. It then compares
  canonical bytes for a deterministic `stableManifest`, while separately
  range-validating the fresh observational metrics and artifact manifest. It
  cleans the exact temporary directory in `finally` and exits 0 only with
  `NAVAL_VERIFY_OK capture=<sha> source=<sha> artifacts=<n>`.

The source provenance set is the deterministic transitive tracked-local
dependency closure of the package's selected source/build entries. It is not a
curated final file list. Start with the sorted, NUL-delimited result of
`git ls-files -z --` over these exact seed pathspecs:

```text
package.json
package-lock.json
vite.config.ts
tsconfig.json
tsconfig.app.json
tsconfig.node.json
knip.json
index.html
preview-caribbean-game.html
scripts/caribbean-port-check.mjs
scripts/caribbean-naval-check.mjs
scripts/fixtures/caribbean-campaign-victory.json
:(glob)scripts/lib/caribbean-naval-*.mjs
:(glob)scripts/lib/caribbean-port-identity-*.mjs
:(glob)scripts/lib/caribbean-campaign-*.mjs
:(glob)src/games/caribbean/**
:(glob)public/**
```

Build one universe from `git ls-files -z` and resolve recursively from those
seeds until a fixed point. TypeScript's compiler API extracts static
`import`/`export ... from`, side-effect imports, import-type nodes, literal
dynamic imports, literal `require`, triple-slash path references, and literal
local-file `new URL('./asset', import.meta.url)` edges from tracked
`.ts/.tsx/.js/.jsx/.mjs/.cjs` files. HTML extraction covers local module-script
`src` plus local stylesheet/icon/manifest `href`; CSS extraction covers local
`@import` and `url(...)`. Resolution strips query/hash, supports the repository
aliases `@shared`, `@games`, `@app`, and `@test`, checks exact files plus
`.ts/.tsx/.js/.jsx/.mjs/.cjs/.json/.css/.glb/.webp/.svg/.png/.woff2` and
`index.*`, maps root `/src/...` to the repository and root/public HTML/CSS
assets to `public/...`. Load alias keys/targets from `tsconfig.app.json` and
require the `vite.config.ts` alias object to match them; literal tests lock the
current `@shared`, `@games`, `@app`, and `@test` mappings. Ignore `node:` and a
bare package specifier only when its package root exists in `package.json`
dependencies/devDependencies/peerDependencies/optionalDependencies; an unknown
bare type-only specifier may instead match its declared `@types` package
(`pkg` -> `@types/pkg`, `@scope/pkg` -> `@types/scope__pkg`). Any other unknown
bare/alias-like specifier fails `source-files`. Package versions remain covered
by the seeded `package.json`/lockfile.
Directory-valued `fileURLToPath(new URL(...))` alias roots in `vite.config.ts`
must resolve to tracked-source directories and are audited as resolver roots,
not added as file rows; any other local file reference must resolve to a file.

Every extracted local edge must resolve to exactly one tracked path, and every
resolved target is enqueued and included. An unresolved/ambiguous local edge,
nonliteral dynamic import/require, any unsupported `import.meta.glob`, duplicate
path, or local edge whose target is absent from the final set fails
`source-files`; no audit warning is allowed.
Tests inject a new tracked transitive import and require the closure to grow,
then delete its target and require fail-closed rejection. They separately
exercise HTML -> `/src/app/main.tsx`, TypeScript -> CSS, CSS -> asset, alias,
extension, directory-index, alias-config agreement, and declared-package
resolution.

Unsupported loader syntax has an exact, observable contract. The source audit
throws `CaribbeanNavalSourceAuditError` with `code: 'source-files'`, the
repository-relative `importer`, and exactly one `diagnostic`:
`nonliteral-dynamic-import`, `nonliteral-commonjs-require`, or
`unsupported-import-meta-glob`. Its exact message is
`CARIBBEAN_SOURCE_AUDIT_FAILED source-files diagnostic=<diagnostic> importer=<path>`.
Before collector implementation, three independent tracked temporary-repository
fixtures register as separate native tests:

```js
// src/games/caribbean/dynamic.mjs
const target = './dependency.mjs';
void import(target);

// src/games/caribbean/commonjs.cjs
const target = './dependency.cjs';
require(target);

// src/games/caribbean/glob.ts — even a literal pattern is unsupported
const modules = import.meta.glob('./views/*.tsx');
```

Each fixture also tracks the apparently referenced dependency so only its
parser guard can own the failure. The named tests assert their distinct
diagnostic/message, not only the shared `source-files` code. With each fixture
injected as the collector root, all three CLI modes fail before harness work,
publish no accepted output or docs bytes, remove the exact temporary directory
in `finally`, and emit exactly the applicable mode prefix plus the diagnostic:
`NAVAL_SEMANTIC_PROBE_FAILED source-files diagnostic=<diagnostic>`,
`NAVAL_CAPTURE_FAILED source-files diagnostic=<diagnostic>`, or
`NAVAL_VERIFY_FAILED source-files diagnostic=<diagnostic>`. Mutation proof
independently changes each of the three parser branches to ignore its syntax;
only that fixture's parser and CLI-propagation tests must turn red. Restoring
all three branches returns the complete native suite to green. After valid mode
parsing, this source audit precedes harness launch, clean/stale/ancestry checks,
and destination mutation so an unrelated mode failure cannot mask a syntax
diagnostic.

Final paths are repository-relative POSIX strings sorted bytewise ascending.
Each row is `{ path, sha256 }`, where `sha256` hashes the tracked file's raw
bytes. `sourceHash` is SHA-256 of canonical JSON for the complete sorted row
array. Capture and current verification require exact array equality: a
missing, extra, duplicate, or reordered path fails `source-files`; an equal
path array with any changed row or aggregate hash fails `source-hash`. A real
repository closure audit and literal membership tests must include
`src/shared/storage/kv.ts`, `src/shared/styles/tokens.css`,
`src/app/main.tsx`, `src/app/App.tsx`, `src/app/registry.ts`,
`src/games/caribbean/content/naval.ts`,
`src/games/caribbean/domain/naval/resolution.ts`,
`src/games/caribbean/state/naval/NavalSession.ts`,
`src/games/caribbean/state/naval/FrameRunner.ts`,
`src/games/caribbean/components/voyage/CampaignNavalBattle.tsx`,
`src/games/caribbean/styles/battle.css`,
`src/games/caribbean/assets/caribbean-sloop.glb`,
`scripts/lib/caribbean-campaign-victory-driver.mjs`,
`scripts/lib/caribbean-campaign-victory-browser.node-test.mjs`,
`scripts/lib/caribbean-naval-verification.mjs`,
`scripts/lib/caribbean-naval-verification.node-test.mjs`,
`scripts/fixtures/caribbean-campaign-victory.json`,
`scripts/caribbean-port-check.mjs`, `scripts/caribbean-naval-check.mjs`, and
every seed/build/package input above. Variable observations and generated PNGs
are never members.

The real-repository test locks these current edges, not only the target rows:
`index.html` `/src/app/main.tsx` -> `src/app/main.tsx`;
`src/app/main.tsx` `@shared/styles/tokens.css` and
`src/games/caribbean/preview.tsx` `@shared/styles/tokens.css` ->
`src/shared/styles/tokens.css`; and
`src/shared/profile/usersStore.ts` `@shared/storage/kv` ->
`src/shared/storage/kv.ts`. Removing an importer, edge, or target fails the
closure audit.

The stable/observational boundary is exact. `stableManifest.version === 1` and
contains that complete sorted source row array/hash; canonical input/seed; exact viewport
names and dimensions; sorted screenshot names with width, height, and semantic
state label; local GLB path/hash; port/starboard direction facts; deterministic
boarding outcome/facts excluding elapsed duration; fallback facts; motion
preference labels; and supported/unsupported display booleans. Its canonical
JSON must equal the tracked capture byte-for-byte. Fresh PNG pixels are honest
observational artifacts and are not byte-compared: each must have the exact
manifest name/dimensions, valid PNG signature, nonzero bytes, and matching DOM
semantic state at capture.

Fresh performance remains observational, never frozen or normalized. It must
have 20 advancing, unpaused one-second resource samples; finite FPS samples and
sustained FPS at least 50; no more than 120 draw calls or 100,000 triangles;
boarding duration `>= 0` and `< 15` seconds; no texture, geometry, material,
buffer-attribute, or effect-capacity growth after warm-up; at least one active
effect without exceeding capacity; and zero console/page/request/unhandled-
rejection/allocation/capacity/pool failures. Live ticks, FPS, durations, frame counters, active
effect counts, resource samples, observational metric bytes, and PNG pixels may
differ between valid generations.

Missing/unknown modes exit 1 with `NAVAL_CLI_FAILED mode`. Semantic-probe,
capture, and verify failures exit 1 with, respectively,
`NAVAL_SEMANTIC_PROBE_FAILED <code>`, `NAVAL_CAPTURE_FAILED <code>`, or
`NAVAL_VERIFY_FAILED <code>`, where `<code>` is exactly one of `semantic`,
`stale-capture`, `dirty-worktree`, `source-hash`, `source-files`,
`stable-manifest`, `observation-range`, `artifact-manifest`, `destination`, or
`cleanup` as applicable. A real two-generation test accepts different valid
FPS/duration/resource/frame/PNG observations under an identical stable
manifest, then rejects one stable-field drift and every out-of-range class.
Tests also cover cleanup on success and failure. Task 7 captures once from
a clean Task 6 HEAD before any other evidence bytes change, stages only the
metrics and genuinely changed screenshots, uses `--semantic-probe` for the
pre-commit live-harness check, and runs final `--verify` only after the evidence
commit is clean. Captured provenance therefore names the clean Task 6 source
HEAD and reports `worktreeDirtyBeforeCapture: false` without making the final
gate impossible to satisfy after the documentation commit.

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
