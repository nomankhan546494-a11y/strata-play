import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { DEFAULT_SETTINGS } from '../data/games';
import {
  CustomGameLink,
  GameCategory,
  MultiplayerRoom,
  SessionRecord,
  StreamSettings,
  UserProfile,
} from '../types/gaming';

const SETTINGS_KEY = 'strataplay_settings_v1';
const RECORDS_KEY = 'strataplay_records_v1';
const LIBRARY_KEY = 'strataplay_library_v1';
const CUSTOM_GAMES_KEY = 'strataplay_custom_games_v1';

const AVATAR_COLORS = ['#10B981', '#F59E0B', '#38BDF8', '#F97316', '#A78BFA'];

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `id_${Date.now()}`;
}

function makeDefaultGamerTag(user: User): string {
  const base = (user.displayName || user.email?.split('@')[0] || 'player')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 24);
  return base.length >= 2 ? base : `player_${user.uid.slice(0, 6)}`;
}

interface CloudAccountContextValue {
  user: User | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  profile: UserProfile | null;
  settings: StreamSettings;
  records: Record<string, SessionRecord>;
  libraryIds: string[];
  customGames: CustomGameLink[];
  cloudRooms: MultiplayerRoom[];
  cloudSynced: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfileInfo: (displayName: string, gamerTag: string, avatarColor: string) => Promise<void>;
  updateSettings: (next: StreamSettings) => Promise<void>;
  toggleLibrary: (gameId: string) => Promise<void>;
  recordSession: (gameId: string, score: number, durationSeconds: number, checkpointData?: string) => Promise<void>;
  addCustomGame: (customName: string, gameUrl: string, category: CustomGameLink['category']) => Promise<void>;
  renameCustomGame: (customGameId: string, newName: string) => Promise<void>;
  removeCustomGame: (customGameId: string) => Promise<void>;
  createCloudRoom: (room: Omit<MultiplayerRoom, 'id' | 'createdAt' | 'hostUid'>) => Promise<MultiplayerRoom>;
  joinCloudRoom: (roomId: string, currentPlayers: number, maxPlayers: number) => Promise<void>;
}

const CloudAccountContext = createContext<CloudAccountContextValue | null>(null);

export function CloudAccountProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [settings, setSettings] = useState<StreamSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [records, setRecords] = useState<Record<string, SessionRecord>>(() => {
    try {
      const raw = localStorage.getItem(RECORDS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [libraryIds, setLibraryIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY);
      return raw ? JSON.parse(raw) : ['slow-roads', 'krunker-io'];
    } catch {
      return ['slow-roads', 'krunker-io'];
    }
  });

  const [customGames, setCustomGames] = useState<CustomGameLink[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_GAMES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [cloudRooms, setCloudRooms] = useState<MultiplayerRoom[]>([]);

  // Persist local fallback copies
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(libraryIds));
  }, [libraryIds]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_GAMES_KEY, JSON.stringify(customGames));
  }, [customGames]);

  // Listen to Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setCloudRooms([]);
        return;
      }

      // Ensure user profile & settings exist in Firestore on first sign-in
      const userPath = `users/${nextUser.uid}`;
      try {
        const snap = await getDoc(doc(db, 'users', nextUser.uid));
        if (!snap.exists()) {
          const initialProfile = {
            uid: nextUser.uid,
            displayName: (nextUser.displayName || 'Cloud Player').slice(0, 60),
            gamerTag: makeDefaultGamerTag(nextUser),
            avatarColor: AVATAR_COLORS[nextUser.uid.charCodeAt(0) % AVATAR_COLORS.length],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'users', nextUser.uid), initialProfile);
        }

        const settingsRef = doc(db, 'users', nextUser.uid, 'settings', 'preferences');
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
          await setDoc(settingsRef, {
            uid: nextUser.uid,
            ...settings,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, userPath);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach Firestore real-time listeners when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const uid = user.uid;

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setProfile({
            uid: String(data.uid),
            displayName: String(data.displayName),
            gamerTag: String(data.gamerTag),
            avatarColor: String(data.avatarColor),
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${uid}`)
    );

    const unsubSettings = onSnapshot(
      doc(db, 'users', uid, 'settings', 'preferences'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setSettings({
            quality: d.quality,
            targetFps: d.targetFps,
            region: d.region,
            audioEnabled: Boolean(d.audioEnabled),
            showVirtualControls: Boolean(d.showVirtualControls),
            lowLatencyMode: Boolean(d.lowLatencyMode),
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${uid}/settings/preferences`)
    );

    const unsubProgress = onSnapshot(
      collection(db, 'users', uid, 'progress'),
      (snap) => {
        const nextRecords: Record<string, SessionRecord> = {};
        const nextLibrary: string[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const lastPlayed =
            d.lastPlayedAt && typeof d.lastPlayedAt.toDate === 'function'
              ? d.lastPlayedAt.toDate().toISOString()
              : new Date().toISOString();
          nextRecords[d.gameId] = {
            gameId: String(d.gameId),
            highScore: Number(d.highScore || 0),
            totalSeconds: Number(d.totalSeconds || 0),
            sessionsCount: Number(d.sessionsCount || 0),
            savedToLibrary: Boolean(d.savedToLibrary),
            checkpointData: String(d.checkpointData || '{}'),
            lastPlayedAt: lastPlayed,
          };
          if (d.savedToLibrary) nextLibrary.push(String(d.gameId));
        });
        setRecords((prev) => ({ ...prev, ...nextRecords }));
        if (nextLibrary.length > 0) {
          setLibraryIds(nextLibrary);
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/progress`)
    );

    const unsubCustomGames = onSnapshot(
      collection(db, 'users', uid, 'customGames'),
      (snap) => {
        const list: CustomGameLink[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            customGameId: String(d.customGameId),
            customName: String(d.customName),
            gameUrl: String(d.gameUrl),
            category: d.category || 'Custom',
            createdAt:
              d.createdAt && typeof d.createdAt.toDate === 'function'
                ? d.createdAt.toDate().toISOString()
                : undefined,
          });
        });
        setCustomGames(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/customGames`)
    );

    const roomsQuery = query(collection(db, 'multiplayerRooms'), where('status', '==', 'open'));
    const unsubRooms = onSnapshot(
      roomsQuery,
      (snap) => {
        const list: MultiplayerRoom[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: String(d.roomId),
            code: String(d.code),
            name: String(d.name),
            hostUid: String(d.hostUid),
            host: String(d.hostName),
            gameId: String(d.gameId),
            mode: d.mode,
            region: d.region,
            playersCurrent: Number(d.playersCurrent || 1),
            playersMax: Number(d.playersMax || 4),
            status: d.status,
            createdAt: 'Cloud Live',
          });
        });
        setCloudRooms(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'multiplayerRooms')
    );

    return () => {
      unsubProfile();
      unsubSettings();
      unsubProgress();
      unsubCustomGames();
      unsubRooms();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign-in could not be completed.');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthBusy(true);
    try {
      await signOut(auth);
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const updateProfileInfo = useCallback(
    async (displayName: string, gamerTag: string, avatarColor: string) => {
      if (!user) return;
      const cleanName = displayName.trim().slice(0, 60) || 'Cloud Player';
      const cleanTag = gamerTag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'player';
      const path = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          displayName: cleanName,
          gamerTag: cleanTag.length >= 2 ? cleanTag : `${cleanTag}_1`,
          avatarColor: avatarColor.slice(0, 16),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const updateSettings = useCallback(
    async (next: StreamSettings) => {
      setSettings(next);
      if (!user) return;
      const path = `users/${user.uid}/settings/preferences`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'settings', 'preferences'), {
          uid: user.uid,
          quality: next.quality,
          targetFps: next.targetFps,
          region: next.region,
          audioEnabled: next.audioEnabled,
          showVirtualControls: next.showVirtualControls,
          lowLatencyMode: next.lowLatencyMode,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user]
  );

  const toggleLibrary = useCallback(
    async (gameId: string) => {
      const cleanId = sanitizeId(gameId);
      const isCurrentlySaved = libraryIds.includes(cleanId);
      const nextSaved = !isCurrentlySaved;
      setLibraryIds((prev) => (isCurrentlySaved ? prev.filter((id) => id !== cleanId) : [...prev, cleanId]));

      if (!user) return;
      const path = `users/${user.uid}/progress/${cleanId}`;
      try {
        const ref = doc(db, 'users', user.uid, 'progress', cleanId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, {
            savedToLibrary: nextSaved,
            updatedAt: serverTimestamp(),
          });
        } else {
          const prevRec = records[cleanId];
          await setDoc(ref, {
            uid: user.uid,
            gameId: cleanId,
            highScore: prevRec?.highScore || 0,
            totalSeconds: prevRec?.totalSeconds || 0,
            sessionsCount: prevRec?.sessionsCount || 0,
            savedToLibrary: nextSaved,
            checkpointData: prevRec?.checkpointData || '{}',
            lastPlayedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [libraryIds, records, user]
  );

  const recordSession = useCallback(
    async (gameId: string, score: number, durationSeconds: number, checkpointData = '{}') => {
      const cleanId = sanitizeId(gameId);
      const prev = records[cleanId];
      const nextHigh = Math.max(prev?.highScore || 0, Math.max(0, Math.round(score)));
      const nextTotal = (prev?.totalSeconds || 0) + Math.max(1, Math.round(durationSeconds));
      const nextCount = (prev?.sessionsCount || 0) + 1;
      const savedFlag = libraryIds.includes(cleanId) || Boolean(prev?.savedToLibrary);
      const clippedCheckpoint = checkpointData.slice(0, 2000);

      setRecords((curr) => ({
        ...curr,
        [cleanId]: {
          gameId: cleanId,
          highScore: nextHigh,
          totalSeconds: nextTotal,
          sessionsCount: nextCount,
          savedToLibrary: savedFlag,
          checkpointData: clippedCheckpoint,
          lastPlayedAt: new Date().toISOString(),
        },
      }));

      if (!user) return;
      const path = `users/${user.uid}/progress/${cleanId}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'progress', cleanId), {
          uid: user.uid,
          gameId: cleanId,
          highScore: nextHigh,
          totalSeconds: nextTotal,
          sessionsCount: nextCount,
          savedToLibrary: savedFlag,
          checkpointData: clippedCheckpoint,
          lastPlayedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [libraryIds, records, user]
  );

  const addCustomGame = useCallback(
    async (customName: string, gameUrl: string, category: CustomGameLink['category']) => {
      const cleanName = customName.trim().slice(0, 80);
      const cleanUrl = gameUrl.trim().slice(0, 500);
      if (!cleanName || !/^https?:\/\/.+/.test(cleanUrl)) {
        throw new Error('Please provide a valid game name and https:// or http:// game link.');
      }
      const customGameId = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const entry: CustomGameLink = {
        customGameId,
        customName: cleanName,
        gameUrl: cleanUrl,
        category,
        createdAt: new Date().toISOString(),
      };

      setCustomGames((prev) => [entry, ...prev]);
      if (!user) return;

      const path = `users/${user.uid}/customGames/${customGameId}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'customGames', customGameId), {
          uid: user.uid,
          customGameId,
          customName: cleanName,
          gameUrl: cleanUrl,
          category,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [user]
  );

  const renameCustomGame = useCallback(
    async (customGameId: string, newName: string) => {
      const cleanName = newName.trim().slice(0, 80);
      if (!cleanName) return;
      setCustomGames((prev) =>
        prev.map((g) => (g.customGameId === customGameId ? { ...g, customName: cleanName } : g))
      );
      if (!user) return;
      const path = `users/${user.uid}/customGames/${customGameId}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'customGames', customGameId), {
          customName: cleanName,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const removeCustomGame = useCallback(
    async (customGameId: string) => {
      setCustomGames((prev) => prev.filter((g) => g.customGameId !== customGameId));
      if (!user) return;
      const path = `users/${user.uid}/customGames/${customGameId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'customGames', customGameId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const createCloudRoom = useCallback(
    async (room: Omit<MultiplayerRoom, 'id' | 'createdAt' | 'hostUid'>): Promise<MultiplayerRoom> => {
      const roomId = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const created: MultiplayerRoom = {
        ...room,
        id: roomId,
        hostUid: user?.uid,
        status: 'open',
        createdAt: 'Just now',
      };
      if (!user) {
        setCloudRooms((prev) => [created, ...prev]);
        return created;
      }

      const path = `multiplayerRooms/${roomId}`;
      try {
        await setDoc(doc(db, 'multiplayerRooms', roomId), {
          roomId,
          code: room.code,
          name: room.name.slice(0, 80),
          hostUid: user.uid,
          hostName: (profile?.gamerTag || room.host || 'Player').slice(0, 40),
          gameId: sanitizeId(room.gameId),
          mode: room.mode,
          region: room.region,
          playersCurrent: 1,
          playersMax: room.playersMax,
          status: 'open',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return created;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [profile?.gamerTag, user]
  );

  const joinCloudRoom = useCallback(
    async (roomId: string, currentPlayers: number, maxPlayers: number) => {
      if (!user) return;
      const nextCount = Math.min(maxPlayers, currentPlayers + 1);
      const path = `multiplayerRooms/${roomId}`;
      try {
        await updateDoc(doc(db, 'multiplayerRooms', roomId), {
          playersCurrent: nextCount,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const value = useMemo<CloudAccountContextValue>(
    () => ({
      user,
      authReady,
      authBusy,
      authError,
      profile,
      settings,
      records,
      libraryIds,
      customGames,
      cloudRooms,
      cloudSynced: Boolean(user),
      signInWithGoogle,
      logout,
      updateProfileInfo,
      updateSettings,
      toggleLibrary,
      recordSession,
      addCustomGame,
      renameCustomGame,
      removeCustomGame,
      createCloudRoom,
      joinCloudRoom,
    }),
    [
      user,
      authReady,
      authBusy,
      authError,
      profile,
      settings,
      records,
      libraryIds,
      customGames,
      cloudRooms,
      signInWithGoogle,
      logout,
      updateProfileInfo,
      updateSettings,
      toggleLibrary,
      recordSession,
      addCustomGame,
      renameCustomGame,
      removeCustomGame,
      createCloudRoom,
      joinCloudRoom,
    ]
  );

  return <CloudAccountContext.Provider value={value}>{children}</CloudAccountContext.Provider>;
}

export function useCloudAccount() {
  const ctx = useContext(CloudAccountContext);
  if (!ctx) throw new Error('useCloudAccount must be used inside CloudAccountProvider');
  return ctx;
}
