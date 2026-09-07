import type { Card as CardType } from '../../../shared/types';

const SUIT_SYMBOL: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);

interface Props {
  card: CardType | null;
  faceDown?: boolean;
  small?: boolean;
  highlighted?: boolean;
  tilt?: number;
}

export function Card({ card, faceDown = false, small = false, highlighted = false, tilt }: Props) {
  const w = small ? 'w-11 h-16' : 'w-9 h-[52px]';
  const glow = highlighted
    ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/60 border-yellow-300'
    : 'border-gray-300';
  const base = `rounded-lg border relative select-none overflow-hidden shrink-0 ${w} ${glow}`;
  const style: React.CSSProperties = tilt !== undefined ? { transform: `rotate(${tilt}deg)` } : {};

  if (faceDown || !card) {
    return (
      <div
        className={`${base} ${highlighted ? '' : 'border-blue-900'}`}
        style={{
          ...style,
          backgroundColor: '#1e3a8a',
          backgroundImage: [
            'linear-gradient(45deg, rgba(147,197,253,0.18) 25%, transparent 25%, transparent 75%, rgba(147,197,253,0.18) 75%)',
            'linear-gradient(-45deg, rgba(147,197,253,0.18) 25%, transparent 25%, transparent 75%, rgba(147,197,253,0.18) 75%)',
          ].join(','),
          backgroundSize: '8px 8px',
        }}
      />
    );
  }

  const red = RED_SUITS.has(card.suit);
  const color = red ? 'text-red-600' : 'text-gray-900';
  return (
    <div className={`${base} bg-white ${color}`} style={style}>
      {/* Top-left: rank */}
      <div className={`absolute top-0.5 left-1 font-bold leading-none ${small ? 'text-2xl' : 'text-lg'}`}>
        {card.rank}
      </div>
      {/* Bottom-right: suit */}
      <div className={`absolute bottom-0.5 right-1 font-bold leading-none ${small ? 'text-3xl' : 'text-xl'}`}>
        {SUIT_SYMBOL[card.suit]}
      </div>
    </div>
  );
}
