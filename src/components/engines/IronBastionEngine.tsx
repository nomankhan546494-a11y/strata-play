import { useEffect, useRef, useState } from 'react';
import { soundFx } from '../../utils/soundFx';
import { StreamQuality } from '../../types/gaming';
import { VirtualInputState } from './StarfallEngine';

interface EngineProps {
  quality: StreamQuality;
  virtualInputRef: React.MutableRefObject<VirtualInputState>;
  onScoreChange: (score: number) => void;
  onFpsSample: (fps: number) => void;
}

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

interface Intruder {
  x: number;
  y: number;
  speed: number;
  hp: number;
  maxHp: number;
  radius: number;
}

interface Round {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function IronBastionEngine({ quality, virtualInputRef, onScoreChange, onFpsSample }: EngineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [score, setScore] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const [wave, setWave] = useState(1);
  const [empReady, setEmpReady] = useState(true);
  const stateRef = useRef<GameState>('TITLE_MENU');

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

    const cx = logicalW / 2;
    const cy = logicalH / 2;
    const keys: Record<string, boolean> = {};
    let aimAngle = 0;
    let mouseDown = false;
    let fireCooldown = 0;
    let empCooldown = 0;
    let empRing = 0;
    let currentIntegrity = 100;
    let currentScore = 0;
    let currentWave = 1;
    let spawnTimer = 0.6;
    let rounds: Round[] = [];
    let intruders: Intruder[] = [];

    const resetDefense = () => {
      currentIntegrity = 100;
      currentScore = 0;
      currentWave = 1;
      empCooldown = 0;
      empRing = 0;
      rounds = [];
      intruders = [];
      setScore(0);
      setIntegrity(100);
      setWave(1);
      setEmpReady(true);
      onScoreChange(0);
    };

    const triggerEmp = () => {
      if (empCooldown > 0 || stateRef.current !== 'PLAYING') return;
      empCooldown = 8;
      empRing = 1;
      setEmpReady(false);
      soundFx.boost();
      intruders = intruders.filter((enemy) => {
        const dist = Math.hypot(enemy.x - cx, enemy.y - cy);
        if (dist < 240) {
          currentScore += 80;
          return false;
        }
        return true;
      });
      setScore(currentScore);
      onScoreChange(currentScore);
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * logicalW;
      const my = ((e.clientY - rect.top) / rect.height) * logicalH;
      aimAngle = Math.atan2(my - cy, mx - cx);
    };
    const onMouseDown = () => {
      mouseDown = true;
    };
    const onMouseUp = () => {
      mouseDown = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === 'KeyE') triggerEmp();
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (stateRef.current === 'PLAYING') setSyncedState('PAUSED');
        else if (stateRef.current === 'PAUSED') setSyncedState('PLAYING');
      }
      if (e.code === 'Space') e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let lastTime = performance.now();
    let fpsFrames = 0;
    let fpsClock = 0;
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
        if (keys['ArrowLeft'] || keys['KeyA'] || vi.left) aimAngle -= 3.2 * dt;
        if (keys['ArrowRight'] || keys['KeyD'] || vi.right) aimAngle += 3.2 * dt;
        if (vi.boost) triggerEmp();

        if (empCooldown > 0) {
          empCooldown = Math.max(0, empCooldown - dt);
          if (empCooldown === 0) setEmpReady(true);
        }
        if (empRing > 0) {
          empRing += 450 * dt;
          if (empRing > 260) empRing = 0;
        }

        if (fireCooldown > 0) fireCooldown -= dt;
        const firing = mouseDown || keys['Space'] || vi.action;
        if (firing && fireCooldown <= 0) {
          rounds.push({
            x: cx + Math.cos(aimAngle) * 26,
            y: cy + Math.sin(aimAngle) * 26,
            vx: Math.cos(aimAngle) * 680,
            vy: Math.sin(aimAngle) * 680,
          });
          fireCooldown = 0.13;
          soundFx.laser();
        }

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          const edgeAngle = Math.random() * Math.PI * 2;
          const dist = 540;
          const heavy = Math.random() < 0.25 + currentWave * 0.03;
          intruders.push({
            x: cx + Math.cos(edgeAngle) * dist,
            y: cy + Math.sin(edgeAngle) * dist,
            speed: (heavy ? 52 : 84) + currentWave * 8,
            hp: heavy ? 3 : 1,
            maxHp: heavy ? 3 : 1,
            radius: heavy ? 17 : 11,
          });
          spawnTimer = Math.max(0.32, 1.15 - currentWave * 0.08);
        }

        rounds.forEach((r) => {
          r.x += r.vx * dt;
          r.y += r.vy * dt;
        });
        rounds = rounds.filter((r) => r.x > -20 && r.x < logicalW + 20 && r.y > -20 && r.y < logicalH + 20);

        for (let i = intruders.length - 1; i >= 0; i--) {
          const enemy = intruders[i];
          const ang = Math.atan2(cy - enemy.y, cx - enemy.x);
          enemy.x += Math.cos(ang) * enemy.speed * dt;
          enemy.y += Math.sin(ang) * enemy.speed * dt;

          // Check bullet hit
          let destroyed = false;
          for (let j = rounds.length - 1; j >= 0; j--) {
            const b = rounds[j];
            if (Math.hypot(enemy.x - b.x, enemy.y - b.y) < enemy.radius + 5) {
              rounds.splice(j, 1);
              enemy.hp -= 1;
              if (enemy.hp <= 0) {
                intruders.splice(i, 1);
                currentScore += enemy.maxHp > 1 ? 150 : 75;
                const nextWave = Math.floor(currentScore / 1000) + 1;
                if (nextWave > currentWave) {
                  currentWave = nextWave;
                  setWave(currentWave);
                  soundFx.chime();
                } else {
                  soundFx.hit();
                }
                setScore(currentScore);
                onScoreChange(currentScore);
                destroyed = true;
                break;
              }
            }
          }
          if (destroyed) continue;

          // Check bastion impact
          if (Math.hypot(enemy.x - cx, enemy.y - cy) < 34 + enemy.radius) {
            intruders.splice(i, 1);
            currentIntegrity = Math.max(0, currentIntegrity - 15);
            setIntegrity(currentIntegrity);
            soundFx.hit();
            if (currentIntegrity <= 0) {
              soundFx.gameOver();
              setSyncedState('GAME_OVER');
            }
          }
        }
      }

      // Draw
      ctx.save();
      ctx.scale(qualityScale, qualityScale);
      ctx.fillStyle = '#0D1118';
      ctx.fillRect(0, 0, logicalW, logicalH);

      // Tactical grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < logicalW; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, logicalH);
        ctx.stroke();
      }
      for (let y = 0; y < logicalH; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(logicalW, y);
        ctx.stroke();
      }

      // Radar perimeter
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.beginPath();
      ctx.arc(cx, cy, 220, 0, Math.PI * 2);
      ctx.stroke();

      if (empRing > 0) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, empRing, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rounds
      ctx.fillStyle = '#F59E0B';
      rounds.forEach((r) => {
        ctx.beginPath();
        ctx.arc(r.x, r.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Intruders
      intruders.forEach((enemy) => {
        ctx.fillStyle = enemy.maxHp > 1 ? '#EF4444' : '#FB923C';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        if (enemy.maxHp > 1) {
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(enemy.x - 12, enemy.y - enemy.radius - 7, 24, 3);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(enemy.x - 12, enemy.y - enemy.radius - 7, (24 * enemy.hp) / enemy.maxHp, 3);
        }
      });

      // Central turret
      ctx.fillStyle = '#1E293B';
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(aimAngle);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(8, -5, 24, 10);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(28, -3, 6, 6);
      ctx.restore();

      ctx.restore();
      rafId = requestAnimationFrame(loop);
    };

    (window as unknown as { __bastionReset?: () => void }).__bastionReset = resetDefense;
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [quality, onScoreChange, onFpsSample, virtualInputRef]);

  const startDefense = () => {
    soundFx.click();
    const reset = (window as unknown as { __bastionReset?: () => void }).__bastionReset;
    reset?.();
    setSyncedState('PLAYING');
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#06080C] select-none">
      <canvas ref={canvasRef} className="w-full h-full object-contain cursor-crosshair" />

      {gameState === 'PLAYING' && (
        <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-center justify-between text-xs font-mono tabular-nums text-slate-200">
          <div className="flex items-center gap-4 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-3.5 py-2">
            <span>SCORE {score.toLocaleString()}</span>
            <span className="text-slate-500">·</span>
            <span>WAVE {wave}</span>
            <span className="text-slate-500">·</span>
            <span className={empReady ? 'text-emerald-400' : 'text-slate-500'}>
              {empReady ? 'EMP READY (E)' : 'RECHARGING'}
            </span>
          </div>
          <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-3.5 py-2">
            <span className="text-slate-400">CITADEL</span>
            <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-150 ${integrity > 40 ? 'bg-amber-400' : 'bg-red-500'}`}
                style={{ width: `${integrity}%` }}
              />
            </div>
            <span>{integrity}%</span>
          </div>
        </div>
      )}

      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-xs p-6">
          <div className="max-w-md w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold text-white">Iron Bastion</h2>
              <p className="text-sm text-slate-400">
                Aim with mouse or Left/Right keys · Click or Space to fire · Press E for EMP shockwave
              </p>
            </div>
            <button
              onClick={startDefense}
              className="w-full py-2.5 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
            >
              Deploy Turret
            </button>
          </div>
        </div>
      )}

      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-xs p-6">
          <div className="max-w-xs w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-4">
            <h3 className="text-xl font-semibold text-white">Defense Paused</h3>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => setSyncedState('PLAYING')}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                Resume
              </button>
              <button
                onClick={startDefense}
                className="w-full py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-sm cursor-pointer"
              >
                Restart Wave
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs p-6">
          <div className="max-w-sm w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-mono text-red-400">PERIMETER LOST</p>
              <h3 className="text-2xl font-semibold text-white">Bastion Overrun</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 py-3 border-y border-white/10 text-sm tabular-nums">
              <div>
                <p className="text-xs text-slate-400">Score</p>
                <p className="text-lg font-semibold text-white font-mono">{score.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Wave</p>
                <p className="text-lg font-semibold text-white font-mono">{wave}</p>
              </div>
            </div>
            <button
              onClick={startDefense}
              className="w-full py-2.5 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm cursor-pointer"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
