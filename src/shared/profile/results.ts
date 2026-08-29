/**
 * Results land on the ticket that sat down — not on whoever happens to be
 * signed in when the game ends. A game captures the seat's ticket id when it
 * starts (a chair at the table, or `seatedUserId` at `startTable`) and
 * records through here at the finish. A missing or unknown id (a bot chair,
 * an unclaimed chair, a save from before tickets rode along) records nothing.
 *
 * Games may import this; the roster itself stays behind the identity guard.
 */
import { recordResult, type ResultInput } from './profile';
import type { UsersState } from './users';
import { getUsersSnapshot, setUsersState } from './usersStore';

/** Fold a finished game into one ticket's profile. Unknown ids leave the roster as it was. */
export function creditResult(state: UsersState, userId: string | null, input: ResultInput): UsersState {
  if (!userId || !state.users.some((u) => u.id === userId)) return state;
  return {
    ...state,
    users: state.users.map((u) => (u.id === userId ? { ...u, profile: recordResult(u.profile, input) } : u)),
  };
}

/** Record a finished game for the ticket `userId`, and persist. */
export function recordResultFor(userId: string | null, input: ResultInput): void {
  setUsersState(creditResult(getUsersSnapshot(), userId, input));
}
