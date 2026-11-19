# Security Specification (Payload-First TDD)

## 1. Data Invariants
1. A `UserProfile` document under `/users/{userId}` can only be read or written by the verified owner (`request.auth.uid == userId` and `email_verified == true`), with `uid == userId` and immutable `createdAt`.
2. A `UserSettings` document under `/users/{userId}/settings/{settingId}` can only be read or written by the verified owner, with `uid == userId` and strict allowlists for `quality`, `region`, and `targetFps`.
3. A `GameProgress` document under `/users/{userId}/progress/{gameId}` belongs exclusively to `userId`, enforces non-negative numbers for `highScore`, `totalSeconds`, `sessionsCount`, and caps `checkpointData` to `<= 2048` bytes.
4. A `CustomGameLink` document under `/users/{userId}/customGames/{customGameId}` belongs exclusively to `userId`, mandates `https?://` scheme for `gameUrl`, and caps `customName` to 80 chars.
5. A `MultiplayerRoom` document under `/multiplayerRooms/{roomId}` requires `hostUid == request.auth.uid` on creation, locks terminal `status == 'closed'` from further mutation, and restricts `allow list` to `resource.data.status == 'open'`.

## 2. Dirty Dozen Adversarial Payloads
1. **Identity Spoofing (Profile)**: User A creates `/users/userB` with `uid: "userB"`. -> DENIED.
2. **Ghost Field Injection (Profile)**: User A creates `/users/userA` with extra `isAdmin: true`. -> DENIED by `hasOnly`.
3. **Unverified Email Write**: Unverified auth token attempts to write `/users/userA`. -> DENIED by `email_verified == true`.
4. **Cross-User Progress Tamper**: User A updates `/users/userB/progress/starfall-interceptor`. -> DENIED.
5. **Resource Exhaustion (Progress)**: User A writes `checkpointData` of 50KB. -> DENIED by `.size() <= 2048`.
6. **Negative Score Poisoning**: User A writes `highScore: -999`. -> DENIED by `highScore >= 0`.
7. **Invalid URL Scheme (Custom Game)**: User A writes `gameUrl: "javascript:alert(1)"`. -> DENIED by regex `^https?://.+`.
8. **ID Poisoning**: User A targets `/users/userA/customGames/bad$id!!`. -> DENIED by `isValidId()`.
9. **Immutable Field Mutation**: User A updates `createdAt` on `/users/userA/customGames/g1`. -> DENIED by `incoming().createdAt == existing().createdAt`.
10. **Host Spoofing (Multiplayer)**: User A creates room with `hostUid: "userB"`. -> DENIED.
11. **Terminal Room Re-open**: Host updates room where `existing().status == 'closed'`. -> DENIED.
12. **Blanket Unscoped List**: User attempts `list` on `/multiplayerRooms` without filtering `status == 'open'`. -> DENIED.
