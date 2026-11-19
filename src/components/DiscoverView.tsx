import { useMemo, useState } from 'react';
import { Bookmark, Check, Link2, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { FEATURED_IDS } from '../data/games';
import { CustomGameLink, GameCategory, GameTitle, SessionRecord } from '../types/gaming';
import { GameArtwork } from './GameArtwork';

interface DiscoverViewProps {
  games: GameTitle[];
  customGames: CustomGameLink[];
  libraryIds: string[];
  records: Record<string, SessionRecord>;
  onLaunchGame: (game: GameTitle) => void;
  onToggleLibrary: (gameId: string) => void;
  onAddCustomGame: (name: string, url: string, category: CustomGameLink['category']) => Promise<void>;
  onRenameCustomGame: (id: string, newName: string) => Promise<void>;
  onRemoveCustomGame: (id: string) => Promise<void>;
}

const CATEGORIES: GameCategory[] = ['All', 'Racing', 'Action', 'Shooter', 'Battle Royale', 'Custom'];

export function DiscoverView({
  games,
  customGames,
  libraryIds,
  records,
  onLaunchGame,
  onToggleLibrary,
  onAddCustomGame,
  onRenameCustomGame,
  onRemoveCustomGame,
}: DiscoverViewProps) {
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [category, setCategory] = useState<GameCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Custom Game Link Form State
  const [showAddLink, setShowAddLink] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customCat, setCustomCat] = useState<CustomGameLink['category']>('Custom');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [savingLink, setSavingLink] = useState(false);

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const allCatalogGames = useMemo<GameTitle[]>(() => {
    const mappedCustom: GameTitle[] = customGames.map((cg) => ({
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
      controlsSummary: ['Streams inside 1-hour cloud session player'],
      description: `Custom linked game streamed from ${cg.gameUrl}`,
      streamUrl: cg.gameUrl,
      customUrl: cg.gameUrl,
      isCustom: true,
    }));
    return [...mappedCustom, ...games];
  }, [customGames, games]);

  const featuredGames = useMemo(
    () => FEATURED_IDS.map((id) => games.find((g) => g.id === id)).filter((g): g is GameTitle => Boolean(g)),
    [games]
  );

  const activeHero = featuredGames[featuredIndex] ?? games[0];
  const heroSaved = libraryIds.includes(activeHero.id);

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allCatalogGames.filter((g) => {
      const catMatch = category === 'All' || g.category === category;
      const textMatch =
        !q ||
        g.title.toLowerCase().includes(q) ||
        g.subtitle.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [allCatalogGames, category, searchQuery]);

  const recentPlayed = useMemo(() => {
    return Object.values(records)
      .filter((r) => r.sessionsCount > 0)
      .sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime())
      .slice(0, 3)
      .map((rec) => ({
        record: rec,
        game: allCatalogGames.find((g) => g.id === rec.gameId),
      }))
      .filter((item): item is { record: SessionRecord; game: GameTitle } => Boolean(item.game));
  }, [records, allCatalogGames]);

  const handleSaveCustomLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError(null);
    const trimmedUrl = customUrl.trim();
    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    if (!customName.trim()) {
      setLinkError('Please enter a name for your game.');
      return;
    }
    try {
      new URL(normalizedUrl);
    } catch {
      setLinkError('Please enter a valid game link URL (e.g. https://example.com/game).');
      return;
    }

    setSavingLink(true);
    try {
      await onAddCustomGame(customName.trim(), normalizedUrl, customCat);
      setCustomName('');
      setCustomUrl('');
      setShowAddLink(false);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not save custom game link.');
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Spotlight */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-8 relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#12161F] min-h-[340px] lg:min-h-[430px]">
          <GameArtwork
            src={activeHero.heroImage || activeHero.coverImage}
            alt={activeHero.title}
            title={activeHero.title}
            accentHex={activeHero.accentHex}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12] via-[#0B0D12]/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B0D12]/85 via-[#0B0D12]/30 to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-end p-6 sm:p-8 max-w-2xl space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span>{activeHero.category}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{activeHero.maxResolution} {activeHero.maxFps} FPS</span>
              <span aria-hidden="true">·</span>
              <span>60-Minute Cloud Session</span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
              {activeHero.title}
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
              {activeHero.description}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => onLaunchGame(activeHero)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                <span>{records[activeHero.id]?.highScore ? 'Resume in Cloud' : 'Play in Cloud'}</span>
              </button>
              <button
                onClick={() => onToggleLibrary(activeHero.id)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-black/40 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {heroSaved ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4" aria-hidden="true" />
                    <span>Save to Library</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Spotlight Queue */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#12161F] p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-white">Featured Streams</h2>
            <p className="text-xs text-slate-400">
              Hosted on low-latency GPU nodes with 1-hour cloud sessions
            </p>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            {featuredGames.map((item, idx) => {
              const selected = idx === featuredIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => setFeaturedIndex(idx)}
                  className={`flex items-center gap-3.5 rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                    selected
                      ? 'border-emerald-500/50 bg-emerald-500/[0.08]'
                      : 'border-white/[0.06] bg-[#0B0D12]/60 hover:border-white/15'
                  }`}
                >
                  <GameArtwork
                    src={item.coverImage}
                    alt={item.title}
                    title={item.title}
                    accentHex={item.accentHex}
                    className="h-14 w-20 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-display text-sm font-semibold text-white truncate">{item.title}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {item.category} · {item.maxResolution} {item.maxFps} FPS
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/[0.08] pt-3.5 flex items-center justify-between text-xs text-slate-400">
            <span className="truncate">{activeHero.controlsSummary[0]}</span>
            <button
              onClick={() => setShowAddLink(true)}
              className="text-emerald-400 hover:text-emerald-300 font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              + Add Game Link
            </button>
          </div>
        </div>
      </section>

      {/* Continue Playing Strip */}
      {recentPlayed.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold text-white">Continue Playing</h2>
            <span className="text-xs text-slate-400">Cloud progress ready to resume</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {recentPlayed.map(({ game, record }) => (
              <div
                key={game.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#12161F] p-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <GameArtwork
                    src={game.coverImage}
                    alt={game.title}
                    title={game.title}
                    accentHex={game.accentHex}
                    className="h-14 w-20 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <h3 className="font-display text-sm font-semibold text-white truncate">{game.title}</h3>
                    <p className="text-xs text-slate-400 font-mono tabular-nums truncate">
                      Best {record.highScore.toLocaleString()} · {Math.max(1, Math.round(record.totalSeconds / 60))}m
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onLaunchGame(game)}
                  className="rounded-lg bg-white/10 hover:bg-emerald-500 hover:text-slate-950 px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Resume
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Custom Game Link Drawer/Form */}
      {showAddLink && (
        <section className="rounded-2xl border border-emerald-500/30 bg-[#12161F] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold text-white">Add Custom Game Link</h2>
              <p className="text-xs text-slate-400">
                Paste any web game URL and choose the name you want to save it under.
              </p>
            </div>
            <button
              onClick={() => setShowAddLink(false)}
              aria-label="Close add game link form"
              className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSaveCustomLink} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4 space-y-1.5">
              <label htmlFor="custom-game-name" className="block text-xs font-medium text-slate-300">
                Game Name
              </label>
              <input
                id="custom-game-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. My Arena Game"
                maxLength={80}
                className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-5 space-y-1.5">
              <label htmlFor="custom-game-url" className="block text-xs font-medium text-slate-300">
                Game Link URL
              </label>
              <input
                id="custom-game-url"
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://..."
                maxLength={500}
                className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-3 flex items-center gap-2.5">
              <select
                aria-label="Custom Game Category"
                value={customCat}
                onChange={(e) => setCustomCat(e.target.value as CustomGameLink['category'])}
                className="rounded-lg border border-white/10 bg-[#0B0D12] px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                <option value="Custom">Custom</option>
                <option value="Action">Action</option>
                <option value="Racing">Racing</option>
                <option value="Strategy">Strategy</option>
                <option value="Puzzle">Puzzle</option>
              </select>
              <button
                type="submit"
                disabled={savingLink}
                className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 px-4 py-2.5 text-sm font-semibold text-slate-950 whitespace-nowrap cursor-pointer"
              >
                {savingLink ? 'Saving...' : 'Save Link'}
              </button>
            </div>
          </form>

          {linkError && <p className="text-xs text-red-400">{linkError}</p>}
        </section>
      )}

      {/* Catalog Filter Bar & Grid */}
      <section className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-[#12161F] p-1 w-fit">
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search games or links..."
                aria-label="Search games"
                className="w-full rounded-lg border border-white/[0.08] bg-[#12161F] pl-9 pr-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() => setShowAddLink((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#12161F] hover:bg-white/5 px-3.5 py-2 text-xs font-medium text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Add Game Link</span>
            </button>
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#12161F] p-12 text-center space-y-3">
            <p className="font-display text-lg font-semibold text-white">No matching games found</p>
            <p className="text-sm text-slate-400">Clear your filter or add a custom game link to stream it here.</p>
            <button
              onClick={() => {
                setCategory('All');
                setSearchQuery('');
              }}
              className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 text-xs font-medium text-white cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGames.map((game) => {
              const isSaved = libraryIds.includes(game.id);
              const rec = records[game.id];
              const isEditing = editingId === game.id;

              return (
                <article
                  key={game.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#12161F] transition-colors hover:border-white/20"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#0B0D12]">
                    {game.isCustom ? (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#14231F] via-[#12161F] to-[#0B0D12] p-6 text-center">
                        <Link2 className="h-9 w-9 text-emerald-400 mb-3" aria-hidden="true" />
                        <p className="text-xs font-mono text-slate-400 truncate max-w-full">{game.customUrl}</p>
                      </div>
                    ) : (
                      <GameArtwork
                        src={game.coverImage}
                        alt={game.title}
                        title={game.title}
                        accentHex={game.accentHex}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{game.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{game.maxResolution} {game.maxFps} FPS</span>
                        {rec && rec.highScore > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400 font-mono tabular-nums">
                              Best {rec.highScore.toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>

                      {isEditing ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (editingName.trim()) {
                              await onRenameCustomGame(game.id, editingName.trim());
                            }
                            setEditingId(null);
                          }}
                          className="flex items-center gap-2 pt-1"
                        >
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            maxLength={80}
                            autoFocus
                            className="flex-1 rounded-md border border-emerald-500/50 bg-[#0B0D12] px-2.5 py-1 text-sm text-white focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-slate-950 cursor-pointer"
                          >
                            Save
                          </button>
                        </form>
                      ) : (
                        <h3 className="font-display text-lg font-semibold text-white truncate">{game.title}</h3>
                      )}

                      <p className="text-xs text-slate-400 line-clamp-2">{game.subtitle}</p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => onLaunchGame(game)}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        <span>{rec && rec.highScore > 0 ? 'Resume' : 'Play'}</span>
                      </button>

                      {game.isCustom ? (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(game.id);
                              setEditingName(game.title);
                            }}
                            aria-label={`Rename ${game.title}`}
                            title="Rename game"
                            className="rounded-lg border border-white/10 bg-[#0B0D12] p-2 text-slate-300 hover:border-white/25 hover:text-white transition-colors cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onRemoveCustomGame(game.id)}
                            aria-label={`Delete ${game.title}`}
                            title="Remove link"
                            className="rounded-lg border border-white/10 bg-[#0B0D12] p-2 text-slate-300 hover:border-red-500/40 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => onToggleLibrary(game.id)}
                          aria-label={isSaved ? `Remove ${game.title} from library` : `Save ${game.title} to library`}
                          className={`rounded-lg border p-2 transition-colors cursor-pointer ${
                            isSaved
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                              : 'border-white/10 bg-[#0B0D12] text-slate-300 hover:border-white/25'
                          }`}
                        >
                          {isSaved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
