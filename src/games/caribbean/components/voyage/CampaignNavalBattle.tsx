import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { summarizeNavalResolution, validateNavalResolution } from '../../domain/naval/resolution';
import type { NavalState } from '../../domain/naval/types';
import { useNavalSession } from '../../state/naval/useNavalSession';
import type { CaribbeanController } from '../../state/useCaribbean';
import { NavalBattlePage } from '../battle/NavalBattlePage';
import '../../styles/battle.css';

export default function CampaignNavalBattle({ controller }: { controller: CaribbeanController }) {
  const mode = controller.journal?.state.mode;
  if (mode === undefined || mode.kind !== 'naval') {
    throw new Error('CampaignNavalBattle requires a saved naval campaign');
  }

  const inputKey = JSON.stringify(mode.input);
  const savedInput = useMemo(
    () => structuredClone(mode.input),
    // A byte-equal journal replacement must preserve the live tactical session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputKey],
  );
  const session = useNavalSession(savedInput);
  const [resolutionError, setResolutionError] = useState(false);
  const [resultStatus, setResultStatus] = useState<string | null>(null);
  const [resultBusy, setResultBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState(false);
  const resolvingRef = useRef(false);
  const withdrawingRef = useRef(false);
  const withdrawalDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (withdrawalError) withdrawalDialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [withdrawalError]);

  const withdraw = useCallback(async () => {
    if (withdrawingRef.current) return;
    withdrawingRef.current = true;
    session.setPauseHold('campaign-withdrawal', true);
    setWithdrawBusy(true);
    setWithdrawalError(false);
    try {
      await controller.withdrawBattle();
    } catch {
      setWithdrawalError(true);
    } finally {
      withdrawingRef.current = false;
      setWithdrawBusy(false);
    }
  }, [controller, session]);

  const resolve = useCallback(async (state: NavalState) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setResultBusy(true);
    setResultStatus(null);
    try {
      const candidate = summarizeNavalResolution(state);
      const validation = validateNavalResolution(savedInput, candidate);
      if (!validation.ok) throw new Error(`Invalid campaign naval resolution: ${validation.issues.join(', ')}`);
      const result = await controller.resolveBattle(validation.value);
      if (result.kind === 'not-applied') setResultStatus('Battle result was not saved.');
    } catch {
      setResolutionError(true);
    } finally {
      resolvingRef.current = false;
      setResultBusy(false);
    }
  }, [controller, savedInput]);

  const restart = useCallback(() => {
    setResolutionError(false);
    setResultStatus(null);
    setWithdrawalError(false);
    session.restart();
  }, [session]);

  const resultAction = useMemo(() => ({
    label: 'Return to Bridgetown',
    busy: resultBusy || controller.busy,
    activate: (state: NavalState) => { void resolve(state); },
  }), [controller.busy, resolve, resultBusy]);
  const exitAction = useMemo(() => ({
    label: 'Withdraw to Bridgetown',
    busy: withdrawBusy || controller.busy,
    activate: () => { void withdraw(); },
  }), [controller.busy, withdraw, withdrawBusy]);
  const resolutionErrorAction = resolutionError ? {
    message: 'Battle result could not be verified.' as const,
    busy: withdrawBusy || controller.busy,
    restartLabel: 'Restart engagement' as const,
    withdrawLabel: 'Withdraw to Bridgetown' as const,
    restart,
    withdraw: () => { void withdraw(); },
  } : undefined;

  return (
    <div className="campaign-naval-battle">
      <div
        className="campaign-naval-battle__engagement"
        aria-hidden={withdrawalError ? true : undefined}
        {...(withdrawalError ? { inert: '' } : {})}
      >
        <NavalBattlePage
          session={session}
          resultAction={resultAction}
          exitAction={exitAction}
          resolutionErrorAction={resolutionErrorAction}
        />
        <p className="campaign-naval-battle__restart-note">Reloading restarts this engagement from first contact.</p>
        {resultStatus && <p className="campaign-naval-battle__status" role="status">{resultStatus}</p>}
      </div>

      {withdrawalError && (
        <div
          ref={withdrawalDialogRef}
          className="naval-result naval-withdrawal-error"
          data-testid="naval-withdrawal-error"
          role="dialog"
          aria-modal="true"
          aria-labelledby="naval-withdrawal-error-title"
        >
          <span>Campaign withdrawal</span>
          <h2 id="naval-withdrawal-error-title">Withdrawal interrupted</h2>
          <p>Withdrawal was not completed.</p>
          <div className="naval-result-actions">
            <button
              type="button"
              className="naval-control naval-hit-target"
              data-testid="naval-withdrawal-retry"
              disabled={withdrawBusy || controller.busy}
              onClick={() => { void withdraw(); }}
            >Retry withdrawal</button>
            <button
              type="button"
              className="naval-control naval-hit-target"
              data-testid="naval-withdrawal-resume"
              disabled={withdrawBusy || controller.busy}
              onClick={() => {
                setWithdrawalError(false);
                session.setPauseHold('campaign-withdrawal', false);
              }}
            >Resume battle</button>
          </div>
        </div>
      )}
    </div>
  );
}
