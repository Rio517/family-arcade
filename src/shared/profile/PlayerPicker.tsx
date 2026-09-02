/**
 * The player picker, as a modal.
 *
 * Picking a player used to drop the list into the page, which pushed
 * everything under it down the screen — on a lobby that meant the buttons you
 * were about to tap moved while you looked at them. It opens over the page
 * now, so nothing behind it shifts.
 *
 * It renders into `document.body` rather than where it is used. Games theme
 * their own chrome with broad rules (the Caribbean setup squares off every
 * button inside it), and a picker rendered inside a game would wear that
 * theme; over the body it always looks like itself.
 */

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { CloseIcon } from '@shared/ui/icons';
import { TicketList } from './TicketList';
import type { StoredUser } from './users';
import './player.css';

export function PlayerPicker({
  users,
  activeId = null,
  testIdPrefix,
  onPick,
  onCreate,
  onClose,
}: {
  users: StoredUser[];
  activeId?: string | null;
  testIdPrefix?: string;
  onPick: (id: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useDismissOnEscape(true, onClose);

  if (typeof document === 'undefined') return null;

  return createPortal(
    /* Backdrop click is a mouse convenience; Escape and Close are the
       keyboard path. */
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
    <div
      className="modal-backdrop"
      data-testid={`${testIdPrefix ?? 'player'}-picker`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal ppicker" role="dialog" aria-modal="true" aria-label="Choose who is playing">
        <div className="modal-head">
          <span className="modal-title">Who&apos;s playing?</span>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            data-testid={`${testIdPrefix ?? 'player'}-picker-close`}
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="ppicker-body">
          <TicketList
            users={users}
            activeId={activeId}
            testIdPrefix={testIdPrefix}
            onPick={onPick}
            onCreate={onCreate}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
