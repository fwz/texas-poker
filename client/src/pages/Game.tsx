import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionBar } from '../components/ActionBar';
import { HandHistory } from '../components/HandHistory';
import { Table } from '../components/Table';
import { getSocket, resetSocket, SERVER_URL, useSocketEvent } from '../hooks/useSocket';
import { playSound } from '../hooks/useSound';
import { useGameStore } from '../store/gameStore';
import type { HandHistoryEntry } from '../../../shared/types';

function computeStats(history: HandHistoryEntry[]) {
  const map = new Map<string, { vpip: number; pfr: number; hands: number }>();
  for (const hand of history) {
    for (const p of hand.players) {
      if (!map.has(p.playerId)) map.set(p.playerId, { vpip: 0, pfr: 0, hands: 0 });
      const s = map.get(p.playerId)!;
      s.hands++;
      const preflop = hand.actions.filter(a => a.playerId === p.playerId && a.street === 'preflop');
      const hasCall  = preflop.some(a => a.actionType === 'call');
      const hasRaise = preflop.some(a => a.actionType === 'raise');
      if (hasCall || hasRaise) s.vpip++;
      if (hasRaise) s.pfr++;
    }
  }
  // Convert counts to percentages
  const result = new Map<string, { vpip: number; pfr: number; hands: number }>();
  map.forEach((s, id) => {
    result.set(id, {
      vpip: s.hands > 0 ? (s.vpip / s.hands) * 100 : 0,
      pfr:  s.hands > 0 ? (s.pfr  / s.hands) * 100 : 0,
      hands: s.hands,
    });
  });
  return result;
}

export function Game() {
  const navigate = useNavigate();
  const { playerId, roomCode, gameState, setGameState, reset } = useGameStore();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [eliminatedMsg, setEliminatedMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const prevPhaseRef = useRef('');
  const prevActiveRef = useRef<string | null>(null);
  const prevWinnersKeyRef = useRef('');

  useEffect(() => {
    if (!playerId || !roomCode) navigate('/');
  }, [playerId, roomCode, navigate]);

  // On true browser close/refresh, fire-and-forget leave via sendBeacon.
  // This does NOT trigger on React Router navigations (those use handleLeave).
  useEffect(() => {
    if (!playerId || !roomCode) return;
    const handleBeforeUnload = () => {
      navigator.sendBeacon(`${SERVER_URL}/api/leave?playerId=${encodeURIComponent(playerId)}&roomCode=${encodeURIComponent(roomCode)}`);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [playerId, roomCode]);

  useSocketEvent('game_state_update', (state) => {
    setGameState(state);
  });

  useSocketEvent('player_disconnected', () => {});

  useSocketEvent('player_eliminated', ({ playerId: eliminatedId }) => {
    if (eliminatedId === playerId) {
      setEliminatedMsg('记分牌已用完，你已离开牌局');
      setTimeout(() => {
        resetSocket();
        reset();
        navigate('/');
      }, 2500);
    }
  });

  // Sound effects on game state transitions
  useEffect(() => {
    if (!gameState || !playerId) return;
    const { phase, activePlayerId, winners } = gameState;
    const winnersKey = winners?.map(w => w.playerId).join(',') ?? '';

    if (phase !== prevPhaseRef.current) {
      if (phase === 'preflop') playSound('newRound');
      else if (phase === 'flop' || phase === 'turn' || phase === 'river') playSound('deal');
    }
    if (activePlayerId === playerId && activePlayerId !== prevActiveRef.current) {
      playSound('yourTurn');
    }
    if (winnersKey && winnersKey !== prevWinnersKeyRef.current) {
      if (winners?.some(w => w.playerId === playerId)) playSound('win');
    }

    prevPhaseRef.current = phase;
    prevActiveRef.current = activePlayerId;
    prevWinnersKeyRef.current = winnersKey;
  }, [gameState, playerId]);

  // 10-second auto-ready countdown
  const showdownKey = gameState?.phase === 'showdown' && gameState.winners?.length
    ? `r${gameState.round}`
    : '';

  useEffect(() => {
    if (!showdownKey) { setCountdown(null); return; }
    setCountdown(10);
    const id = setInterval(() => {
      setCountdown(c => {
        if (c === null || c <= 1) {
          clearInterval(id);
          getSocket().emit('ready');
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [showdownKey]);

  const statsMap = useMemo(
    () => computeStats(gameState?.history ?? []),
    [gameState?.history],
  );

  if (!gameState || !playerId) return null;

  const isHost = gameState.hostId === playerId;
  const isWaiting = gameState.phase === 'waiting';
  const isShowdown = gameState.phase === 'showdown';
  const inviteUrl = `${window.location.origin}/?room=${roomCode}`;

  const handleLeave = () => {
    // Tell server to remove immediately (no 30-second grace), then tear down socket.
    getSocket().emit('leave_room');
    resetSocket();
    reset();
    navigate('/');
  };

  const handleReady = () => {
    setCountdown(null);
    getSocket().emit('ready');
  };

  const handleShare = async () => {
    await navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (eliminatedMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-5xl mb-4">😔</div>
          <p className="text-white text-lg font-semibold">{eliminatedMsg}</p>
          <p className="text-gray-400 text-sm mt-2">正在返回首页…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-36">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800">
        <button onClick={handleLeave} className="text-gray-400 text-sm min-h-[44px] min-w-[44px]">
          ← 离开
        </button>

        {/* Room code + share */}
        <div className="flex flex-col items-center">
          <div className="text-xs text-gray-500">计分牌 · 仅供娱乐</div>
          <div className="flex items-center gap-1.5">
            <span
              className="text-yellow-400 font-mono font-bold tracking-widest select-all cursor-text"
              style={{ userSelect: 'all' }}
            >
              {roomCode}
            </span>
            <button
              onClick={handleShare}
              className="text-blue-400 text-base min-h-[32px] min-w-[32px] flex items-center justify-center"
              title="分享链接"
            >
              {copied ? '✓' : '🔗'}
            </button>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1">
          {/* VPIP/PFR toggle */}
          <button
            onClick={() => setShowStats(s => !s)}
            title="VPIP/PFR 统计"
            className={`text-sm min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-colors
              ${showStats ? 'bg-blue-700 text-white' : 'text-gray-400'}`}
          >
            📊
          </button>
          {/* History toggle */}
          <button
            onClick={() => setShowHistory(s => !s)}
            title="历史记录"
            className={`text-sm min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-colors
              ${showHistory ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
          >
            📋
            {gameState.history.length > 0 && (
              <span className="text-[10px] text-yellow-400 ml-0.5">{gameState.history.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 flex flex-col justify-center p-2">
        <Table
          state={gameState}
          playerId={playerId}
          showStats={showStats}
          statsMap={statsMap}
        />
      </div>

      {/* Winners banner */}
      {isShowdown && gameState.winners && gameState.winners.length > 0 && (
        <div className="mx-4 mb-2 p-3 rounded-xl bg-yellow-950 border border-yellow-600 text-center">
          {gameState.winners.map(w => {
            const winner = gameState.players.find(p => p.id === w.playerId);
            const profit = w.amount - (winner?.totalBetThisRound ?? 0);
            return (
              <div key={w.playerId} className="text-yellow-300 font-semibold">
                {winner?.avatar} {winner?.name}
                <span className="text-green-400 ml-1">+{profit}</span>
                <span className="text-yellow-600 ml-1 text-sm">
                  (底池 {w.amount}
                  {w.handName ? ` · ${w.handName}` : ''})
                </span>
              </div>
            );
          })}
          <div className="mt-2 flex items-center justify-center gap-3">
            <button
              onClick={handleReady}
              className="px-6 py-2 rounded-lg bg-yellow-500 active:bg-yellow-700 text-black font-bold text-sm min-h-[44px]"
            >
              准备好了
            </button>
            {countdown !== null && (
              <span className="text-yellow-400 font-mono text-xl font-bold w-8 text-center tabular-nums">
                {countdown}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Waiting / Start */}
      {isWaiting && (
        <div className="mx-4 mb-2 p-3 rounded-xl bg-gray-800 text-center">
          <p className="text-gray-400 text-sm mb-2">
            {gameState.players.length} 名玩家在房间中
          </p>
          {isHost ? (
            <button
              onClick={() => getSocket().emit('start_game', () => {})}
              disabled={gameState.players.length < 2}
              className="px-8 py-3 rounded-xl bg-green-600 active:bg-green-800 font-bold text-sm min-h-[44px] disabled:opacity-40"
            >
              开始游戏
            </button>
          ) : (
            <p className="text-gray-500 text-sm">等待房主开始…</p>
          )}
        </div>
      )}

      {/* Action bar */}
      {!isWaiting && !isShowdown && (
        <ActionBar
          key={`${gameState.round}-${gameState.activePlayerId}`}
          state={gameState}
          playerId={playerId}
        />
      )}

      {/* Hand history sidebar */}
      <HandHistory
        history={gameState.history}
        open={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}
