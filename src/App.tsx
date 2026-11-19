import { useEffect, useMemo, useState } from 'react';
import { CloudStreamPlayer } from './components/CloudStreamPlayer';
import { DiscoverView } from './components/DiscoverView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { LibraryView } from './components/LibraryView';
import { MultiplayerView } from './components/MultiplayerView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { CloudAccountProvider, useCloudAccount } from './contexts/CloudAccountContext';
import { GAME_CATALOG, INITIAL_ROOMS } from './data/games';
import { AppTab, GameTitle, MultiplayerRoom } from './types/gaming';
import { soundFx } from './utils/soundFx';

function StrataPlayApp() {
  const {
    profile,
    settings,
    records,
    libraryIds,
    customGames,
    cloudRooms,
    cloudSynced,
    updateSettings,
    toggleLibrary,
    recordSession,
    addCustomGame,
    renameCustomGame,
    removeCustomGame,
    createCloudRoom,
    joinCloudRoom,
  } = useCloudAccount();

  const [activeTab, setActiveTab] = useState<AppTab>('discover');
  const [hostedGames, setHostedGames] = useState<GameTitle[]>(GAME_CATALOG);
  const [activeStream, setActiveStream] = useState<{ game: GameTitle; roomCode?: string } | null>(null);

  useEffect(() => {
    soundFx.enabled = settings.audioEnabled;
  }, [settings.audioEnabled]);

  // Fetch backend-hosted game catalog on startup
  useEffect(() => {
    let mounted = true;
    fetch('/api/games')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data && Array.isArray(data.games) && data.games.length > 0) {
          setHostedGames(data.games);
        }
      })
      .catch(() => {
        // Fallback already initialized to GAME_CATALOG
      });
    return () => {
      mounted = false;
    };
  }, []);

  const mergedRooms = useMemo<MultiplayerRoom[]>(() => {
    const cloudCodes = new Set(cloudRooms.map((r) => r.code));
    const defaults = INITIAL_ROOMS.filter((r) => !cloudCodes.has(r.code));
    return [...cloudRooms, ...defaults];
  }, [cloudRooms]);

  const gamerTag = profile?.gamerTag || 'guest_player';

  const handleQuickPlay = () => {
    const sorted = Object.values(records)
      .filter((r) => r.sessionsCount > 0)
      .sort((a, b) => new Date(b.lastPlayedAt).getTime() - new Date(a.lastPlayedAt).getTime());
    const lastGame = sorted[0] ? hostedGames.find((g) => g.id === sorted[0].gameId) : null;
    setActiveStream({ game: lastGame || hostedGames[0] });
  };

  const handleJoinRoom = async (room: MultiplayerRoom, game: GameTitle) => {
    if (room.hostUid) {
      await joinCloudRoom(room.id, room.playersCurrent, room.playersMax);
    }
    setActiveStream({ game, roomCode: room.code });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D12] text-[#F3F5F8]">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onQuickPlay={handleQuickPlay}
        quickPlayLabel="Quick Play"
      />

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-6 py-8 sm:py-10">
        {activeTab === 'discover' && (
          <DiscoverView
            games={hostedGames}
            customGames={customGames}
            libraryIds={libraryIds}
            records={records}
            onLaunchGame={(game) => setActiveStream({ game })}
            onToggleLibrary={toggleLibrary}
            onAddCustomGame={addCustomGame}
            onRenameCustomGame={renameCustomGame}
            onRemoveCustomGame={removeCustomGame}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            games={hostedGames}
            customGames={customGames}
            libraryIds={libraryIds}
            records={records}
            cloudSynced={cloudSynced}
            onLaunchGame={(game) => setActiveStream({ game })}
            onToggleLibrary={toggleLibrary}
            onRemoveCustomGame={removeCustomGame}
            onBrowseCatalog={() => setActiveTab('discover')}
          />
        )}

        {activeTab === 'multiplayer' && (
          <MultiplayerView
            games={hostedGames}
            rooms={mergedRooms}
            gamerTag={gamerTag}
            defaultRegion={settings.region}
            onCreateRoom={createCloudRoom}
            onJoinRoom={handleJoinRoom}
          />
        )}

        {activeTab === 'profile' && <ProfileView />}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            cloudSynced={cloudSynced}
            onUpdateSettings={updateSettings}
          />
        )}
      </main>

      <footer className="border-t border-white/[0.06] py-6 px-6">
        <div className="mx-auto flex max-w-[1360px] flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>Strata Play Cloud Gaming</span>
          <div className="flex items-center gap-5">
            <button onClick={() => setActiveTab('discover')} className="hover:text-slate-300 cursor-pointer">
              Catalog
            </button>
            <button onClick={() => setActiveTab('profile')} className="hover:text-slate-300 cursor-pointer">
              Cloud Profile
            </button>
            <button onClick={() => setActiveTab('settings')} className="hover:text-slate-300 cursor-pointer">
              Stream Settings
            </button>
          </div>
        </div>
      </footer>

      {activeStream && (
        <CloudStreamPlayer
          game={activeStream.game}
          roomCode={activeStream.roomCode}
          gamerTag={gamerTag}
          settings={settings}
          previousHighScore={records[activeStream.game.id]?.highScore || 0}
          onUpdateQuality={(q) => updateSettings({ ...settings, quality: q })}
          onToggleAudio={() => updateSettings({ ...settings, audioEnabled: !settings.audioEnabled })}
          onEndSession={async (score, durationSeconds, checkpointData) => {
            const gameId = activeStream.game.id;
            setActiveStream(null);
            await recordSession(gameId, score, durationSeconds, checkpointData);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CloudAccountProvider>
        <StrataPlayApp />
      </CloudAccountProvider>
    </ErrorBoundary>
  );
}
