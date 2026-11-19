import { useEffect, useRef, useState } from 'react';
import { soundFx } from '../../utils/soundFx';
import { StreamQuality } from '../../types/gaming';

export interface VirtualInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
  boost: boolean;
}

interface EngineProps {
  variant: 'starfall' | 'void_runner';
  quality: StreamQuality;
  virtualInputRef: React.MutableRefObject<VirtualInputState>;
  onScoreChange: (score: number) => void;
  onFpsSample: (fps: number) => void;
}

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  kind: 'rock' | 'drone';
  angle: number;
  spin: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export function StarfallEngine({ variant, quality, virtualInputRef, onScoreChange, onFpsSample }: EngineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [hull, setHull] = useState(100);
  const stateRef = useRef<GameState>('TITLE_MENU');

  const isVoid = variant === 'void_runner';
  const titleText = isVoid ? 'Void Runner: Dunes' : 'Starfall Interceptor';
  const accent = isVoid ? '#F97316' : '#F59E0B';

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
    const player = {
      x: 130,
      y: logicalH / 2,
      vx: 0,
      vy: 0,
      radius: 16,
      hull: 100,
      boostEnergy: 100,
      cooldown: 0,
      invuln: 0,
    };

    let currentScore = 0;
    let currentWave = 1;
    let spawnTimer = 0;
    let stars: { x: number; y: number; speed: number; size: number }[] = Array.from({ length: 75 }, () => ({
      x: Math.random() * logicalW,
      y: Math.random() * logicalH,
      speed: 40 + Math.random() * 140,
      size: 1 + Math.random() * 2,
    }));
    let bullets: Bullet[] = [];
    let enemies: Enemy[] = [];
    let particles: Particle[] = [];

    const resetWorld = () => {
      player.x = 130;
      player.y = logicalH / 2;
      player.vx = 0;
      player.vy = 0;
      player.hull = 100;
      player.boostEnergy = 100;
      player.cooldown = 0;
      player.invuln = 1.0;
      currentScore = 0;
      currentWave = 1;
      spawnTimer = 0.4;
      bullets = [];
      enemies = [];
      particles = [];
      setScore(0);
      setWave(1);
      setHull(100);
      onScoreChange(0);
    };

    const spawnExplosion = (x: number, y: number, color: string, count = 12) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 50 + Math.random() * 180;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.35 + Math.random() * 0.3,
          maxLife: 0.65,
          color,
        });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (stateRef.current === 'PLAYING') setSyncedState('PAUSED');
        else if (stateRef.current === 'PAUSED') setSyncedState('PLAYING');
      }
      if (e.code === 'Space' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
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
    let rafId = 0;

    const readGamepad = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = pads[0];
      if (!pad) return { x: 0, y: 0, fire: false, boost: false };
      const axX = Math.abs(pad.axes[0] || 0) > 0.2 ? pad.axes[0] : 0;
      const axY = Math.abs(pad.axes[1] || 0) > 0.2 ? pad.axes[1] : 0;
      return {
        x: axX,
        y: axY,
        fire: Boolean(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed),
        boost: Boolean(pad.buttons[1]?.pressed || pad.buttons[5]?.pressed),
      };
    };

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
        const gp = readGamepad();
        const vi = virtualInputRef.current;

        let moveX = gp.x;
        let moveY = gp.y;
        if (keys['KeyW'] || keys['ArrowUp'] || vi.up) moveY -= 1;
        if (keys['KeyS'] || keys['ArrowDown'] || vi.down) moveY += 1;
        if (keys['KeyA'] || keys['ArrowLeft'] || vi.left) moveX -= 1;
        if (keys['KeyD'] || keys['ArrowRight'] || vi.right) moveX += 1;

        const mag = Math.hypot(moveX, moveY);
        if (mag > 1) {
          moveX /= mag;
          moveY /= mag;
        }

        const wantsBoost = (keys['ShiftLeft'] || keys['ShiftRight'] || vi.boost || gp.boost) && player.boostEnergy > 10;
        const speed = wantsBoost ? 520 : 320;
        if (wantsBoost && mag > 0.1) {
          player.boostEnergy = Math.max(0, player.boostEnergy - 48 * dt);
        } else {
          player.boostEnergy = Math.min(100, player.boostEnergy + 22 * dt);
        }

        player.vx = moveX * speed;
        player.vy = moveY * speed;
        player.x = Math.max(36, Math.min(logicalW - 80, player.x + player.vx * dt));
        player.y = Math.max(36, Math.min(logicalH - 36, player.y + player.vy * dt));
        if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);

        if (player.cooldown > 0) player.cooldown -= dt;
        const firing = keys['Space'] || keys['KeyJ'] || vi.action || gp.fire;
        if (firing && player.cooldown <= 0) {
          bullets.push({ x: player.x + 20, y: player.y - 7, vx: 780, vy: 0 });
          bullets.push({ x: player.x + 20, y: player.y + 7, vx: 780, vy: 0 });
          player.cooldown = 0.14;
          soundFx.laser();
        }

        // Spawn waves
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          const isDrone = Math.random() < 0.32 + currentWave * 0.04;
          const speedBase = 175 + currentWave * 22;
          enemies.push({
            x: logicalW + 40,
            y: 45 + Math.random() * (logicalH - 90),
            vx: -(speedBase + Math.random() * 110),
            vy: isDrone ? (Math.random() - 0.5) * 90 : (Math.random() - 0.5) * 30,
            radius: isDrone ? 16 : 20 + Math.random() * 14,
            hp: isDrone ? 2 : 3,
            kind: isDrone ? 'drone' : 'rock',
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 3,
          });
          spawnTimer = Math.max(0.28, 1.05 - currentWave * 0.08);
        }

        bullets.forEach((b) => {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        });
        bullets = bullets.filter((b) => b.x < logicalW + 30);

        enemies.forEach((e) => {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          e.angle += e.spin * dt;
          if (e.y < 30 || e.y > logicalH - 30) e.vy *= -1;
        });

        // Collisions: bullets vs enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + 6) {
              bullets.splice(j, 1);
              e.hp -= 1;
              spawnExplosion(b.x, b.y, accent, 4);
              if (e.hp <= 0) {
                spawnExplosion(e.x, e.y, e.kind === 'drone' ? '#38BDF8' : accent, 14);
                enemies.splice(i, 1);
                currentScore += e.kind === 'drone' ? 150 : 100;
                const nextWave = Math.floor(currentScore / 1200) + 1;
                if (nextWave > currentWave) {
                  currentWave = nextWave;
                  setWave(currentWave);
                  soundFx.chime();
                } else {
                  soundFx.hit();
                }
                setScore(currentScore);
                onScoreChange(currentScore);
                break;
              }
            }
          }
        }

        // Collisions: player vs enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e.x < -50) {
            enemies.splice(i, 1);
            continue;
          }
          if (player.invuln <= 0 && Math.hypot(e.x - player.x, e.y - player.y) < e.radius + player.radius - 4) {
            enemies.splice(i, 1);
            player.hull = Math.max(0, player.hull - 25);
            player.invuln = 0.8;
            setHull(player.hull);
            spawnExplosion(player.x, player.y, '#EF4444', 18);
            soundFx.hit();
            if (player.hull <= 0) {
              soundFx.gameOver();
              setSyncedState('GAME_OVER');
            }
          }
        }
      }

      // Background parallax
      stars.forEach((s) => {
        if (stateRef.current !== 'PAUSED') {
          s.x -= s.speed * dt;
          if (s.x < 0) {
            s.x = logicalW;
            s.y = Math.random() * logicalH;
          }
        }
      });

      particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      });
      particles = particles.filter((p) => p.life > 0);

      // Draw
      ctx.save();
      ctx.scale(qualityScale, qualityScale);

      if (isVoid) {
        const grad = ctx.createLinearGradient(0, 0, 0, logicalH);
        grad.addColorStop(0, '#160E18');
        grad.addColorStop(0.55, '#2A1412');
        grad.addColorStop(1, '#4A1F14');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, logicalW, logicalH);

        // Canyon horizon ridges
        ctx.fillStyle = '#331510';
        ctx.beginPath();
        ctx.moveTo(0, logicalH);
        for (let x = 0; x <= logicalW; x += 60) {
          ctx.lineTo(x, logicalH - 45 - Math.sin((x + now * 0.08) * 0.015) * 18);
        }
        ctx.lineTo(logicalW, logicalH);
        ctx.closePath();
        ctx.fill();
      } else {
        const grad = ctx.createRadialGradient(logicalW * 0.78, logicalH * 0.35, 30, logicalW * 0.78, logicalH * 0.35, 420);
        grad.addColorStop(0, '#45240D');
        grad.addColorStop(0.45, '#131622');
        grad.addColorStop(1, '#080A0F');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, logicalW, logicalH);
      }

      // Stars / dust streaks
      ctx.fillStyle = isVoid ? 'rgba(253, 186, 116, 0.45)' : 'rgba(241, 245, 249, 0.55)';
      stars.forEach((s) => {
        ctx.fillRect(s.x, s.y, s.size * (isVoid ? 4 : 1.5), s.size);
      });

      // Bullets
      ctx.fillStyle = accent;
      bullets.forEach((b) => {
        ctx.fillRect(b.x - 8, b.y - 2, 16, 4);
      });

      // Enemies
      enemies.forEach((e) => {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle);
        if (e.kind === 'drone') {
          ctx.strokeStyle = '#38BDF8';
          ctx.fillStyle = '#0F172A';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-16, 0);
          ctx.lineTo(6, -13);
          ctx.lineTo(14, 0);
          ctx.lineTo(6, 13);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = isVoid ? '#5C2C1D' : '#334155';
          ctx.strokeStyle = isVoid ? '#9A3412' : '#64748B';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            const r = e.radius * (k % 2 === 0 ? 1 : 0.78);
            if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });

      // Player ship
      if (stateRef.current !== 'GAME_OVER' && (player.invuln <= 0 || Math.floor(now / 60) % 2 === 0)) {
        ctx.save();
        ctx.translate(player.x, player.y);
        // Thruster flame
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(-16, -5);
        ctx.lineTo(-28 - Math.random() * 12, 0);
        ctx.lineTo(-16, 5);
        ctx.closePath();
        ctx.fill();

        // Hull
        ctx.fillStyle = '#E2E8F0';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(-14, -14);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-14, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Particles
      particles.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      ctx.globalAlpha = 1;

      ctx.restore();
      rafId = requestAnimationFrame(loop);
    };

    (window as unknown as { __starfallReset?: () => void }).__starfallReset = resetWorld;
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [quality, variant, accent, isVoid, onScoreChange, onFpsSample, virtualInputRef]);

  const startGame = () => {
    soundFx.click();
    const reset = (window as unknown as { __starfallReset?: () => void }).__starfallReset;
    reset?.();
    setSyncedState('PLAYING');
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#06080C] select-none">
      <canvas ref={canvasRef} className="w-full h-full object-contain" />

      {gameState === 'PLAYING' && (
        <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-center justify-between text-xs font-mono tabular-nums text-slate-200">
          <div className="flex items-center gap-4 bg-black/55 backdrop-blur-sm border border-white/10 rounded-lg px-3.5 py-2">
            <span>SCORE {score.toLocaleString()}</span>
            <span className="text-slate-500">·</span>
            <span>WAVE {wave}</span>
          </div>
          <div className="flex items-center gap-3 bg-black/55 backdrop-blur-sm border border-white/10 rounded-lg px-3.5 py-2">
            <span className="text-slate-400">HULL</span>
            <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-150 ${hull > 40 ? 'bg-emerald-400' : 'bg-red-500'}`}
                style={{ width: `${hull}%` }}
              />
            </div>
            <span>{hull}%</span>
          </div>
        </div>
      )}

      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-xs p-6">
          <div className="max-w-md w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold text-white">{titleText}</h2>
              <p className="text-sm text-slate-400">
                WASD or Arrow keys to pilot · Space to fire twin cannons · Shift to boost
              </p>
            </div>
            <button
              onClick={startGame}
              className="w-full py-2.5 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-xs p-6">
          <div className="max-w-xs w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-4">
            <h3 className="text-xl font-semibold text-white">Session Paused</h3>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => setSyncedState('PLAYING')}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
              >
                Resume
              </button>
              <button
                onClick={startGame}
                className="w-full py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition-colors cursor-pointer"
              >
                Restart Run
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs p-6">
          <div className="max-w-sm w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-mono text-amber-400">HULL BREACHED</p>
              <h3 className="text-2xl font-semibold text-white">Run Complete</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 py-3 border-y border-white/10 text-sm tabular-nums">
              <div>
                <p className="text-xs text-slate-400">Final Score</p>
                <p className="text-lg font-semibold text-white font-mono">{score.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Wave Reached</p>
                <p className="text-lg font-semibold text-white font-mono">{wave}</p>
              </div>
            </div>
            <button
              onClick={startGame}
              className="w-full py-2.5 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
