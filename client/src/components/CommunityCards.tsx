import type { Card as CardType } from '../../../shared/types';
import { Card } from './Card';

interface Props {
  cards: CardType[];
  pot: number;
  isShowdown?: boolean;
  bestCardKeys?: Set<string>;
}

export function CommunityCards({ cards, pot, isShowdown = false, bestCardKeys }: Props) {
  const placeholders = Array(5 - cards.length).fill(null);
  const hasBest = isShowdown && bestCardKeys && bestCardKeys.size > 0;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-yellow-400 font-semibold text-xs bg-black/40 rounded-full px-3 py-0.5 tracking-wide">
        底池 {pot} 分
      </div>
      <div className="flex gap-1.5">
        {cards.map((c, i) => {
          const inBest = !hasBest || bestCardKeys!.has(`${c.rank}-${c.suit}`);
          return (
            <div key={i} className={inBest ? '' : 'opacity-25'}>
              <Card card={c} small highlighted={hasBest && inBest} />
            </div>
          );
        })}
        {placeholders.map((_, i) => (
          <Card key={`ph-${i}`} card={null} faceDown small />
        ))}
      </div>
    </div>
  );
}
