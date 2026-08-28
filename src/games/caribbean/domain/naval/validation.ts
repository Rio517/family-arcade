import { SLOOP_CLASS } from '../../content/naval';
import type {
  Broadside,
  NavalEvent,
  NavalOutcome,
  NavalShipId,
  NavalShipState,
  NavalState,
  ReloadState,
} from './types';

export type NavalStateValidation = { ok: true } | { ok: false; issues: string[] };

const SHIP_IDS: readonly NavalShipId[] = ['player', 'opponent'];
const BROADSIDES: readonly Broadside[] = ['port', 'starboard'];

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isShipId(value: unknown): value is NavalShipId {
  return value === 'player' || value === 'opponent';
}

function isBroadside(value: unknown): value is Broadside {
  return value === 'port' || value === 'starboard';
}

function isRudder(value: unknown): boolean {
  return value === -1 || value === 0 || value === 1;
}

function isSail(value: unknown): boolean {
  return value === 'full' || value === 'reefed';
}

function isAmmunition(value: unknown): boolean {
  return value === 'round' || value === 'chain' || value === 'grape';
}

function isEventKind(value: unknown): value is NavalEvent['kind'] {
  return value === 'volley' || value === 'damage' || value === 'reload-ready' || value === 'outcome';
}

function isOutcomeKind(value: unknown): value is NavalOutcome['kind'] {
  return value === 'surrender'
    || value === 'sunk'
    || value === 'boarding-ready'
    || value === 'escaped'
    || value === 'separated';
}

function finiteIssue(issues: string[], value: number, label: string): void {
  if (!Number.isFinite(value)) issues.push(`${label}:not-finite`);
}

function boundIssue(issues: string[], value: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > maximum) issues.push(`${label}:outside-sloop-maximum`);
}

function validateReload(reload: ReloadState, label: string, issues: string[]): void {
  if (!isPositiveInteger(reload.required)) issues.push(`${label}.required:not-positive-integer`);
  if (!Number.isInteger(reload.progress)) issues.push(`${label}.progress:not-integer`);
  if (Number.isInteger(reload.progress) && reload.progress < 0) issues.push(`${label}:underflow`);
  if (Number.isFinite(reload.progress) && Number.isFinite(reload.required) && reload.progress > reload.required) {
    issues.push(`${label}:overflow`);
  }
  if (reload.loaded !== (reload.progress === reload.required)) issues.push(`${label}:loaded-mismatch`);
}

function validateShip(ship: NavalShipState, expectedId: NavalShipId, issues: string[]): void {
  if (ship.id !== expectedId) issues.push(`${expectedId}.id:mismatch`);
  if (ship.classId !== 'sloop') issues.push(`${expectedId}.classId:unsupported`);
  if (!isRudder(ship.rudder)) issues.push(`${expectedId}.rudder:unknown`);
  if (!isSail(ship.sail)) issues.push(`${expectedId}.sail:unknown`);
  if (!isAmmunition(ship.ammunition)) issues.push(`${expectedId}.ammunition:unknown`);
  finiteIssue(issues, ship.position.x, `${expectedId}.position.x`);
  finiteIssue(issues, ship.position.z, `${expectedId}.position.z`);
  finiteIssue(issues, ship.heading, `${expectedId}.heading`);
  finiteIssue(issues, ship.speed, `${expectedId}.speed`);
  if (Number.isFinite(ship.speed) && ship.speed < 0) issues.push(`${expectedId}.speed:negative`);
  boundIssue(issues, ship.hull, SLOOP_CLASS.hullMaximum, `${expectedId}.hull`);
  boundIssue(issues, ship.sails, SLOOP_CLASS.sailsMaximum, `${expectedId}.sails`);
  boundIssue(issues, ship.crew, SLOOP_CLASS.crew.maximum, `${expectedId}.crew`);
  boundIssue(issues, ship.cannon, SLOOP_CLASS.cannonMaximum, `${expectedId}.cannon`);
  if (!Number.isInteger(ship.crew)) issues.push(`${expectedId}.crew:not-integer`);
  if (!Number.isInteger(ship.cannon)) issues.push(`${expectedId}.cannon:not-integer`);
  for (const side of BROADSIDES) validateReload(ship.reload[side], `${expectedId}.reload.${side}`, issues);
}

function validateEventShipIds(event: NavalEvent, index: number, issues: string[]): void {
  if ('shipId' in event && !isShipId(event.shipId)) issues.push(`events.${index}.shipId:unknown`);
  if (event.kind === 'volley') {
    if (!isShipId(event.targetShipId)) issues.push(`events.${index}.targetShipId:unknown`);
    if (!isBroadside(event.result.side)) issues.push(`events.${index}.result.side:unknown`);
    if (!isAmmunition(event.result.ammunition)) issues.push(`events.${index}.result.ammunition:unknown`);
  }
  if (event.kind === 'reload-ready' && !isBroadside(event.side)) issues.push(`events.${index}.side:unknown`);
  if (event.kind === 'outcome') validateOutcomeShipId(event.outcome, `events.${index}.outcome`, issues);
}

function validateOutcomeShipId(outcome: NavalOutcome, label: string, issues: string[]): void {
  if (!isOutcomeKind(outcome.kind)) issues.push(`${label}.kind:unknown`);
  if ('victorShipId' in outcome && !isShipId(outcome.victorShipId)) issues.push(`${label}.victorShipId:unknown`);
  if ('shipId' in outcome && !isShipId(outcome.shipId)) issues.push(`${label}.shipId:unknown`);
}

function outcomesEqual(left: NavalOutcome, right: NavalOutcome): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateOutcomeAgreement(state: NavalState, outcomeEvents: Extract<NavalEvent, { kind: 'outcome' }>[], issues: string[]): void {
  if (state.outcome === null) {
    if (outcomeEvents.length > 0) issues.push('outcome:event-unexpected');
    return;
  }

  validateOutcomeShipId(state.outcome, 'outcome', issues);
  if (outcomeEvents.length === 0) {
    issues.push('outcome:event-missing');
  } else if (outcomeEvents.length !== 1) {
    issues.push('outcome:event-count');
  } else if (!outcomesEqual(state.outcome, outcomeEvents[0].outcome)) {
    issues.push('outcome:event-mismatch');
  }
}

export function validateNavalState(state: NavalState): NavalStateValidation {
  const issues: string[] = [];

  if (!isUint32(state.tick)) issues.push('tick:not-uint32');
  if (!isUint32(state.seed)) issues.push('seed:not-uint32');
  if (!isPositiveInteger(state.nextEventId)) issues.push('nextEventId:not-positive-integer');
  if (!isPositiveInteger(state.nextVolleyId)) issues.push('nextVolleyId:not-positive-integer');

  for (const key of Object.keys(state.ships)) {
    if (!isShipId(key)) issues.push(`ships.${key}:unknown`);
  }
  for (const shipId of SHIP_IDS) validateShip(state.ships[shipId], shipId, issues);

  let previousId = 0;
  const outcomeEvents: Extract<NavalEvent, { kind: 'outcome' }>[] = [];
  state.events.forEach((event, index) => {
    if (!isPositiveInteger(event.id)) issues.push(`events.${index}.id:not-positive-integer`);
    if (index > 0 && event.id <= previousId) issues.push(`events.${index}.id:not-monotonic`);
    if (!isUint32(event.atTick)) issues.push(`events.${index}.atTick:not-uint32`);
    if (!isEventKind(event.kind)) issues.push(`events.${index}.kind:unknown`);
    validateEventShipIds(event, index, issues);
    if (event.kind === 'outcome') outcomeEvents.push(event);
    previousId = event.id;
  });

  const lastEventId = state.events.at(-1)?.id ?? 0;
  if (isPositiveInteger(state.nextEventId) && state.nextEventId <= lastEventId) {
    issues.push('nextEventId:not-after-events');
  }
  validateOutcomeAgreement(state, outcomeEvents, issues);

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
