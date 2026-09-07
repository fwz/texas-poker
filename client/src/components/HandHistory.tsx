import { useState } from 'react';
import type { Card, HandHistoryEntry, HandStreet } from '../../../shared/types';

interface Props {
  history: HandHistoryEntry[];
  open: boolean;
  onClose: () => void;
}

// ── Mini helpers ──────────────────────────────────────────────────────────────

const SUIT_SYMBOL: Record<string, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};
const RED_SUITS = new Set(['hearts', 'diamonds']);

function MiniCard({ card }: { card: Card }) {
  const red = RED_SUITS.has(card.suit);
  return (
    <span className={`inline-flex items-baseline gap-px font-bold text-xs ${red ? 'text-red-400' : 'text-white'}`}>
      {card.rank}{SUIT_SYMBOL[card.suit]}
    </span>
  );
}

function MiniCards({ cards }: { cards: Card[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {cards.map((c, i) => <MiniCard key={i} card={c} />)}
    </span>
  );
}

const STREET_LABEL: Record<HandStreet, string> = {
  preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌',
};

const ACTION_LABEL: Record<string, string> = {
  fold: '弃牌', call: '跟注', check: '过牌', raise: '加注至',
};

const POS_LABEL: Record<string, string> = { dealer: 'D', sb: 'SB', bb: 'BB', other: '' };
const POS_COLOR: Record<string, string> = {
  dealer: 'text-yellow-400', sb: 'text-orange-400', bb: 'text-red-400', other: '',
};

// ── Chip chart ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  '#60a5fa', '#34d399', '#f97316', '#c084fc',
  '#fb7185', '#facc15', '#38bdf8', '#a3e635',
];

function ChipChart({ history }: { history: HandHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-gray-500 text-sm text-center mt-8">暂无数据</p>;
  }

  // Collect all players who appear in any hand
  const playerMeta = new Map<string, { name: string; avatar: string }>();
  history.forEach(h => h.players.forEach(p => {
    if (!playerMeta.has(p.playerId)) {
      playerMeta.set(p.playerId, { name: p.name, avatar: p.avatar });
    }
  }));

  // Build chip series: index 0 = initial (before hand 1), index N = after hand N
  const series = new Map<string, number[]>();
  for (const [pid] of playerMeta) {
    const firstHand = history.find(h => h.players.some(p => p.playerId === pid));
    if (!firstHand) continue;
    const firstP = firstHand.players.find(p => p.playerId === pid)!;
    const initialChips = firstP.endChips - firstP.chipDelta;

    const points: number[] = [initialChips];
    let lastKnown = initialChips;
    for (const hand of history) {
      const p = hand.players.find(pp => pp.playerId === pid);
      if (p) {
        lastKnown = p.endChips;
        points.push(p.endChips);
      } else {
        // Player eliminated — stop their line (don't extend)
        points.push(lastKnown);
      }
    }
    series.set(pid, points);
  }

  const allPlayers = [...playerMeta.entries()];
  const allValues = [...series.values()].flat();
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const yRange = maxVal - minVal || 1;
  const totalX = history.length; // 0..totalX

  // SVG layout
  const W = 280, H = 170;
  const padL = 38, padR = 12, padT = 12, padB = 20;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const toX = (i: number) => padL + (totalX > 0 ? (i / totalX) * cW : 0);
  const toY = (v: number) => padT + cH - ((v - minVal) / yRange) * cH;

  // Y grid lines (5 levels)
  const gridLevels = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="px-2">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        {/* Y grid */}
        {gridLevels.map(t => {
          const y = padT + t * cH;
          const v = Math.round(maxVal - t * yRange);
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#374151" strokeWidth={0.5} strokeDasharray="3 3" />
              <text x={padL - 3} y={y + 3} textAnchor="end" fontSize={7} fill="#6b7280">{v}</text>
            </g>
          );
        })}

        {/* X axis labels (every hand) */}
        {history.map((h, i) => (
          <text key={i} x={toX(i + 1)} y={H - padB + 10} textAnchor="middle" fontSize={7} fill="#6b7280">
            {h.round}
          </text>
        ))}
        <text x={padL} y={H - padB + 10} textAnchor="middle" fontSize={7} fill="#4b5563">0</text>

        {/* Baseline */}
        <line x1={padL} y1={padT + cH} x2={W - padR} y2={padT + cH} stroke="#4b5563" strokeWidth={0.5} />
        <line x1={padL} y1={padT} x2={padL} y2={padT + cH} stroke="#4b5563" strokeWidth={0.5} />

        {/* Player lines */}
        {allPlayers.map(([pid], ci) => {
          const pts = series.get(pid);
          if (!pts) return null;
          const color = CHART_COLORS[ci % CHART_COLORS.length];
          const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
          const lastX = toX(pts.length - 1);
          const lastY = toY(pts[pts.length - 1]);
          return (
            <g key={pid}>
              <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 mt-1">
        {allPlayers.map(([pid, meta], ci) => {
          const pts = series.get(pid);
          const last = pts?.[pts.length - 1] ?? 0;
          const color = CHART_COLORS[ci % CHART_COLORS.length];
          return (
            <div key={pid} className="flex items-center gap-1 text-xs">
              <span className="w-3 h-0.5 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
              <span style={{ color }}>{meta.avatar} {meta.name}</span>
              <span className="text-gray-400 font-mono">{last}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Hand entry (history tab) ──────────────────────────────────────────────────

function HandEntry({ entry, defaultOpen }: { entry: HandHistoryEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const topWinner = entry.winners[0];
  const winnerPlayer = entry.players.find(p => p.playerId === topWinner?.playerId);

  const streets: HandStreet[] = ['preflop', 'flop', 'turn', 'river'];
  const byStreet = new Map<HandStreet, typeof entry.actions>();
  for (const street of streets) {
    const acts = entry.actions.filter(a => a.street === street);
    if (acts.length) byStreet.set(street, acts);
  }

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800 active:bg-gray-700 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-gray-500 text-xs font-mono w-8 shrink-0">#{entry.round}</span>
        <span className="flex-1 min-w-0">
          {topWinner ? (
            <span className="text-yellow-300 text-xs font-semibold truncate block">
              {winnerPlayer?.avatar} {winnerPlayer?.name ?? topWinner.name}
              {topWinner.handName
                ? <span className="text-yellow-600 ml-1">({topWinner.handName})</span>
                : null}
            </span>
          ) : (
            <span className="text-gray-500 text-xs">—</span>
          )}
        </span>
        {topWinner && (
          <span className="text-green-400 text-xs font-bold shrink-0">+{winnerPlayer?.chipDelta ?? topWinner.amount}</span>
        )}
        <span className="text-gray-600 text-xs ml-1">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-3 py-2 bg-gray-900 space-y-2 text-xs">
          {/* Community cards */}
          {entry.communityCards.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 shrink-0">公共牌</span>
              <MiniCards cards={entry.communityCards} />
              {!entry.wasShowdown && (
                <span className="text-gray-600 text-[10px] ml-1">(未到摊牌)</span>
              )}
            </div>
          )}

          {/* Players */}
          <div className="space-y-0.5">
            {entry.players.map(p => (
              <div key={p.playerId} className="flex items-center gap-1.5">
                <span>{p.avatar}</span>
                {POS_LABEL[p.position] && (
                  <span className={`text-[10px] font-bold ${POS_COLOR[p.position]}`}>
                    {POS_LABEL[p.position]}
                  </span>
                )}
                <span className="text-gray-300 truncate max-w-[56px]">{p.name}</span>
                {/* Only show hole cards on actual showdown */}
                {p.holeCards && entry.wasShowdown && (
                  <MiniCards cards={p.holeCards} />
                )}
                <span className={`ml-auto font-semibold tabular-nums ${p.chipDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {p.chipDelta >= 0 ? '+' : ''}{p.chipDelta}
                </span>
              </div>
            ))}
          </div>

          {/* Actions by street */}
          {streets.filter(s => byStreet.has(s)).map(street => (
            <div key={street}>
              <div className="text-gray-600 text-[10px] uppercase tracking-wider mb-0.5">
                ── {STREET_LABEL[street]} ──
              </div>
              <div className="space-y-0.5">
                {byStreet.get(street)!.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5 pl-1">
                    <span className="text-base leading-none">{a.avatar}</span>
                    <span className="text-gray-400 truncate max-w-[55px]">{a.playerName}</span>
                    <span className={`font-semibold ${
                      a.actionType === 'fold'  ? 'text-red-400'
                      : a.actionType === 'raise' ? 'text-green-400'
                      : a.actionType === 'call'  ? 'text-blue-400'
                      : 'text-gray-400'
                    }`}>
                      {ACTION_LABEL[a.actionType]}
                      {a.amount !== undefined && ` ${a.amount}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="text-gray-600 text-[10px] text-right">底池 {entry.totalPot} 分</div>
        </div>
      )}
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

type Tab = 'history' | 'chart';

export function HandHistory({ history, open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('history');
  const reversed = [...history].reverse();

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`flex-1 py-2 text-sm font-semibold transition-colors ${
        tab === t
          ? 'text-white border-b-2 border-blue-400'
          : 'text-gray-500 border-b-2 border-transparent'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />}

      <div
        className={`fixed top-0 right-0 bottom-0 w-80 max-w-[90vw] bg-gray-900 border-l border-gray-700 z-50
          flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <span className="font-bold text-white text-sm">战绩</span>
          <span className="text-gray-500 text-xs">{history.length} 手牌</span>
          <button
            onClick={onClose}
            className="text-gray-400 text-xl leading-none min-w-[32px] min-h-[32px] flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 shrink-0 px-2">
          {tabBtn('history', '历史记录')}
          {tabBtn('chart', '计分牌走势')}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'history' && (
            <div className="p-3 space-y-2">
              {reversed.length === 0
                ? <p className="text-gray-500 text-sm text-center mt-8">暂无历史记录</p>
                : reversed.map((entry, i) => (
                    <HandEntry key={entry.round} entry={entry} defaultOpen={i === 0} />
                  ))
              }
            </div>
          )}

          {tab === 'chart' && (
            <div className="pt-4 pb-6">
              <ChipChart history={history} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
