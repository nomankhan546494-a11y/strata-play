import { useMemo, useState } from 'react';
import { Check, Copy, Play, Plus, Users } from 'lucide-react';
import { GameTitle, MultiplayerRoom, ServerRegion } from '../types/gaming';

interface MultiplayerViewProps {
  games: GameTitle[];
  rooms: MultiplayerRoom[];
  gamerTag: string;
  defaultRegion: ServerRegion;
  onCreateRoom: (room: Omit<MultiplayerRoom, 'id' | 'createdAt' | 'hostUid'>) => Promise<MultiplayerRoom>;
  onJoinRoom: (room: MultiplayerRoom, game: GameTitle) => Promise<void>;
}

const REGIONS: ('All' | ServerRegion)[] = ['All', 'Tokyo East', 'Singapore', 'Frankfurt', 'US West'];

export function MultiplayerView({
  games,
  rooms,
  gamerTag,
  defaultRegion,
  onCreateRoom,
  onJoinRoom,
}: MultiplayerViewProps) {
  const [regionFilter, setRegionFilter] = useState<'All' | ServerRegion>('All');
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [selectedGameId, setSelectedGameId] = useState(games[0]?.id || 'slow-roads');
  const [mode, setMode] = useState<MultiplayerRoom['mode']>('Co-op Survival');
  const [region, setRegion] = useState<ServerRegion>(defaultRegion);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filteredRooms = useMemo(
    () => rooms.filter((r) => regionFilter === 'All' || r.region === regionFilter),
    [rooms, regionFilter]
  );

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1600);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    setCreating(true);
    try {
      const code = `STP-${Math.floor(1000 + Math.random() * 9000)}`;
      const created = await onCreateRoom({
        code,
        name: roomName.trim(),
        host: gamerTag,
        gameId: selectedGameId,
        mode,
        region,
        playersCurrent: 1,
        playersMax: maxPlayers,
      });
      setRoomName('');
      setShowCreate(false);
      const gameObj = games.find((g) => g.id === created.gameId);
      if (gameObj) {
        await onJoinRoom(created, gameObj);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-10">
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold text-white">Multiplayer Lobbies</h1>
          <p className="text-sm text-slate-400">
            Join an active WebSocket arena or host a shared 1-hour cloud session for friends.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-slate-950 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Create Lobby</span>
        </button>
      </section>

      {showCreate && (
        <form
          onSubmit={handleCreateSubmit}
          className="rounded-2xl border border-emerald-500/30 bg-[#12161F] p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
        >
          <div className="md:col-span-4 space-y-1.5">
            <label htmlFor="lobby-name" className="block text-xs font-medium text-slate-300">
              Lobby Name
            </label>
            <input
              id="lobby-name"
              type="text"
              required
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="e.g. Midnight Drift Run"
              maxLength={80}
              className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-3 space-y-1.5">
            <label htmlFor="lobby-game" className="block text-xs font-medium text-slate-300">
              Game
            </label>
            <select
              id="lobby-game"
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <label htmlFor="lobby-mode" className="block text-xs font-medium text-slate-300">
                Mode
              </label>
              <select
                id="lobby-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as MultiplayerRoom['mode'])}
                className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-2.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                <option value="Co-op Survival">Co-op</option>
                <option value="1v1 Duel">1v1 Duel</option>
                <option value="Time Attack">Time Attack</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lobby-region" className="block text-xs font-medium text-slate-300">
                Region
              </label>
              <select
                id="lobby-region"
                value={region}
                onChange={(e) => setRegion(e.target.value as ServerRegion)}
                className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-2.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                <option value="Singapore">Singapore</option>
                <option value="Tokyo East">Tokyo East</option>
                <option value="Frankfurt">Frankfurt</option>
                <option value="US West">US West</option>
              </select>
            </div>
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <select
              aria-label="Max players"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="rounded-lg border border-white/10 bg-[#0B0D12] px-2.5 py-2.5 text-sm text-white cursor-pointer"
            >
              <option value={2}>2P</option>
              <option value={4}>4P</option>
              <option value={8}>8P</option>
            </select>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-2.5 text-sm font-semibold text-slate-950 whitespace-nowrap cursor-pointer"
            >
              {creating ? 'Starting...' : 'Host'}
            </button>
          </div>
        </form>
      )}

      {/* Region Filter */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-[#12161F] p-1 w-fit">
        {REGIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRegionFilter(r)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              regionFilter === r ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Lobbies List */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#12161F]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/[0.08] text-xs text-slate-400">
            <tr>
              <th className="px-5 py-3.5 font-medium">Lobby & Game</th>
              <th className="px-5 py-3.5 font-medium">Mode</th>
              <th className="px-5 py-3.5 font-medium">Region</th>
              <th className="px-5 py-3.5 font-medium text-right">Players</th>
              <th className="px-5 py-3.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {filteredRooms.map((room) => {
              const game = games.find((g) => g.id === room.gameId) || games[0];
              const isCopied = copiedCode === room.code;
              return (
                <tr key={room.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-4">
                    <p className="font-display font-semibold text-white">{room.name}</p>
                    <p className="text-xs text-slate-400">
                      {game.title} · Host {room.host} · {room.code}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-300 whitespace-nowrap">{room.mode}</td>
                  <td className="px-5 py-4 text-slate-300 whitespace-nowrap">{room.region}</td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {room.playersCurrent}/{room.playersMax}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => handleCopyCode(room.code)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                      >
                        {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{isCopied ? 'Copied' : 'Code'}</span>
                      </button>
                      <button
                        onClick={() => onJoinRoom(room, game)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        <span>Join & Play</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
