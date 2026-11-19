import { useEffect, useState } from 'react';
import { soundFx } from '../../utils/soundFx';

interface EngineProps {
  onScoreChange: (score: number) => void;
  onFpsSample: (fps: number) => void;
}

type GameState = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER';
type Dir = 0 | 1 | 2 | 3; // 0:N, 1:E, 2:S, 3:W

interface Tile {
  kind: 'straight' | 'corner' | 'tee' | 'emitter' | 'receiver';
  rot: Dir;
  powered: boolean;
}

const DIRS: Record<Tile['kind'], Dir[]> = {
  straight: [0, 2],
  corner: [0, 1],
  tee: [0, 1, 3],
  emitter: [1],
  receiver: [3],
};

function getConnections(tile: Tile): Dir[] {
  return DIRS[tile.kind].map((d) => ((d + tile.rot) % 4) as Dir);
}

function createPuzzleGrid(): Tile[][] {
  const layout: Tile['kind'][][] = [
    ['emitter', 'straight', 'corner', 'corner', 'straight'],
    ['corner', 'tee', 'corner', 'straight', 'corner'],
    ['straight', 'corner', 'tee', 'corner', 'straight'],
    ['corner', 'straight', 'corner', 'tee', 'corner'],
    ['straight', 'corner', 'straight', 'corner', 'receiver'],
  ];
  return layout.map((row, r) =>
    row.map((kind, c) => ({
      kind,
      rot:
        (r === 0 && c === 0) || (r === 4 && c === 4)
          ? 0
          : ((Math.floor(Math.random() * 4) % 4) as Dir),
      powered: false,
    }))
  );
}

function evaluatePower(grid: Tile[][]): { next: Tile[][]; solved: boolean; litCount: number } {
  const rows = grid.length;
  const cols = grid[0].length;
  const next = grid.map((r) => r.map((t) => ({ ...t, powered: false })));

  const queue: [number, number][] = [[0, 0]];
  next[0][0].powered = true;
  let litCount = 1;

  const delta: Record<Dir, [number, number]> = {
    0: [-1, 0],
    1: [0, 1],
    2: [1, 0],
    3: [0, -1],
  };

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const conns = getConnections(next[r][c]);
    for (const d of conns) {
      const [dr, dc] = delta[d];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (next[nr][nc].powered) continue;
      const opposite = ((d + 2) % 4) as Dir;
      if (getConnections(next[nr][nc]).includes(opposite)) {
        next[nr][nc].powered = true;
        litCount++;
        queue.push([nr, nc]);
      }
    }
  }

  return { next, solved: next[4][4].powered, litCount };
}

export function SignalBreachEngine({ onScoreChange, onFpsSample }: EngineProps) {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [grid, setGrid] = useState<Tile[][]>(() => evaluatePower(createPuzzleGrid()).next);
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(45);

  useEffect(() => {
    onFpsSample(60);
    if (gameState !== 'PLAYING') return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          soundFx.gameOver();
          setGameState('GAME_OVER');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState, onFpsSample]);

  const startGame = () => {
    soundFx.click();
    setLevel(1);
    setScore(0);
    setTimeLeft(45);
    onScoreChange(0);
    setGrid(evaluatePower(createPuzzleGrid()).next);
    setGameState('PLAYING');
  };

  const rotateTile = (r: number, c: number) => {
    if (gameState !== 'PLAYING') return;
    const tile = grid[r][c];
    if (tile.kind === 'emitter' || tile.kind === 'receiver') return;
    soundFx.click();

    const updated = grid.map((row, ri) =>
      row.map((cell, ci) =>
        ri === r && ci === c ? { ...cell, rot: ((cell.rot + 1) % 4) as Dir } : cell
      )
    );
    const { next, solved } = evaluatePower(updated);
    setGrid(next);

    if (solved) {
      soundFx.chime();
      const bonus = 400 + timeLeft * 15;
      const newScore = score + bonus;
      setScore(newScore);
      onScoreChange(newScore);
      setLevel((l) => l + 1);
      setTimeLeft((t) => Math.min(60, t + 18));
      setTimeout(() => {
        setGrid(evaluatePower(createPuzzleGrid()).next);
      }, 280);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#090B0F] p-6 select-none">
      {gameState === 'PLAYING' && (
        <div className="mb-5 flex items-center gap-6 text-xs font-mono tabular-nums text-slate-200 bg-[#12161F] border border-white/10 rounded-lg px-4 py-2">
          <span>VAULT {level}</span>
          <span className="text-slate-500">·</span>
          <span>SCORE {score.toLocaleString()}</span>
          <span className="text-slate-500">·</span>
          <span className={timeLeft <= 10 ? 'text-red-400' : 'text-emerald-400'}>TIME {timeLeft}s</span>
        </div>
      )}

      <div className="grid grid-cols-5 gap-2.5 bg-[#12161F] p-4 rounded-xl border border-white/10">
        {grid.map((row, r) =>
          row.map((tile, c) => {
            const conns = getConnections(tile);
            const isEndpoint = tile.kind === 'emitter' || tile.kind === 'receiver';
            return (
              <button
                key={`${r}-${c}`}
                onClick={() => rotateTile(r, c)}
                disabled={isEndpoint || gameState !== 'PLAYING'}
                aria-label={`Grid node ${r + 1},${c + 1}`}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg border transition-colors flex items-center justify-center ${
                  tile.powered
                    ? 'bg-emerald-500/12 border-emerald-400/60'
                    : 'bg-[#0B0D12] border-white/10 hover:border-white/25'
                } ${isEndpoint ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <svg viewBox="0 0 40 40" className="w-full h-full">
                  {conns.includes(0) && (
                    <line x1="20" y1="20" x2="20" y2="0" stroke={tile.powered ? '#34D399' : '#64748B'} strokeWidth="4" />
                  )}
                  {conns.includes(1) && (
                    <line x1="20" y1="20" x2="40" y2="20" stroke={tile.powered ? '#34D399' : '#64748B'} strokeWidth="4" />
                  )}
                  {conns.includes(2) && (
                    <line x1="20" y1="20" x2="20" y2="40" stroke={tile.powered ? '#34D399' : '#64748B'} strokeWidth="4" />
                  )}
                  {conns.includes(3) && (
                    <line x1="20" y1="20" x2="0" y2="20" stroke={tile.powered ? '#34D399' : '#64748B'} strokeWidth="4" />
                  )}
                  <circle
                    cx="20"
                    cy="20"
                    r={isEndpoint ? 7 : 4}
                    fill={tile.kind === 'emitter' ? '#10B981' : tile.kind === 'receiver' ? (tile.powered ? '#34D399' : '#F59E0B') : tile.powered ? '#34D399' : '#94A3B8'}
                  />
                </svg>
              </button>
            );
          })
        )}
      </div>

      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-xs p-6">
          <div className="max-w-md w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold text-white">Signal Breach</h2>
              <p className="text-sm text-slate-400">
                Click glass monolith nodes to rotate beams from the top-left Emitter to the bottom-right Receiver.
              </p>
            </div>
            <button
              onClick={startGame}
              className="w-full py-2.5 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm cursor-pointer"
            >
              Start Breach
            </button>
          </div>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs p-6">
          <div className="max-w-sm w-full bg-[#12161F] border border-white/10 rounded-xl p-6 text-center space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-mono text-amber-400">TIMER EXPIRED</p>
              <h3 className="text-2xl font-semibold text-white">Vault Locked</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 py-3 border-y border-white/10 text-sm tabular-nums">
              <div>
                <p className="text-xs text-slate-400">Final Score</p>
                <p className="text-lg font-semibold text-white font-mono">{score.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Vaults Cleared</p>
                <p className="text-lg font-semibold text-white font-mono">{level - 1}</p>
              </div>
            </div>
            <button
              onClick={startGame}
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
