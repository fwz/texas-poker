import { useEffect, useState } from 'react';
import type { Card, PublicPlayer } from '../../../shared/types';
import { Card as CardComp } from './Card';

interface Props {
  player: PublicPlayer;
  isMe: boolean;
  isWinner?: boolean;
  winnerBestCards?: Card[];
  turnDeadline?: number;
  stats?: { vpip: number; pfr: number; hands: number };
}

export function PlayerSeat({ player, isMe, isWinner = false, winnerBestCards, turnDeadline, stats }: Props) {
  const [timeLeft, setTimeLeft] = useState(
    turnDeadline ? Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)) : 0
  );
  useEffect(() => {
    if (!turnDeadline) return;
    const update = () => setTimeLeft(Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [turnDeadline]);

  const isFolded = !player.isActive;
  const isDisconnected = !player.isConnected;
  const bestCardKeys = new Set(winnerBestCards?.map(c => `${c.rank}-${c.suit}`) ?? []);
  const hasBest = isWinner && bestCardKeys.size > 0;

  let bg = isMe ? 'bg-blue-900' : 'bg-gray-800';
  let ring = '';
  let extra = '';

  if (isWinner) {
    ring = 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/50';
    bg = 'bg-yellow-950';
  } else if (player.isTurn) {
    ring = 'ring-2 ring-blue-400 shadow-md shadow-blue-400/30';
  }

  if (isFolded) {
    bg = 'bg-gray-700';
    extra = 'opacity-50 grayscale';
    ring = '';
  } else if (isDisconnected) {
    extra = 'opacity-40';
  }

  const rawLabel = player.positionLabel;
  const posLabel = rawLabel === 'BTN' ? 'D' : (rawLabel || null);
  const badgeCls = player.isDealer
    ? 'bg-yellow-400 text-black'
    : player.isSmallBlind
    ? 'bg-orange-500 text-white'
    : player.isBigBlind
    ? 'bg-red-600 text-white'
    : 'bg-gray-600 text-gray-200';

  return (
    <div className={`rounded-xl p-1.5 ${bg} ${ring} ${extra} min-w-[76px] flex flex-col items-center gap-0.5 transition-all`}>
      {/* Avatar (top-left) with position badge + name */}
      <div className="flex items-center gap-1.5 w-full">
        <div className="relative shrink-0">
          <span className="text-xl leading-none">{player.avatar || '🃏'}</span>
          {posLabel && (
            <span className={`absolute -bottom-1 -right-1 text-[8px] font-black rounded px-0.5 py-px leading-none ${badgeCls}`}>
              {posLabel}
            </span>
          )}
        </div>
        <span className="text-xs font-semibold truncate max-w-[52px] leading-tight text-white/90">
          {player.name}
        </span>
      </div>

      {/* Chips – centered */}
      <div className="text-sm font-bold text-yellow-400 text-center w-full leading-tight py-0.5">
        {player.chips}
        <span className="text-yellow-600 text-[10px] ml-0.5"></span>
      </div>

      {/* VPIP / PFR stats */}
      {stats && stats.hands > 0 && (
        <div className="text-[9px] text-center leading-tight w-full whitespace-nowrap">
          <span className="text-blue-400">V</span>
          <span className="text-gray-300">{Math.round(stats.vpip)}</span>
          {' '}
          <span className="text-orange-400">R</span>
          <span className="text-gray-300">{Math.round(stats.pfr)}</span>
          {' '}
          <span className="text-gray-500">{stats.hands}局</span>
        </div>
      )}

      {/* Opponent turn countdown */}
      {turnDeadline !== undefined && !isMe && (
        <div className={`text-xs font-mono font-bold tabular-nums leading-none ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-300'}`}>
          {timeLeft}s
        </div>
      )}

      {/* Hole cards */}
      <div className="flex items-end" style={{ gap: '2px' }}>
        {player.holeCards
          ? player.holeCards.map((c, i) => {
              const inBest = !hasBest || bestCardKeys.has(`${c.rank}-${c.suit}`);
              return (
                <div key={i} className={inBest ? '' : 'opacity-25'}>
                  <CardComp card={c} small highlighted={hasBest ? inBest : (isWinner && winnerBestCards !== undefined)} tilt={i === 0 ? -7 : 7} />
                </div>
              );
            })
          : [0, 1].map(i => (
              <CardComp key={i} card={null} faceDown small tilt={i === 0 ? -7 : 7} />
            ))}
      </div>

      {/* Status */}
      <div className="text-center leading-tight">
        {isWinner && <div className="text-xs font-bold text-yellow-400 animate-pulse">🏆 赢了</div>}
        {player.isAllIn && !isFolded && <div className="text-xs text-red-400 font-semibold">全押</div>}
        {isFolded && <div className="text-xs text-gray-400">弃牌</div>}
      </div>
    </div>
  );
}
