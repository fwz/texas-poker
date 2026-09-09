import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomListEntry, RoomOptions } from '../../../shared/types';
import { getSocket } from '../hooks/useSocket';
import { useGameStore } from '../store/gameStore';

const DEFAULT_OPTIONS: RoomOptions = {
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  maxPlayers: 9,
  turnTimeLimit: 20,
};

const AVATARS = [
  '🐼','🦊','🐸','🐯','🦁','🐺','🐻','🦄',
  '🐨','🐹','🐙','🦖','🤖','👾','🦋','🐉',
];

const PHASE_LABEL: Record<string, string> = {
  waiting: '等待中',
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
};

export function Home() {
  const navigate = useNavigate();
  const { setPlayerId, setRoomCode, setGameState, avatar, setAvatar } = useGameStore();

  const [name, setName] = useState(() => localStorage.getItem('poker_player_name') ?? '');
  const [joinCode, setJoinCode] = useState('');
  const [options, setOptions] = useState<RoomOptions>(DEFAULT_OPTIONS);
  const [tab, setTab] = useState<'join' | 'create'>('join');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<RoomListEntry[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setJoinCode(room.toUpperCase());
      setTab('join');
    }
  }, []);

  // Load room list whenever join tab is active
  useEffect(() => {
    if (tab !== 'join') return;
    const socket = getSocket();
    socket.connect();
    setLoadingRooms(true);
    socket.emit('list_rooms', (list) => {
      setRooms(list);
      setLoadingRooms(false);
    });
  }, [tab]);

  const socket = getSocket();

  const saveName = (n: string) => {
    if (n) localStorage.setItem('poker_player_name', n);
  };

  const handleCreate = () => {
    if (!name.trim()) return setError('请输入你的名字');
    setBusy(true);
    saveName(name.trim());
    socket.connect();
    socket.emit('create_room', { playerName: name.trim(), avatar, options }, (res) => {
      setBusy(false);
      if ('error' in res) return setError(res.error);
      setPlayerId(res.playerId);
      setRoomCode(res.roomCode);
      setGameState(res.gameState);
      navigate('/game');
    });
  };

  const handleJoin = (code?: string) => {
    const roomCode = (code ?? joinCode).trim().toUpperCase();
    if (!name.trim()) return setError('请输入你的名字');
    if (!roomCode) return setError('请输入房间号');
    setBusy(true);
    saveName(name.trim());
    socket.connect();
    socket.emit('join_room', { roomCode, playerName: name.trim(), avatar }, (res) => {
      setBusy(false);
      if ('error' in res) return setError(res.error);
      setPlayerId(res.playerId);
      setRoomCode(roomCode);
      setGameState(res.gameState);
      navigate('/game');
    });
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 gap-5" style={{ minHeight: '100dvh' }}>
      <h1 className="text-3xl font-bold text-yellow-400">Texas Family Pot</h1>
      <p className="text-xs text-gray-500 -mt-3">计分牌仅供娱乐 - 勿用于赌博</p>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Name input */}
        <input
          className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 outline-none border border-gray-700 focus:border-yellow-400"
          placeholder="你的名字"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={16}
        />

        {/* Avatar picker */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5">选择头像</p>
          <div className="grid grid-cols-8 gap-1.5">
            {AVATARS.map(a => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                className={`text-2xl rounded-xl p-1 aspect-square flex items-center justify-center transition-all
                  ${avatar === a
                    ? 'bg-yellow-500/30 ring-2 ring-yellow-400 scale-110'
                    : 'bg-gray-800 active:bg-gray-700'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-xl overflow-hidden border border-gray-700">
          {(['join', 'create'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 font-semibold text-sm transition-colors
                ${tab === t ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400'}`}
            >
              {t === 'join' ? '加入房间' : '创建房间'}
            </button>
          ))}
        </div>

        {tab === 'join' && (
          <div className="flex flex-col gap-3">
            <input
              className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 outline-none border border-gray-700 focus:border-yellow-400 uppercase tracking-widest"
              placeholder="房间号"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />

            {/* Room list */}
            <div>
              <p className="text-xs text-gray-400 mb-1.5">
                当前可加入的房间
                {loadingRooms && <span className="ml-1 text-gray-600">加载中…</span>}
              </p>
              {!loadingRooms && rooms.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-2">暂无可加入的房间</p>
              )}
              <div className="flex flex-col gap-1.5">
                {rooms.map(room => (
                  <button
                    key={room.roomCode}
                    onClick={() => {
                      setJoinCode(room.roomCode);
                      handleJoin(room.roomCode);
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 active:bg-gray-700 text-left"
                  >
                    <span className="font-mono font-bold text-yellow-400 tracking-widest text-sm">{room.roomCode}</span>
                    <span className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{room.playerCount}/{room.maxPlayers} 人</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        room.phase === 'waiting' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'
                      }`}>
                        {PHASE_LABEL[room.phase] ?? room.phase}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'create' && (
          <div className="flex flex-col gap-2 text-sm">
            {[
              { label: '初始分数', key: 'startingStack' as const, step: 100, min: 100 },
              { label: '小盲注', key: 'smallBlind' as const, step: 5, min: 5 },
              { label: '大盲注', key: 'bigBlind' as const, step: 10, min: 10 },
              { label: '最多玩家', key: 'maxPlayers' as const, step: 1, min: 2 },
              { label: '操作时限（秒）', key: 'turnTimeLimit' as const, step: 5, min: 5 },
            ].map(({ label, key, step, min }) => (
              <label key={key} className="flex justify-between items-center">
                <span className="text-gray-400">{label}</span>
                <input
                  type="number"
                  className="w-24 px-2 py-1 rounded-lg bg-gray-800 text-white text-right border border-gray-700"
                  value={options[key]}
                  step={step}
                  min={min}
                  onChange={e => setOptions(o => ({ ...o, [key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={() => tab === 'join' ? handleJoin() : handleCreate()}
          disabled={busy}
          className="w-full py-3 rounded-xl bg-yellow-500 active:bg-yellow-700 text-black font-bold text-lg min-h-[48px] disabled:opacity-50"
        >
          {busy ? '连接中…' : tab === 'join' ? '加入' : '创建'}
        </button>
      </div>
    </div>
  );
}
