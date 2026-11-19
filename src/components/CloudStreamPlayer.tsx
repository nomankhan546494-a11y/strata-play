import { useEffect, useRef, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Users,
  X,
} from 'lucide-react';
import { GameTitle, RemotePeerState, StreamQuality, StreamSettings } from '../types/gaming';
import { GameArtwork } from './GameArtwork';

interface CloudStreamPlayerProps {
  game: GameTitle;
  roomCode?: string;
  gamerTag: string;
  settings: StreamSettings;
  previousHighScore?: number;
  onUpdateQuality: (q: StreamQuality) => void;
  onToggleAudio: () => void;
  onEndSession: (score: number, durationSeconds: number, checkpointData?: string) => void;
}

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function CloudStreamPlayer({
  game,
  roomCode,
  gamerTag,
  settings,
  previousHighScore = 0,
  onUpdateQuality,
  onEndSession,
}: CloudStreamPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [connecting, setConnecting] = useState(true);
  const [nodeLabel, setNodeLabel] = useState(`${settings.region.toLowerCase().replace(/\s+/g, '-')}-gpu`);
  const [remainingSeconds, setRemainingSeconds] = useState(3600);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [peers, setPeers] = useState<RemotePeerState[]>([]);

  const [quality, setQuality] = useState<StreamQuality>(settings.quality);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Iframe embed probe & external stream window handoff
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [embedBlockReason, setEmbedBlockReason] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [launchedWindow, setLaunchedWindow] = useState(false);

  const startTimeRef = useRef(Date.now());
  const targetUrl = game.customUrl || game.streamUrl;

  // Allocate cloud session, probe embeddability, and connect WebSocket stream
  useEffect(() => {
    let active = true;
    let pingTimer: number | undefined;
    let fallbackClockTimer: number | undefined;

    async function connectCloudStream() {
      let allocatedSessionId = `local_${Date.now()}`;

      const [sessionRes, probeRes] = await Promise.allSettled([
        fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            region: settings.region,
            roomCode,
            gamerTag,
          }),
        }),
        fetch(`/api/probe-embed?url=${encodeURIComponent(targetUrl)}`),
      ]);

      if (!active) return;

      if (probeRes.status === 'fulfilled' && probeRes.value.ok) {
        try {
          const probeData = await probeRes.value.json();
          if (probeData.embeddable === false) {
            setEmbedBlocked(true);
            setEmbedBlockReason(probeData.reason || 'This game host restricts embedded frames.');
          }
        } catch {
          // Ignore probe JSON errors
        }
      }

      if (sessionRes.status === 'fulfilled' && sessionRes.value.ok) {
        try {
          const data = await sessionRes.value.json();
          allocatedSessionId = data.sessionId;
          sessionIdRef.current = data.sessionId;
          setNodeLabel(data.nodeLabel);
          setRemainingSeconds(Number(data.remainingSeconds || 3600));
        } catch {
          // Ignore session JSON errors
        }
      }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        sessionId: allocatedSessionId,
        gameId: game.id,
      });
      if (roomCode) params.set('roomCode', roomCode);

      const ws = new WebSocket(`${proto}//${window.location.host}/ws/stream?${params.toString()}`);
      wsRef.current = ws;

      let wsTickActive = false;

      ws.onopen = () => {
        if (!active) return;
        setTimeout(() => {
          if (active) {
            setConnecting(false);
            startTimeRef.current = Date.now();
          }
        }, 450);

        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stream:ping', clientTs: Date.now() }));
            const liveMinutesScore = Math.max(10, Math.round((Date.now() - startTimeRef.current) / 1000) * 10);
            ws.send(
              JSON.stringify({
                type: 'player:state',
                score: liveMinutesScore,
                gamerTag,
              })
            );
          }
        }, 1500);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'stream:ready') {
            if (msg.nodeLabel) setNodeLabel(msg.nodeLabel);
            if (typeof msg.remainingSeconds === 'number') setRemainingSeconds(msg.remainingSeconds);
          } else if (msg.type === 'session:tick') {
            wsTickActive = true;
            setRemainingSeconds(Number(msg.remainingSeconds));
          } else if (msg.type === 'session:expired') {
            setRemainingSeconds(0);
            setSessionExpired(true);
          } else if (msg.type === 'stream:pong' && typeof msg.clientTs === 'number') {
            setRttMs(Math.max(1, Date.now() - msg.clientTs));
          } else if (msg.type === 'room:peers' && Array.isArray(msg.peers)) {
            setPeers(msg.peers);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        if (active) setConnecting(false);
      };

      fallbackClockTimer = window.setInterval(() => {
        if (!wsTickActive) {
          setRemainingSeconds((prev) => {
            if (prev <= 1) {
              setSessionExpired(true);
              return 0;
            }
            return prev - 1;
          });
        }
      }, 1000);
    }

    connectCloudStream();

    return () => {
      active = false;
      if (pingTimer) clearInterval(pingTimer);
      if (fallbackClockTimer) clearInterval(fallbackClockTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (sessionIdRef.current) {
        fetch(`/api/sessions/${sessionIdRef.current}`, { method: 'DELETE' }).catch(() => {});
      }
    };
  }, [game.id, targetUrl, roomCode, settings.region, gamerTag]);

  // If iframe does not finish loading within 4.5s, surface Launch in Stream Window automatically
  useEffect(() => {
    if (connecting || embedBlocked || iframeLoaded) return;
    const timeout = window.setTimeout(() => {
      if (!iframeLoaded) {
        setEmbedBlocked(true);
        setEmbedBlockReason('The game host did not allow direct frame loading.');
      }
    }, 4500);
    return () => clearTimeout(timeout);
  }, [connecting, embedBlocked, iframeLoaded]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleExit = () => {
    const elapsedSec = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
    const sessionScore = Math.max(previousHighScore, elapsedSec * 15);
    const checkpoint = JSON.stringify({
      score: sessionScore,
      savedAt: new Date().toISOString(),
    });
    onEndSession(sessionScore, elapsedSec, checkpoint);
  };

  const handleRestartOneHour = () => {
    setSessionExpired(false);
    setRemainingSeconds(3600);
    startTimeRef.current = Date.now();
  };

  const isLowTime = remainingSeconds <= 300;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-[#06080C] text-slate-100"
    >
      {/* Stream Control Bar */}
      <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#0B0D12] px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-semibold text-sm text-white truncate">{game.title}</span>
          {roomCode && (
            <span className="hidden sm:inline font-mono text-xs text-emerald-400 whitespace-nowrap">
              Lobby {roomCode}
            </span>
          )}
          <span className="hidden lg:inline text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap">
            {nodeLabel} · {quality} {settings.targetFps} FPS{rttMs !== null ? ` · ${rttMs}ms` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* 1-Hour Play Session Countdown */}
          <div
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-mono tabular-nums whitespace-nowrap ${
              isLowTime
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-white/10 bg-white/[0.04] text-slate-200'
            }`}
            title="1-hour cloud play session timer"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{formatClock(remainingSeconds)}</span>
          </div>

          <select
            aria-label="Stream Resolution"
            value={quality}
            onChange={(e) => {
              const nextQ = e.target.value as StreamQuality;
              setQuality(nextQ);
              onUpdateQuality(nextQ);
            }}
            className="hidden sm:block rounded-md border border-white/10 bg-[#141923] px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="1440p">1440p</option>
            <option value="4K">4K HDR</option>
          </select>

          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setLaunchedWindow(true)}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors"
            title="Launch in Stream Window"
          >
            <ExternalLink className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            <span>Launch in Stream Window</span>
          </a>

          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="rounded-md bg-white/5 p-2 text-slate-300 hover:bg-white/10 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            onClick={handleExit}
            className="flex items-center gap-1.5 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Save & Exit</span>
          </button>
        </div>
      </div>

      {/* Main Stream Viewport */}
      <div className="relative flex-1 overflow-hidden">
        {connecting ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 bg-[#06080C] p-6 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-emerald-400" />
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-semibold text-white">
                Allocating Cloud Stream
              </h2>
              <p className="text-sm text-slate-400 font-mono tabular-nums">
                {nodeLabel} · {quality} {settings.targetFps} FPS · 60:00 Session Ready
              </p>
              {previousHighScore > 0 && (
                <p className="text-xs text-emerald-400 font-mono tabular-nums">
                  Cloud Save Detected · Best Score {previousHighScore.toLocaleString()}
                </p>
              )}
            </div>
            <button
              onClick={handleExit}
              className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : embedBlocked || launchedWindow ? (
          <div className="relative flex h-full w-full items-center justify-center bg-[#06080C] p-6">
            {game.coverImage && (
              <>
                <GameArtwork
                  src={game.coverImage}
                  alt={game.title}
                  title={game.title}
                  accentHex={game.accentHex}
                  className="absolute inset-0 h-full w-full object-cover opacity-25 blur-xs"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#06080C] via-[#06080C]/80 to-[#06080C]/70" />
              </>
            )}

            <div className="relative z-10 max-w-lg w-full rounded-2xl border border-white/10 bg-[#12161F]/95 backdrop-blur-md p-7 text-center space-y-5">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <MonitorPlay className="h-6 w-6" aria-hidden="true" />
              </div>

              <div className="space-y-2">
                <h2 className="font-display text-2xl font-bold text-white">
                  {launchedWindow ? `${game.title} — Stream Window Active` : game.title}
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {launchedWindow
                    ? 'Your game is running in a separate stream window while your 1-hour cloud session timer continues counting down here.'
                    : embedBlockReason ||
                      'This game blocks embedded frames for security. Launch it in a dedicated Stream Window while keeping your 1-hour session timer active.'}
                </p>
              </div>

              <div className="flex items-center justify-center gap-4 border-y border-white/10 py-3.5 text-xs font-mono tabular-nums text-slate-300">
                <span>SESSION TIMER {formatClock(remainingSeconds)}</span>
                <span className="text-slate-600">·</span>
                <span>{nodeLabel}</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setLaunchedWindow(true)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  <span>{launchedWindow ? 'Re-open Stream Window' : 'Launch in Stream Window'}</span>
                </a>
                <button
                  onClick={handleExit}
                  className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-5 py-3 text-sm font-medium text-white transition-colors cursor-pointer"
                >
                  Save & Exit
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full flex flex-col bg-black">
            <iframe
              src={targetUrl}
              title={game.title}
              onLoad={() => setIframeLoaded(true)}
              onError={() => {
                setEmbedBlocked(true);
                setEmbedBlockReason('Could not load game inside embedded frame.');
              }}
              className="w-full flex-1 border-0 bg-black"
              allow="fullscreen; gamepad; autoplay; clipboard-write; pointer-lock"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock"
            />
            <div className="flex items-center justify-between gap-4 border-t border-white/10 bg-[#0B0D12] px-4 py-2 text-xs text-slate-400">
              <span className="truncate">
                Streaming {game.title} ({targetUrl})
              </span>
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setLaunchedWindow(true)}
                className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium whitespace-nowrap shrink-0"
              >
                <span>Launch in Stream Window</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        )}

        {/* Live Multiplayer Lobby Peers Overlay */}
        {!connecting && roomCode && peers.length > 0 && (
          <div className="pointer-events-none absolute top-4 right-4 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-3.5 py-2.5 text-xs font-mono tabular-nums space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span>ROOM {roomCode} ({peers.length})</span>
            </div>
            {peers.slice(0, 4).map((p) => (
              <div key={p.peerId} className="flex items-center justify-between gap-4 text-slate-300">
                <span className="truncate max-w-[110px]">{p.gamerTag}</span>
                <span>{p.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* 1-Hour Session Limit Reached Overlay */}
        {sessionExpired && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
            <div className="max-w-md w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
              <div className="space-y-1.5">
                <p className="text-xs font-mono text-amber-400">60:00 SESSION LIMIT REACHED</p>
                <h3 className="text-2xl font-semibold text-white">1-Hour Play Session Complete</h3>
                <p className="text-sm text-slate-400">
                  Your 1-hour cloud session has ended and your progress has been saved to your profile.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleRestartOneHour}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm cursor-pointer"
                >
                  Start New 1-Hour Session
                </button>
                <button
                  onClick={handleExit}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-sm cursor-pointer"
                >
                  Save & Exit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
