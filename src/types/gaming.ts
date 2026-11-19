export type AppTab = 'discover' | 'library' | 'multiplayer' | 'profile' | 'settings';

export type GameCategory = 'All' | 'Racing' | 'Action' | 'Shooter' | 'Battle Royale' | 'Custom';

export type GameEngineId = 'web_stream' | 'custom_link';

export type StreamQuality = '720p' | '1080p' | '1440p' | '4K';

export type TargetFps = 60 | 120;

export type ServerRegion = 'Tokyo East' | 'Singapore' | 'Frankfurt' | 'US West';

export interface GameTitle {
  id: string;
  engine: GameEngineId;
  title: string;
  subtitle: string;
  category: Exclude<GameCategory, 'All'> | 'Strategy' | 'Puzzle';
  releaseYear: number;
  maxResolution: StreamQuality;
  maxFps: TargetFps;
  inputSupport: string;
  players: string;
  coverImage: string;
  heroImage?: string;
  accentHex: string;
  controlsSummary: string[];
  description: string;
  streamUrl: string;
  customUrl?: string;
  isCustom?: boolean;
}

export interface CustomGameLink {
  customGameId: string;
  customName: string;
  gameUrl: string;
  category: 'Action' | 'Racing' | 'Strategy' | 'Puzzle' | 'Custom';
  createdAt?: string;
}

export interface StreamSettings {
  quality: StreamQuality;
  targetFps: TargetFps;
  region: ServerRegion;
  audioEnabled: boolean;
  showVirtualControls: boolean;
  lowLatencyMode: boolean;
}

export interface CheckpointState {
  wave?: number;
  lap?: number;
  vault?: number;
  score?: number;
  savedAt?: string;
}

export interface SessionRecord {
  gameId: string;
  highScore: number;
  totalSeconds: number;
  sessionsCount: number;
  savedToLibrary?: boolean;
  checkpointData?: string;
  lastPlayedAt: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  gamerTag: string;
  avatarColor: string;
}

export interface MultiplayerRoom {
  id: string;
  code: string;
  name: string;
  hostUid?: string;
  host: string;
  gameId: string;
  mode: 'Co-op Survival' | '1v1 Duel' | 'Time Attack';
  region: ServerRegion;
  playersCurrent: number;
  playersMax: number;
  status?: 'open' | 'closed';
  createdAt: string;
}

export interface StreamSessionInfo {
  sessionId: string;
  gameId: string;
  region: ServerRegion;
  maxDurationSeconds: number;
  remainingSeconds: number;
  nodeLabel: string;
}

export interface RemotePeerState {
  peerId: string;
  gamerTag: string;
  score: number;
  x?: number;
  y?: number;
  updatedAt: number;
}
