import { useEffect, useRef, useState } from 'react';
import { soundFx } from '../../utils/soundFx';
import { StreamQuality } from '../../types/gaming';
import { VirtualInputState } from './StarfallEngine';

interface EngineProps {
  variant: 'apex_drift' | 'alpine_rally';
  quality: StreamQuality;
  virtualInputRef: React.MutableRefObject<VirtualInputState>;
  onScoreChange: (score: number) => void;
  onFpsSample: (fps: number) => void;
}

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export function ApexDriftEngine({ variant, quality, virtualInputRef, onScoreChange, onFpsSample }: EngineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [lap, setLap] = useState(1);
  const [lapTime, setLapTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [nitro, setNitro] = useState(100);
  const stateRef = useRef<GameState>('TITLE_MENU');

  const isRally = variant === 'alpine_rally';
  const titleText = isRally ? 'Alpine Rally Pass' : 'Apex Drift Circuit';

  const setSyncedState = (next: GameState) => {
    stateRef.current = next;
    setGameState(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const qualityScale = quality === '720p' ? 0.75 : quality === '1080p' ? 1 : quality === '1440p' ? 1.25 : 1.5;
    const logicalW = 960;
    const logicalH = 540;
    canvas.width = Math.round(logicalW * qualityScale);
    canvas.height = Math.round(logicalH * qualityScale);

    const keys: Record<string, boolean> = {};
    const car = {
      x: 480,
      y: 440,
      angle: 0,
      vx: 0,
      vy: 0,
      nitro: 100,
      checkpoint: 0,
      lap: 1,
      lapClock: 0,
      bestLap: null as number | null,
      score: 0,
    };

    const skids: { x1: number; y1: number; x2: number; y2: number; alpha: number }[] = [];

    const checkpoints = [
      { x: 770, y: 270, r: 75 },
      { x: 480, y: 100, r: 75 },
      { x: 190, y: 270, r: 75 },
      { x: 480, y: 440, r: 75 },
    ];

    const resetCar = () => {
      car.x = 480;
      car.y = 440;
      car.angle = 0;
      car.vx = 0;
      car.vy = 0;
      car.nitro = 100;
      car.checkpoint = 0;
      car.lap = 1;
      car.lapClock = 0;
      car.score = 0;
      skids.length = 0;
      setLap(1);
      setLapTime(0);
      setSpeedKmh(0);
      setNitro(100);
      onScoreChange(0);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (stateRef.current === 'PLAYING') setSyncedState('PAUSED');
        else if (stateRef.current === 'PAUSED') setSyncedState('PLAYING');
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let lastTime = performance.now();
    let fpsFrames = 0;
    let fpsClock = 0;
    let hudClock = 0;
    let rafId = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      fpsFrames++;
      fpsClock += dt;
      if (fpsClock >= 0.5) {
        onFpsSample(Math.round(fpsFrames / fpsClock));
        fpsFrames = 0;
        fpsClock = 0;
      }

      if (stateRef.current === 'PLAYING') {
        const vi = virtualInputRef.current;
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads[0];
        const gpSteer = pad && Math.abs(pad.axes[0] || 0) > 0.15 ? pad.axes[0] : 0;
        const gpAccel = pad ? pad.buttons[7]?.pressed || pad.buttons[0]?.pressed : false;
        const gpBrake = pad ? pad.buttons[6]?.pressed || pad.buttons[2]?.pressed : false;
        const gpBoost = pad ? pad.buttons[1]?.pressed || pad.buttons[5]?.pressed : false;

        const throttle = (keys['KeyW'] || keys['ArrowUp'] || vi.up || gpAccel ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] || vi.down || gpBrake ? 0.65 : 0);
        let steer = gpSteer;
        if (keys['KeyA'] || keys['ArrowLeft'] || vi.left) steer -= 1;
        if (keys['KeyD'] || keys['ArrowRight'] || vi.right) steer += 1;

        const drifting = keys['Space'] || vi.action;
        const boosting = (keys['ShiftLeft'] || keys['ShiftRight'] || vi.boost || gpBoost) && car.nitro > 5;

        if (boosting && throttle > 0) {
          car.nitro = Math.max(0, car.nitro - 38 * dt);
        } else {
          car.nitro = Math.min(100, car.nitro + 12 * dt);
        }

        const forwardX = Math.cos(car.angle);
        const forwardY = Math.sin(car.angle);
        const rightX = -forwardY;
        const rightY = forwardX;

        const speed = Math.hypot(car.vx, car.vy);
        const steerRate = (drifting ? 3.5 : 2.65) * Math.min(1, speed / 95 + 0.3);
        car.angle += steer * steerRate * dt;

        const accelForce = (boosting ? 620 : 410) * throttle;
        car.vx += forwardX * accelForce * dt;
        car.vy += forwardY * accelForce * dt;

        // Lateral grip vs drift slip
        const forwardVel = car.vx * forwardX + car.vy * forwardY;
        const lateralVel = car.vx * rightX + car.vy * rightY;
        const lateralGrip = drifting ? (isRally ? 1.8 : 2.4) : isRally ? 4.2 : 6.2;
        const dampedLateral = lateralVel * Math.exp(-lateralGrip * dt);

        car.vx = forwardX * forwardVel + rightX * dampedLateral;
        car.vy = forwardY * forwardVel + rightY * dampedLateral;

        // Track surface check (elliptical circuit)
        const dx = (car.x - 480) / 310;
        const dy = (car.y - 270) / 170;
        const distNorm = Math.hypot(dx, dy);
        const onTrack = distNorm >= 0.56 && distNorm <= 1.18;

        const drag = onTrack ? 0.72 : 2.2;
        car.vx *= Math.exp(-drag * dt);
        car.vy *= Math.exp(-drag * dt);

        const prevX = car.x;
        const prevY = car.y;
        car.x = Math.max(28, Math.min(logicalW - 28, car.x + car.vx * dt));
        car.y = Math.max(28, Math.min(logicalH - 28, car.y + car.vy * dt));

        if ((drifting || Math.abs(lateralVel) > 65) && speed > 80) {
          skids.push({ x1: prevX, y1: prevY, x2: car.x, y2: car.y, alpha: 0.45 });
          if (skids.length > 180) skids.shift();
          car.score += Math.round(dt * 45);
        }

        // Checkpoints
        car.lapClock += dt;
        const targetCp = checkpoints[car.checkpoint];
        if (Math.hypot(car.x - targetCp.x, car.y - targetCp.y) < targetCp.r) {
          if (car.checkpoint === checkpoints.length - 1) {
            const finishedLapTime = car.lapClock;
            if (car.bestLap === null || finishedLapTime < car.bestLap) {
              car.bestLap = finishedLapTime;
              setBestLap(finishedLapTime);
            }
            car.score += Math.max(250, Math.round(2500 - finishedLapTime * 80));
            onScoreChange(car.score);
            soundFx.chime();
            car.lapClock = 0;
            car.lap += 1;
            setLap(car.lap);
            if (car.lap > 3) {
              setSyncedState('GAME_OVER');
            }
          } else {
            soundFx.click();
          }
          car.checkpoint = (car.checkpoint + 1) % checkpoints.length;
        }

        hudClock += dt;
        if (hudClock >= 0.08) {
          hudClock = 0;
          setLapTime(car.lapClock);
          setSpeedKmh(Math.round(speed * 0.62));
          setNitro(Math.round(car.nitro));
          onScoreChange(car.score);
        }
      }

      // Draw circuit
      ctx.save();
      ctx.scale(qualityScale, qualityScale);

      ctx.fillStyle = isRally ? '#1D2939' : '#0E131B';
      ctx.fillRect(0, 0, logicalW, logicalH);

      // Outer grass / snow shoulder
      ctx.save();
      ctx.translate(480, 270);
      ctx.scale(310 / 170, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 198, 0, Math.PI * 2);
      ctx.fillStyle = isRally ? '#CBD5E1' : '#1E2532';
      ctx.fill();

      // Asphalt / Packed Snow Track
      ctx.beginPath();
      ctx.arc(0, 0, 188, 0, Math.PI * 2);
      ctx.fillStyle = isRally ? '#475569' : '#181C24';
      ctx.fill();

      // Inner island
      ctx.beginPath();
      ctx.arc(0, 0, 102, 0, Math.PI * 2);
      ctx.fillStyle = isRally ? '#0F172A' : '#0B0F16';
      ctx.fill();

      // Track curbs
      ctx.strokeStyle = isRally ? '#38BDF8' : '#F59E0B';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, 188, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 102, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Start/Finish line
      ctx.fillStyle = '#F8FAFC';
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#F8FAFC' : '#0F172A';
        ctx.fillRect(475, 382 + i * 16, 12, 16);
      }

      // Next checkpoint subtle indicator
      const nextCp = checkpoints[car.checkpoint];
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(nextCp.x, nextCp.y, 26, 0, Math.PI * 2);
      ctx.stroke();

      // Skid marks
      skids.forEach((s) => {
        ctx.strokeStyle = isRally ? `rgba(226, 232, 240, ${s.alpha})` : `rgba(10, 10, 12, ${s.alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      });

      // Car sprite
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = isRally ? '#38BDF8' : '#10B981';
      ctx.fillRect(-16, -9, 32, 18);
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-4, -7, 13, 14);
      // Headlights
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(14, -7, 3, 4);
      ctx.fillRect(14, 3, 3, 4);
      ctx.restore();

      ctx.restore();
      rafId = requestAnimationFrame(loop);
    };

    (window as unknown as { __driftReset?: () => void }).__driftReset = resetCar;
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [quality, variant, isRally, onScoreChange, onFpsSample, virtualInputRef]);

  const startRace = () => {
    soundFx.boost();
    const reset = (window as unknown as { __driftReset?: () => void }).__driftReset;
    reset?.();
    setSyncedState('PLAYING');
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#06080C] select-none">
      <canvas ref={canvasRef} className="w-full h-full object-contain" />

      {gameState === 'PLAYING' && (
        <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-center justify-between text-xs font-mono tabular-nums text-slate-200">
          <div className="flex items-center gap-4 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-3.5 py-2">
            <span>LAP {Math.min(lap, 3)} / 3</span>
            <span className="text-slate-500">·</span>
            <span>TIME {lapTime.toFixed(2)}s</span>
            {bestLap !== null && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-emerald-400">BEST {bestLap.toFixed(2)}s</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-3.5 py-2">
            <span>{speedKmh} KM/H</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400">NITRO</span>
            <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 transition-all duration-100" style={{ width: `${nitro}%` }} />
            </div>
          </div>
        </div>
      )}

      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-xs p-6">
          <div className="max-w-md w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold text-white">{titleText}</h2>
              <p className="text-sm text-slate-400">
                W/Up accelerate · A/D steer · Space handbrake drift · Shift nitro · Complete 3 laps
              </p>
            </div>
            <button
              onClick={startRace}
              className="w-full py-2.5 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
            >
              Start Time Trial
            </button>
          </div>
        </div>
      )}

      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-xs p-6">
          <div className="max-w-xs w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-4">
            <h3 className="text-xl font-semibold text-white">Race Paused</h3>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => setSyncedState('PLAYING')}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                Resume
              </button>
              <button
                onClick={startRace}
                className="w-full py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-sm cursor-pointer"
              >
                Restart Stage
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs p-6">
          <div className="max-w-sm w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-mono text-emerald-400">CHECKERED FLAG</p>
              <h3 className="text-2xl font-semibold text-white">Stage Finished</h3>
            </div>
            <div className="py-3 border-y border-white/10 text-sm tabular-nums">
              <p className="text-xs text-slate-400">Best Lap Time</p>
              <p className="text-xl font-semibold text-white font-mono">
                {bestLap !== null ? `${bestLap.toFixed(2)}s` : '--'}
              </p>
            </div>
            <button
              onClick={startRace}
              className="w-full py-2.5 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm cursor-pointer"
            >
              Race Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
