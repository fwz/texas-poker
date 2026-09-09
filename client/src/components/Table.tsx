import type { PublicGameState } from '../../../shared/types';
import { CommunityCards } from './CommunityCards';
import { PlayerSeat } from './PlayerSeat';

interface Props {
  state: PublicGameState;
  playerId: string;
  showStats?: boolean;
  statsMap?: Map<string, { vpip: number; pfr: number; hands: number }>;
}

// Portrait oval — me at bottom center, distribute opponents symmetrically
function getSeatPositions(count: number): [number, number][] {
  // [top%, left%] within the container
  switch (count) {
    case 2: return [
      [89, 50],
      [11, 50],
    ];
    case 3: return [
      [89, 50],
      [16, 75],
      [16, 25],
    ];
    case 4: return [
      [89, 50],
      [20, 82],
      [11, 50],
      [20, 18],
    ];
    case 5: return [
      [89, 50],
      [68, 90],
      [20, 82],
      [20, 18],
      [68, 10],
    ];
    case 6: return [
      [89, 50],
      [68, 90],
      [20, 82],
      [11, 50],
      [20, 18],
      [68, 10],
    ];
    case 7: return [
      [89, 50],
      [72, 90],
      [45, 93],
      [16, 80],
      [16, 20],
      [45,  7],
      [72, 10],
    ];
    case 8: return [
      [89, 50],
      [72, 90],
      [45, 93],
      [16, 82],
      [11, 50],
      [16, 18],
      [45,  7],
      [72, 10],
    ];
    default: return [
      [89, 50],
      [72, 90],
      [50, 94],
      [22, 86],
      [11, 58],
      [11, 42],
      [22, 14],
      [50,  6],
      [72, 10],
    ];
  }
}

export function Table({ state, playerId, showStats = false, statsMap }: Props) {
  const { players, communityCards, pot, phase, winners } = state;
  const isShowdown = phase === 'showdown';
  const winnerIds = new Set(winners?.map(w => w.playerId) ?? []);

  const winnerBestCardsMap = new Map<string, import('../../../shared/types').Card[]>();
  const allBestCardKeys = new Set<string>();
  winners?.forEach(w => {
    if (w.bestCards) {
      winnerBestCardsMap.set(w.playerId, w.bestCards);
      w.bestCards.forEach(c => allBestCardKeys.add(`${c.rank}-${c.suit}`));
    }
  });

  const myIndex = players.findIndex(p => p.id === playerId);
  const rotated = myIndex >= 0
    ? [...players.slice(myIndex), ...players.slice(0, myIndex)]
    : players;

  const positions = getSeatPositions(rotated.length);

  return (
    // Height adapts: 148% of width by default, capped at viewport height minus header/footer
    <div
      className="relative w-full mx-auto"
      style={{ paddingBottom: 'min(148%, calc(100dvh - 220px))' }}
    >
      {/* Wood outer ring */}
      <div
        className="absolute"
        style={{
          top: '6%', bottom: '6%', left: '14%', right: '14%',
          borderRadius: '999px',
          background: 'linear-gradient(135deg, #4a2008 0%, #2e1205 60%, #3d1a08 100%)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.8), inset 0 1px 2px rgba(255,200,100,0.1)',
        }}
      >
        {/* Foam/leather rail */}
        <div
          className="absolute"
          style={{
            inset: '10px',
            borderRadius: '999px',
            background: 'linear-gradient(160deg, #9b6a3e 0%, #7a4a28 40%, #6b3d20 100%)',
            boxShadow: 'inset 0 3px 14px rgba(0,0,0,0.6), inset 0 -2px 6px rgba(255,200,120,0.15)',
          }}
        >
          {/* Felt — visual only, no children */}
          <div
            className="absolute"
            style={{
              inset: '14px',
              borderRadius: '999px',
              background: 'radial-gradient(ellipse at 40% 35%, #2f7a2b 0%, #1e5218 60%, #163d11 100%)',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      </div>

      {/* Community cards — dedicated overlay, always on top (z-20) */}
      <div
        className="absolute z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ top: '50%', left: '50%' }}
      >
        <CommunityCards
          cards={communityCards}
          pot={pot}
          isShowdown={isShowdown}
          bestCardKeys={isShowdown ? allBestCardKeys : undefined}
        />
      </div>

      {/* Player seats + floating bet indicators */}
      {rotated.map((player, i) => {
        const [top, left] = positions[i] ?? [50, 50];
        const betTop  = top  + (50 - top)  * 0.38;
        const betLeft = left + (50 - left) * 0.38;

        return (
          <div key={player.id}>
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
              style={{ top: `${top}%`, left: `${left}%` }}
            >
              <PlayerSeat
                player={player}
                isMe={player.id === playerId}
                isWinner={winnerIds.has(player.id)}
                winnerBestCards={winnerBestCardsMap.get(player.id)}
                turnDeadline={player.isTurn && player.id !== playerId ? state.turnDeadline : undefined}
                stats={showStats ? statsMap?.get(player.id) : undefined}
              />
            </div>

            {/* Floating bet chip toward table center */}
            {player.bet > 0 && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                style={{ top: `${betTop}%`, left: `${betLeft}%` }}
              >
                <div className="flex items-center gap-0.5 bg-gray-900/90 border border-yellow-700 rounded-full px-2 py-0.5 text-xs font-bold text-yellow-300 shadow-md whitespace-nowrap">
                  🪙 {player.bet}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
