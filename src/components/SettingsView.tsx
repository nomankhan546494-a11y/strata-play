import { useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { ServerRegion, StreamQuality, StreamSettings, TargetFps } from '../types/gaming';

interface SettingsViewProps {
  settings: StreamSettings;
  cloudSynced: boolean;
  onUpdateSettings: (next: StreamSettings) => void;
}

const QUALITIES: { value: StreamQuality; label: string; bitrate: string }[] = [
  { value: '720p', label: '720p Data Saver', bitrate: '12 Mbps' },
  { value: '1080p', label: '1080p Balanced', bitrate: '24 Mbps' },
  { value: '1440p', label: '1440p Ultra', bitrate: '38 Mbps' },
  { value: '4K', label: '4K HDR', bitrate: '55 Mbps' },
];

const REGIONS: ServerRegion[] = ['Singapore', 'Tokyo East', 'Frankfurt', 'US West'];

export function SettingsView({ settings, cloudSynced, onUpdateSettings }: SettingsViewProps) {
  const [connectedPads, setConnectedPads] = useState<string[]>([]);

  useEffect(() => {
    const scanPads = () => {
      if (!navigator.getGamepads) return;
      const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => Boolean(p));
      setConnectedPads(pads.map((p) => p.id));
    };
    scanPads();
    window.addEventListener('gamepadconnected', scanPads);
    window.addEventListener('gamepaddisconnected', scanPads);
    const timer = window.setInterval(scanPads, 2000);
    return () => {
      window.removeEventListener('gamepadconnected', scanPads);
      window.removeEventListener('gamepaddisconnected', scanPads);
      clearInterval(timer);
    };
  }, []);

  const update = (patch: Partial<StreamSettings>) => {
    onUpdateSettings({ ...settings, ...patch });
  };

  return (
    <div className="space-y-10 max-w-4xl">
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="font-display text-3xl font-bold text-white">Stream Settings</h1>
          <span className="text-xs text-slate-400">
            {cloudSynced ? 'Saved automatically to your cloud profile' : 'Saved on this device'}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Configure cloud video quality, server node region, audio feedback, and controller input.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-white/[0.08] bg-[#12161F] p-6 space-y-5">
          <h2 className="font-display text-lg font-semibold text-white">Video & Server</h2>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">Stream Resolution</label>
            <div className="grid grid-cols-2 gap-2.5">
              {QUALITIES.map((q) => {
                const active = settings.quality === q.value;
                return (
                  <button
                    key={q.value}
                    onClick={() => update({ quality: q.value })}
                    className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                        : 'border-white/[0.08] bg-[#0B0D12] text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <p className="text-sm font-semibold">{q.label}</p>
                    <p className="text-xs font-mono text-slate-400">{q.bitrate}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">Target Frame Rate</label>
            <div className="grid grid-cols-2 gap-2.5">
              {([60, 120] as TargetFps[]).map((fps) => (
                <button
                  key={fps}
                  onClick={() => update({ targetFps: fps })}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-mono font-semibold transition-colors cursor-pointer ${
                    settings.targetFps === fps
                      ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                      : 'border-white/[0.08] bg-[#0B0D12] text-slate-300 hover:border-white/20'
                  }`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="region-select" className="block text-xs font-medium text-slate-300">
              Cloud GPU Region
            </label>
            <select
              id="region-select"
              value={settings.region}
              onChange={(e) => update({ region: e.target.value as ServerRegion })}
              className="w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#12161F] p-6 space-y-5">
          <h2 className="font-display text-lg font-semibold text-white">Audio & Input</h2>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0B0D12] p-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Game Audio Synth</p>
                <p className="text-xs text-slate-400">Enable real-time Web Audio effects during streams</p>
              </div>
              <input
                type="checkbox"
                checked={settings.audioEnabled}
                onChange={(e) => update({ audioEnabled: e.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0B0D12] p-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Default On-Screen Controller</p>
                <p className="text-xs text-slate-400">Show touch/mouse gamepad buttons automatically</p>
              </div>
              <input
                type="checkbox"
                checked={settings.showVirtualControls}
                onChange={(e) => update({ showVirtualControls: e.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0B0D12] p-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-white">Low-Latency Frame Pacing</p>
                <p className="text-xs text-slate-400">Prioritize input responsiveness over buffer smoothing</p>
              </div>
              <input
                type="checkbox"
                checked={settings.lowLatencyMode}
                onChange={(e) => update({ lowLatencyMode: e.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0B0D12] p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Gamepad2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>Connected Controllers</span>
            </div>
            {connectedPads.length === 0 ? (
              <p className="text-xs text-slate-400">
                No USB/Bluetooth controller detected. Press any button on a connected gamepad to activate.
              </p>
            ) : (
              <ul className="space-y-1 text-xs font-mono text-emerald-400">
                {connectedPads.map((id, i) => (
                  <li key={`${id}-${i}`}>{id}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
