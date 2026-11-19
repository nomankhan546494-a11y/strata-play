import { useMemo } from 'react';
import { Bookmark, Link2, Play, Trash2 } from 'lucide-react';
import { CustomGameLink, GameTitle, SessionRecord } from '../types/gaming';
import { GameArtwork } from './GameArtwork';

interface LibraryViewProps {
  games: GameTitle[];
  customGames: CustomGameLink[];
  libraryIds: string[];
  records: Record<string, SessionRecord>;
  cloudSynced: boolean;
  onLaunchGame: (game: GameTitle) => void;
  onToggleLibrary: (gameId: string) => void;
  onRemoveCustomGame: (id: string) => Promise<void>;
  onBrowseCatalog: () => void;
}

export function LibraryView({
  games,
  customGames,
  libraryIds,
  records,
  cloudSynced,
  onLaunchGame,
  onToggleLibrary,
  onRemoveCustomGame,
  onBrowseCatalog,
}: LibraryViewProps) {
  const customTitles = useMemo<GameTitle[]>(
    () =>
      customGames.map((cg) => ({
        id: cg.customGameId,
        engine: 'custom_link',
        title: cg.customName,
        subtitle: cg.gameUrl,
        category: cg.category || 'Custom',
        releaseYear: 2026,
        maxResolution: '1080p',
        maxFps: 60,
        inputSupport: 'Browser & Keyboard',
        players: 'Cloud Link Stream',
        coverImage: '',
        accentHex: '#10B981',
        controlsSummary: [],
        description: cg.gameUrl,
        streamUrl: cg.gameUrl,
        customUrl: cg.gameUrl,
        isCustom: true,
      })),
    [customGames]
  );

  const savedGames = useMemo(
    () => games.filter((g) => libraryIds.includes(g.id)),
    [games, libraryIds]
  );

  const allLookup = useMemo(() => [...customTitles, ...games], [customTitles, games]);

  const historyRows = useMemo(() => {
    return Object.values(records)
      .filter((r) => r.sessionsCount > 0)
      .sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime())
      .map((rec) => ({
        rec,
        game: allLookup.find((g) => g.id === rec.gameId),
      }))
      .filter((item): item is { rec: SessionRecord; game: GameTitle } => Boolean(item.game));
  }, [records, allLookup]);

  return (
    <div className="space-y-12">
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-3xl font-bold text-white">Your Library</h1>
          <span className="text-xs text-slate-400">
            {cloudSynced ? 'Synced to your cloud profile across devices' : 'Saved locally on this device'}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Bookmarked titles, custom game links, and saved session checkpoints ready to resume.
        </p>
      </section>

      {/* Custom Game Links */}
      {customTitles.length > 0 && (
        <section className="space-y-5">
          <h2 className="font-display text-xl font-semibold text-white">Custom Game Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {customTitles.map((cg) => (
              <div
                key={cg.id}
                className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#12161F] p-5 space-y-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Link2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                    <span>{cg.category}</span>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-white truncate">{cg.title}</h3>
                  <p className="text-xs font-mono text-slate-400 truncate">{cg.customUrl}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onLaunchGame(cg)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    <span>Play Link</span>
                  </button>
                  <button
                    onClick={() => onRemoveCustomGame(cg.id)}
                    aria-label={`Remove ${cg.title}`}
                    className="rounded-lg border border-white/10 bg-[#0B0D12] p-2 text-slate-300 hover:border-red-500/40 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bookmarked Games */}
      <section className="space-y-5">
        <h2 className="font-display text-xl font-semibold text-white">Saved Cloud Titles</h2>
        {savedGames.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#12161F] p-10 text-center space-y-4">
            <Bookmark className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-display text-lg font-semibold text-white">No saved games yet</p>
              <p className="text-sm text-slate-400">
                Bookmark any title in Discover to keep it ready in your cloud library.
              </p>
            </div>
            <button
              onClick={onBrowseCatalog}
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-5 py-2.5 text-xs font-semibold text-slate-950 cursor-pointer"
            >
              Browse Catalog
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedGames.map((game) => (
              <div
                key={game.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#12161F]"
              >
                <div className="aspect-[4/3] overflow-hidden bg-[#0B0D12]">
                  <GameArtwork
                    src={game.coverImage}
                    alt={game.title}
                    title={game.title}
                    accentHex={game.accentHex}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400">
                      {game.category} · {game.maxResolution} {game.maxFps} FPS
                    </p>
                    <h3 className="font-display text-lg font-semibold text-white">{game.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onLaunchGame(game)}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      <span>Play</span>
                    </button>
                    <button
                      onClick={() => onToggleLibrary(game.id)}
                      className="rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Play History & Cloud Checkpoints Table */}
      <section className="space-y-5">
        <h2 className="font-display text-xl font-semibold text-white">Session History & Checkpoints</h2>
        {historyRows.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#12161F] p-8 text-center text-sm text-slate-400">
            Play any game for a few moments to record your high score and cloud checkpoint.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#12161F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/[0.08] text-xs text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Title</th>
                  <th className="px-5 py-3.5 font-medium text-right">High Score</th>
                  <th className="px-5 py-3.5 font-medium text-right">Sessions</th>
                  <th className="px-5 py-3.5 font-medium text-right">Playtime</th>
                  <th className="px-5 py-3.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] tabular-nums">
                {historyRows.map(({ rec, game }) => (
                  <tr key={rec.gameId} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 font-medium text-white">{game.title}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-emerald-400">
                      {rec.highScore.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300">{rec.sessionsCount}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300">
                      {Math.max(1, Math.round(rec.totalSeconds / 60))}m
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => onLaunchGame(game)}
                        className="rounded-md bg-white/10 hover:bg-emerald-500 hover:text-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                      >
                        Resume
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
