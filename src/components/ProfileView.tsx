import { useEffect, useState } from 'react';
import { Cloud, LogIn, LogOut, UserCheck } from 'lucide-react';
import { useCloudAccount } from '../contexts/CloudAccountContext';

const AVATAR_SWATCHES = ['#10B981', '#F59E0B', '#38BDF8', '#F97316', '#A78BFA'];

export function ProfileView() {
  const {
    user,
    authReady,
    authBusy,
    authError,
    profile,
    records,
    customGames,
    libraryIds,
    signInWithGoogle,
    logout,
    updateProfileInfo,
  } = useCloudAccount();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [gamerTag, setGamerTag] = useState(profile?.gamerTag || '');
  const [avatarColor, setAvatarColor] = useState(profile?.avatarColor || '#10B981');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setGamerTag(profile.gamerTag);
      setAvatarColor(profile.avatarColor);
    }
  }, [profile]);

  const stats = Object.values(records);
  const totalMinutes = Math.round(stats.reduce((acc, r) => acc + r.totalSeconds, 0) / 60);
  const peakScore = stats.reduce((max, r) => Math.max(max, r.highScore), 0);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await updateProfileInfo(displayName, gamerTag, avatarColor);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!authReady) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-[#12161F] p-12 text-center text-sm text-slate-400">
        Checking cloud account status...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 py-6">
        <div className="rounded-2xl border border-white/[0.08] bg-[#12161F] p-8 space-y-6">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold text-white">Cloud Player Profile</h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Sign in with your Google account to create your Strata Play profile. Your high scores,
              library bookmarks, custom game links, and stream settings sync automatically so you can
              resume gameplay on any device.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-white/[0.08] py-5 text-xs text-slate-300">
            <div className="space-y-1">
              <p className="font-semibold text-white">Cross-Device Saves</p>
              <p className="text-slate-400">High scores and checkpoints sync to Firestore in real time.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-white">Custom Game Links</p>
              <p className="text-slate-400">Keep your named game URLs accessible anywhere.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-white">Synced Preferences</p>
              <p className="text-slate-400">Carry resolution, FPS, and region settings across devices.</p>
            </div>
          </div>

          {authError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3.5 py-2.5">
              {authError}
            </p>
          )}

          <button
            onClick={signInWithGoogle}
            disabled={authBusy}
            className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 px-6 py-3 text-sm font-semibold text-slate-950 transition-colors cursor-pointer"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            <span>{authBusy ? 'Connecting...' : 'Sign In / Create Account with Google'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-4xl">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold text-slate-950 shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {(displayName || 'P').slice(0, 1).toUpperCase()}
          </div>
          <div className="space-y-0.5 min-w-0">
            <h1 className="font-display text-2xl font-bold text-white truncate">
              {profile?.displayName || user.displayName || 'Cloud Player'}
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-2 truncate">
              <span className="font-mono text-emerald-400">@{profile?.gamerTag || 'player'}</span>
              <span aria-hidden="true">·</span>
              <span>{user.email}</span>
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          disabled={authBusy}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#12161F] hover:bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </section>

      {/* Cloud Summary Metrics */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 tabular-nums">
        <div className="rounded-xl border border-white/[0.08] bg-[#12161F] p-4 space-y-1">
          <p className="text-xs text-slate-400">Peak High Score</p>
          <p className="font-display text-2xl font-bold text-white font-mono">{peakScore.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#12161F] p-4 space-y-1">
          <p className="text-xs text-slate-400">Cloud Playtime</p>
          <p className="font-display text-2xl font-bold text-white font-mono">{totalMinutes}m</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#12161F] p-4 space-y-1">
          <p className="text-xs text-slate-400">Saved Titles</p>
          <p className="font-display text-2xl font-bold text-white font-mono">{libraryIds.length}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#12161F] p-4 space-y-1">
          <p className="text-xs text-slate-400">Custom Game Links</p>
          <p className="font-display text-2xl font-bold text-white font-mono">{customGames.length}</p>
        </div>
      </section>

      {/* Profile Editor */}
      <form onSubmit={handleSaveProfile} className="rounded-2xl border border-white/[0.08] bg-[#12161F] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-white">Identity & Cross-Device Sync</h2>
            <p className="text-xs text-slate-400">
              Your gamer tag appears in multiplayer lobbies and saved cloud sessions.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
            <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Synced</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label htmlFor="profile-display-name" className="block text-xs font-medium text-slate-300">
              Display Name
            </label>
            <input
              id="profile-display-name"
              type="text"
              required
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-gamer-tag" className="block text-xs font-medium text-slate-300">
              Gamer Tag (letters, numbers, _ or -)
            </label>
            <input
              id="profile-gamer-tag"
              type="text"
              required
              minLength={2}
              maxLength={32}
              value={gamerTag}
              onChange={(e) => setGamerTag(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_'))}
              className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-slate-300">Avatar Accent Color</span>
          <div className="flex items-center gap-3">
            {AVATAR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setAvatarColor(hex)}
                aria-label={`Select color ${hex}`}
                className={`h-8 w-8 rounded-lg transition-transform cursor-pointer ${
                  avatarColor === hex ? 'ring-2 ring-white scale-105' : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-slate-950 cursor-pointer"
          >
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Save Profile'}</span>
          </button>
          {savedNotice && <span className="text-xs text-emerald-400">Profile saved to cloud.</span>}
        </div>
      </form>
    </div>
  );
}
