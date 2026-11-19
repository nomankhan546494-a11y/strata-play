import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GAME_CATALOG } from './src/data/games.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const SESSION_MAX_SECONDS = 3600; // 1 hour play session limit per run

interface ActiveSession {
  sessionId: string;
  gameId: string;
  region: string;
  roomCode?: string;
  gamerTag: string;
  startedAt: number;
  remainingSeconds: number;
  nodeLabel: string;
  clients: Set<WebSocket>;
  timer?: NodeJS.Timeout;
}

interface RoomPeer {
  peerId: string;
  gamerTag: string;
  score: number;
  x?: number;
  y?: number;
  socket: WebSocket;
}

const activeSessions = new Map<string, ActiveSession>();
const roomPeers = new Map<string, Map<string, RoomPeer>>();

function makeSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function bootstrap() {
  const app = express();
  app.use(express.json());

  // Hosted catalog endpoint
  app.get('/api/games', (_req, res) => {
    res.json({
      games: GAME_CATALOG,
      sessionLimitSeconds: SESSION_MAX_SECONDS,
      regions: ['Tokyo East', 'Singapore', 'Frankfurt', 'US West'],
    });
  });

  // Allocate a cloud game session (1-hour play window)
  app.post('/api/sessions', (req, res) => {
    const { gameId, region = 'Singapore', roomCode, gamerTag = 'Player' } = req.body ?? {};
    if (!gameId || typeof gameId !== 'string') {
      res.status(400).json({ error: 'gameId is required' });
      return;
    }

    const sessionId = makeSessionId();
    const regionCode = String(region).toLowerCase().replace(/\s+/g, '-');
    const nodeNum = Math.floor(10 + Math.random() * 89);
    const session: ActiveSession = {
      sessionId,
      gameId,
      region: String(region),
      roomCode: typeof roomCode === 'string' && roomCode ? roomCode : undefined,
      gamerTag: String(gamerTag).slice(0, 32),
      startedAt: Date.now(),
      remainingSeconds: SESSION_MAX_SECONDS,
      nodeLabel: `${regionCode}-gpu-${nodeNum}`,
      clients: new Set(),
    };

    // Server-authoritative 1-hour play session countdown
    session.timer = setInterval(() => {
      session.remainingSeconds = Math.max(0, session.remainingSeconds - 1);
      const tickPayload = JSON.stringify({
        type: 'session:tick',
        sessionId: session.sessionId,
        remainingSeconds: session.remainingSeconds,
        maxDurationSeconds: SESSION_MAX_SECONDS,
      });

      for (const client of session.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(tickPayload);
        }
      }

      if (session.remainingSeconds <= 0) {
        const expiredPayload = JSON.stringify({
          type: 'session:expired',
          sessionId: session.sessionId,
          reason: 'One-hour cloud play session limit reached.',
        });
        for (const client of session.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(expiredPayload);
          }
        }
        if (session.timer) clearInterval(session.timer);
        activeSessions.delete(sessionId);
      }
    }, 1000);

    activeSessions.set(sessionId, session);

    res.status(201).json({
      sessionId: session.sessionId,
      gameId: session.gameId,
      region: session.region,
      maxDurationSeconds: SESSION_MAX_SECONDS,
      remainingSeconds: session.remainingSeconds,
      nodeLabel: session.nodeLabel,
    });
  });

  app.get('/api/sessions/:sessionId', (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    res.json({
      sessionId: session.sessionId,
      gameId: session.gameId,
      region: session.region,
      maxDurationSeconds: SESSION_MAX_SECONDS,
      remainingSeconds: session.remainingSeconds,
      nodeLabel: session.nodeLabel,
    });
  });

  app.delete('/api/sessions/:sessionId', (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (session) {
      if (session.timer) clearInterval(session.timer);
      activeSessions.delete(req.params.sessionId);
    }
    res.json({ ok: true });
  });

  // Probe whether an external 3D web game allows iframe embedding
  app.get('/api/probe-embed', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!/^https?:\/\/.+/.test(rawUrl)) {
      res.status(400).json({ embeddable: false, reason: 'Invalid URL' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      let resp = await fetch(rawUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StrataPlayStreamProbe/1.0)' },
      });
      if (resp.status === 405 || resp.status === 403) {
        resp = await fetch(rawUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StrataPlayStreamProbe/1.0)' },
        });
      }

      const xfo = (resp.headers.get('x-frame-options') || '').toLowerCase();
      const csp = (resp.headers.get('content-security-policy') || '').toLowerCase();

      const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin');
      let blockedByCsp = false;
      const faMatch = csp.match(/frame-ancestors\s+([^;]+)/);
      if (faMatch) {
        const val = faMatch[1].trim();
        if (val === "'none'" || val === "'self'" || !val.includes('*')) {
          blockedByCsp = true;
        }
      }

      if (blockedByXfo || blockedByCsp) {
        res.json({
          embeddable: false,
          reason: blockedByXfo
            ? `Blocked by X-Frame-Options (${xfo})`
            : 'Blocked by Content-Security-Policy frame-ancestors',
        });
        return;
      }

      res.json({ embeddable: true });
    } catch {
      // If probe times out or network blocks server-side HEAD, let client try iframe with fallback ready
      res.json({ embeddable: true, uncertain: true });
    } finally {
      clearTimeout(timeout);
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws/stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, url);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, url: URL) => {
    const sessionId = url.searchParams.get('sessionId') || '';
    const roomCode = url.searchParams.get('roomCode') || '';
    const peerId = `peer_${Math.random().toString(36).slice(2, 9)}`;
    const session = activeSessions.get(sessionId);

    if (session) {
      session.clients.add(ws);
      ws.send(
        JSON.stringify({
          type: 'stream:ready',
          sessionId: session.sessionId,
          nodeLabel: session.nodeLabel,
          remainingSeconds: session.remainingSeconds,
          maxDurationSeconds: SESSION_MAX_SECONDS,
          serverTime: Date.now(),
        })
      );
    } else {
      ws.send(
        JSON.stringify({
          type: 'stream:ready',
          sessionId: sessionId || 'ad-hoc',
          nodeLabel: 'edge-gpu-01',
          remainingSeconds: SESSION_MAX_SECONDS,
          maxDurationSeconds: SESSION_MAX_SECONDS,
          serverTime: Date.now(),
        })
      );
    }

    const broadcastRoomPeers = (targetRoom: string) => {
      const peersMap = roomPeers.get(targetRoom);
      if (!peersMap) return;
      const list = Array.from(peersMap.values()).map((p) => ({
        peerId: p.peerId,
        gamerTag: p.gamerTag,
        score: p.score,
        x: p.x,
        y: p.y,
        updatedAt: Date.now(),
      }));
      const msg = JSON.stringify({ type: 'room:peers', roomCode: targetRoom, peers: list });
      for (const peer of peersMap.values()) {
        if (peer.socket.readyState === WebSocket.OPEN) {
          peer.socket.send(msg);
        }
      }
    };

    if (roomCode) {
      if (!roomPeers.has(roomCode)) roomPeers.set(roomCode, new Map());
      roomPeers.get(roomCode)!.set(peerId, {
        peerId,
        gamerTag: session?.gamerTag || 'Player',
        score: 0,
        socket: ws,
      });
      broadcastRoomPeers(roomCode);
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'stream:ping') {
          ws.send(
            JSON.stringify({
              type: 'stream:pong',
              clientTs: msg.clientTs,
              serverTs: Date.now(),
            })
          );
        } else if (msg.type === 'player:state' && roomCode) {
          const peersMap = roomPeers.get(roomCode);
          const existingPeer = peersMap?.get(peerId);
          if (existingPeer) {
            existingPeer.score = Number(msg.score || 0);
            if (typeof msg.x === 'number') existingPeer.x = msg.x;
            if (typeof msg.y === 'number') existingPeer.y = msg.y;
            if (typeof msg.gamerTag === 'string' && msg.gamerTag) existingPeer.gamerTag = msg.gamerTag.slice(0, 32);
            broadcastRoomPeers(roomCode);
          }
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      if (session) {
        session.clients.delete(ws);
      }
      if (roomCode && roomPeers.has(roomCode)) {
        const peersMap = roomPeers.get(roomCode)!;
        peersMap.delete(peerId);
        if (peersMap.size === 0) {
          roomPeers.delete(roomCode);
        } else {
          broadcastRoomPeers(roomCode);
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Strata Play server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
