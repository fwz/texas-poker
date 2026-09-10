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

  // Avatar circle styling
  let avatarCls = isMe ? 'bg-blue-900' : 'bg-gray-800';
  let avatarRing = '';
  let wrapExtra = '';

  if (isWinner) {
    avatarRing = 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-500/60';
    avatarCls = 'bg-yellow-950';
  } else if (player.isTurn) {
    avatarRing = 'ring-2 ring-blue-400 shadow-md shadow-blue-400/40';
    avatarCls = isMe ? 'bg-blue-950' : 'bg-gray-900';
  } else if (isMe) {
    avatarRing = 'ring-1 ring-blue-700/60';
  }

  if (isFolded) {
    wrapExtra = 'opacity-40 grayscale';
    avatarRing = '';
  } else if (isDisconnected) {
    wrapExtra = 'opacity-40';
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

  // "me" seat is slightly larger for emphasis
  const avatarSize = isMe ? 'w-10 h-10' : 'w-8 h-8';
  const avatarEmoji = isMe ? 'text-xl' : 'text-base';
  const seatWidth = isMe ? 72 : 60;

  return (
    <div className={`flex flex-col items-center ${wrapExtra}`} style={{ width: `${seatWidth}px` }}>
      {/* Avatar circle */}
      <div className={`relative ${avatarSize} rounded-full flex items-center justify-center ${avatarCls} ${avatarRing}`}>
        <span className={`${avatarEmoji} leading-none select-none`}>{player.avatar || '🃏'}</span>
        {posLabel && (
          <span className={`absolute -bottom-1 -right-1 text-[7px] font-black rounded px-[3px] py-px leading-none ${badgeCls}`}>
            {posLabel}
          </span>
        )}
      </div>

      {/* Name */}
      <span
        className="text-[8px] font-medium text-white/80 truncate text-center mt-0.5 leading-none w-full px-0.5"
        style={{ maxWidth: `${seatWidth}px` }}
      >
        {player.name}
      </span>

      {/* Chips */}
      <span className={`font-bold text-yellow-400 leading-tight ${isMe ? 'text-xs' : 'text-[10px]'}`}>
        {player.chips}
      </span>

      {/* VPIP/PFR stats */}
      {stats && stats.hands > 0 && (
        <div className="text-[8px] text-center leading-tight whitespace-nowrap">
          <span className="text-blue-400">V</span>
          <span className="text-gray-300">{Math.round(stats.vpip)}</span>
          {' '}
          <span className="text-orange-400">R</span>
          <span className="text-gray-300">{Math.round(stats.pfr)}</span>
        </div>
      )}

      {/* Opponent turn countdown */}
      {turnDeadline !== undefined && !isMe && (
        <div className={`text-[10px] font-mono font-bold tabular-nums leading-none ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-300'}`}>
          {timeLeft}s
        </div>
      )}

      {/* Hole cards */}
      <div className="flex items-end mt-0.5" style={{ gap: '2px' }}>
        {player.holeCards
          ? player.holeCards.map((c, i) => {
              const inBest = !hasBest || bestCardKeys.has(`${c.rank}-${c.suit}`);
              return (
                <div key={i} className={inBest ? '' : 'opacity-25'}>
                  <CardComp
                    card={c}
                    small={isMe}
                    mini={!isMe}
                    highlighted={hasBest ? inBest : (isWinner && winnerBestCards !== undefined)}
                    tilt={i === 0 ? -7 : 7}
                  />
                </div>
              );
            })
          : [0, 1].map(i => (
              <CardComp key={i} card={null} faceDown small={isMe} mini={!isMe} tilt={i === 0 ? -7 : 7} />
            ))}
      </div>

      {/* Status */}
      <div className="text-center leading-none mt-0.5">
        {isWinner && <div className="text-[9px] font-bold text-yellow-400 animate-pulse">🏆 赢</div>}
        {player.isAllIn && !isFolded && <div className="text-[9px] text-red-400 font-semibold">全押</div>}
        {isFolded && <div className="text-[9px] text-gray-500">弃</div>}
      </div>
    </div>
  );
}
