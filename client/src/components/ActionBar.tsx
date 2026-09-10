import { useEffect, useRef, useState } from 'react';
import type { PublicGameState } from '../../../shared/types';
import { getSocket } from '../hooks/useSocket';
import { playSound } from '../hooks/useSound';

interface Props {
  state: PublicGameState;
  playerId: string;
  onExpandChange?: (expanded: boolean) => void;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function getDefaultRaise(state: PublicGameState, meChips: number, meBet: number): number {
  const minRaiseTotal = state.currentBet + state.minRaise;
  const maxRaise = meChips + meBet;
  const pot = state.pot || state.blinds.big * 2;
  const facingRaise = state.currentBet > state.blinds.big;
  const raw = facingRaise
    ? state.currentBet * 2
    : state.currentBet + Math.round(pot * 0.5);
  return clamp(raw, minRaiseTotal, maxRaise);
}

export function ActionBar({ state, playerId, onExpandChange }: Props) {
  const isMyTurn = state.activePlayerId === playerId && state.phase !== 'showdown' && state.phase !== 'waiting';
  const me = state.players.find(p => p.id === playerId);

  const minRaiseTotal = state.currentBet + state.minRaise;
  const maxRaise = me ? me.chips + me.bet : minRaiseTotal;
  const defaultRaise = me ? getDefaultRaise(state, me.chips, me.bet) : minRaiseTotal;

  const [raiseAmount, setRaiseAmount] = useState(defaultRaise);
  const [inputVal, setInputVal] = useState(String(defaultRaise));
  const [showRaise, setShowRaise] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync expand state upward so Game.tsx can adjust table height
  useEffect(() => {
    onExpandChange?.(showRaise);
  }, [showRaise, onExpandChange]);

  // Countdown timer
  useEffect(() => {
    if (!isMyTurn || !state.turnDeadline) return;
    const update = () => setTimeLeft(Math.max(0, Math.ceil((state.turnDeadline! - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [isMyTurn, state.turnDeadline]);

  if (!isMyTurn || !me) return null;

  const canCheck = me.bet >= state.currentBet;
  const callAmount = Math.min(state.currentBet - me.bet, me.chips);
  const canRaise = me.chips > callAmount;
  const isUrgent = timeLeft > 0 && timeLeft <= 5;

  const setAmount = (v: number, preset?: string) => {
    const clamped = clamp(v, minRaiseTotal, maxRaise);
    setRaiseAmount(clamped);
    setInputVal(String(clamped));
    setSelectedPreset(preset ?? null);
  };

  const pot = state.pot || state.blinds.big * 2;
  const presets = [
    { label: '33%', raw: state.currentBet + Math.round(pot * 0.33) },
    { label: '50%', raw: state.currentBet + Math.round(pot * 0.50) },
    { label: '66%', raw: state.currentBet + Math.round(pot * 0.66) },
    { label: '100%', raw: state.currentBet + pot },
    { label: '全押', raw: maxRaise },
  ].map(p => ({ ...p, amount: clamp(p.raw, minRaiseTotal, maxRaise) }));

  const send = (action: any, sound: Parameters<typeof playSound>[0]) => {
    playSound(sound);
    getSocket().emit('player_action', action, () => {});
  };

  const openRaise = () => {
    setShowRaise(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const closeRaise = () => setShowRaise(false);

  const confirmRaise = () => {
    send({ type: 'raise', amount: raiseAmount }, 'raise');
    closeRaise();
  };

  const handleDelayCard = () => getSocket().emit('use_delay_card', () => {});

  const timerEl = state.turnDeadline !== undefined && (
    <div className="flex items-center gap-1.5">
      <span className={`font-mono font-bold text-base tabular-nums ${isUrgent ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
        {timeLeft}s
      </span>
      <button
        onClick={handleDelayCard}
        disabled={me.delayCards <= 0}
        className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 disabled:opacity-40 active:bg-gray-700"
      >
        <span>💳</span>
        <span className="text-yellow-400 font-bold">×{me.delayCards}</span>
      </button>
    </div>
  );

  const btnBase = 'rounded-xl font-bold text-sm transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 px-3 pt-2"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {showRaise && canRaise ? (
        /* ── Expanded raise panel: 2-column layout ── */
        <div className="flex gap-2">

          {/* Left column: fold + call/check + timer */}
          <div className="flex flex-col gap-1.5" style={{ width: '38%', flexShrink: 0 }}>
            {/* Timer + delay card */}
            {state.turnDeadline !== undefined && (
              <div className="flex items-center justify-between px-0.5">
                {timerEl}
              </div>
            )}

            {/* Fold */}
            {!canCheck && (
              <button
                onClick={() => send({ type: 'fold' }, 'fold')}
                className={`${btnBase} flex-1 bg-red-800 active:bg-red-950 text-white border border-red-700 min-h-[44px]`}
                style={{ boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }}
              >
                弃牌
              </button>
            )}

            {/* Check / Call */}
            <button
              onClick={() => send(canCheck ? { type: 'check' } : { type: 'call' }, canCheck ? 'check' : 'call')}
              className={`${btnBase} flex-1 min-h-[44px] border
                ${canCheck
                  ? 'bg-gray-600 active:bg-gray-800 border-gray-500 text-white'
                  : 'bg-blue-700 active:bg-blue-900 border-blue-600 text-white'}`}
              style={{ boxShadow: '0 2px 8px rgba(37,99,235,0.25)' }}
            >
              <span>{canCheck ? '过牌' : '跟注'}</span>
              {!canCheck && <span className="text-yellow-300 text-xs font-normal">{callAmount}</span>}
            </button>

            {/* Cancel */}
            <button onClick={closeRaise} className="text-gray-500 text-xs text-center py-0.5">
              取消
            </button>
          </div>

          {/* Right column: presets + amount + vertical slider + confirm */}
          <div className="flex-1 flex flex-col gap-1.5">
            {/* Preset chips */}
            <div className="flex gap-1">
              {presets.map(p => (
                <button
                  key={p.label}
                  onClick={() => setAmount(p.amount, p.label)}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all min-h-[28px]
                    ${selectedPreset === p.label
                      ? 'bg-green-700 border-green-500 text-white scale-105'
                      : 'bg-gray-800 border-gray-700 text-gray-300 active:bg-gray-700'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Amount input + vertical slider side by side */}
            <div className="flex items-center gap-2 flex-1">
              <input
                ref={inputRef}
                type="number"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onBlur={() => setAmount(Number(inputVal))}
                onFocus={e => e.target.select()}
                onKeyDown={e => e.key === 'Enter' && setAmount(Number(inputVal))}
                className="flex-1 px-2 py-2 rounded-lg bg-gray-800 border border-yellow-600 text-yellow-300 text-center text-sm font-bold min-w-0"
              />
              {/* Vertical slider: container clips the rotated input */}
              <div
                style={{
                  height: '64px',
                  width: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <input
                  type="range"
                  min={minRaiseTotal}
                  max={maxRaise}
                  step={state.blinds.big}
                  value={raiseAmount}
                  onChange={e => setAmount(Number(e.target.value), undefined)}
                  style={{
                    width: '64px',
                    height: '36px',
                    transform: 'rotate(-90deg)',
                    transformOrigin: 'center',
                    cursor: 'pointer',
                    accentColor: '#16a34a',
                  }}
                />
              </div>
            </div>

            {/* Confirm raise */}
            <button
              onClick={confirmRaise}
              className="w-full py-3 rounded-xl bg-green-600 active:bg-green-800 text-white font-bold text-sm"
              style={{ boxShadow: '0 2px 8px rgba(22,163,74,0.4)' }}
            >
              加注 {raiseAmount}
            </button>
          </div>
        </div>
      ) : (
        /* ── Collapsed: timer row + action buttons ── */
        <>
          {state.turnDeadline !== undefined && (
            <div className="flex items-center justify-between mb-2 px-1">
              {timerEl}
            </div>
          )}

          <div className="flex gap-2">
            {!canCheck && (
              <button
                onClick={() => send({ type: 'fold' }, 'fold')}
                className={`${btnBase} flex-1 bg-red-800 active:bg-red-950 text-white border border-red-700 min-h-[52px]`}
                style={{ boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }}
              >
                弃牌
              </button>
            )}

            {canCheck ? (
              <button
                onClick={() => send({ type: 'check' }, 'check')}
                className={`${btnBase} flex-1 bg-gray-600 active:bg-gray-800 text-white border border-gray-500 min-h-[52px]`}
              >
                过牌
              </button>
            ) : (
              <button
                onClick={() => send({ type: 'call' }, 'call')}
                className={`${btnBase} flex-1 bg-blue-700 active:bg-blue-900 text-white border border-blue-600 min-h-[52px]`}
                style={{ boxShadow: '0 2px 8px rgba(37,99,235,0.35)' }}
              >
                <span>跟注</span>
                <span className="text-yellow-300 text-xs font-normal">{callAmount}</span>
              </button>
            )}

            <button
              onClick={openRaise}
              disabled={!canRaise}
              className={`${btnBase} flex-1 bg-green-700 active:bg-green-900 border-green-600 text-white border disabled:opacity-40 min-h-[52px]`}
              style={{ boxShadow: '0 2px 8px rgba(22,163,74,0.35)' }}
            >
              {canCheck ? '下注' : '加注'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
