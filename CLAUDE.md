# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local Node.js server that listens to Twitch EventSub (WebSocket) for follows/subs/gift-subs and pushes live updates to an OBS Browser Source overlay. It also runs an optional second feature, **Challenge LoL**: polls the Riot Games API for ranked Solo/Duo match results and rank changes, and pushes those to two more Browser Source overlays (win/loss ratio, LP progress bar with milestones). No framework, no build step for the app itself — plain Express + `ws` on the backend, vanilla JS/HTML on the frontend. Distributed to streamers as a single `.exe` via `pkg`. UI text, logs, and error messages are in French — keep new user-facing strings in French for consistency.

## Commands

```bash
npm install
npm start          # node server.js — runs on http://localhost:3000
npm run dev         # node --watch server.js — auto-restart on change
npm run build:win   # package into dist/OverlayTwitch.exe via pkg
npm run build:mac   # package into dist/OverlayTwitch-mac
npm run build:all   # both targets
```

There is no test suite and no linter configured. Manual verification: run `npm start`, then exercise the flow through `/admin` (simulate follow/sub buttons) with `/overlay.html` open in another tab to confirm the WebSocket-driven animations fire. For Challenge LoL, use the "Challenge LoL" tab in `/admin` (simulate match/milestone buttons) with `/overlay_lol.html` and `/overlay_challenge_lp.html` open in other tabs.

## Architecture

`server.js` is a thin bootstrap (builds the Express app, mounts routers, starts the HTTP + WebSocket servers) that requires everything else from `src/`, organized by domain — no bundler, router framework, or client build for the app itself:

- `src/paths.js` — `BASE_DIR`/`PUBLIC_DIR`/`PORT` and the JSON file paths (single source of truth for the pkg-vs-dev path split, see Persistence below).
- `src/crash.js` — `crashAndWait()` + the `uncaughtException`/`unhandledRejection` handlers (side-effect on require).
- `src/store.js` — loads/saves `config.json`/`state.json`/`challenge.json`/`tokens.json`, owns `STATE_DEFAULTS`/`CHALLENGE_DEFAULTS` and the live `state`/`challenge` objects. `config` is exposed only via `getConfig()`/`setConfig()` (it starts `null` and is assigned once, so a raw exported binding wouldn't propagate across modules); `state`/`challenge` are shared mutable objects other modules mutate in place — `resetState()` uses `Object.assign` rather than reassignment for the same reason.
- `src/ws.js` — `initWebsocket(server)`, `broadcast()`, `broadcastState()`, `broadcastRiotState()`.
- `src/browser.js` — `openBrowser()` (cross-platform `start`/`open`/`xdg-open`).
- `src/twitch/authRoutes.js` — setup wizard + OAuth routes (`/config`, `/setup`, `/auth`, `/auth/callback`).
- `src/twitch/adminRoutes.js` — `/state`, `/admin/goal`, `/admin/goal-message`, `/admin/alert-messages`, `/admin/test/:event`.
- `src/twitch/eventsub.js` — `connectEventSub()` and everything it needs (token refresh, subscribing, initial counts, reauth).
- `src/riot/config.js` — Riot env vars, `RIOT_CONTINENT_BY_PLATFORM`, `RIOT_CONFIGURED`.
- `src/riot/rank.js` — `RIOT_TIERS`/`RIOT_DIVISIONS`/`RIOT_APEX_TIERS`/`rankValue`.
- `src/riot/api.js` — raw Riot + Data Dragon HTTP calls (`riotFetch`, `resolveRiotAccountInfo`, match/league/ddragon-version fetchers).
- `src/riot/poll.js` — `pollRiotChallenge()`/`startRiotChallenge()` orchestration.
- `src/riot/adminRoutes.js` — `/riot/state`, `/riot/start`, `/riot/adjust`, `/riot/milestones`, `/riot/test/*`.
- `public/setup.html` — first-run wizard: collects Twitch Client ID/Secret/username, exchanges them via `/setup` for a broadcaster ID (client-credentials grant + Helix user lookup), writes `config.json`.
- `public/admin.html` — control panel: simulate events, edit sub goal and alert message templates, manage Challenge LoL milestones and adjust win/loss counts (tabbed UI, Twitch tab + "Challenge LoL" tab), polls/pushes via `/state`, `/admin/*`, and `/riot/*` endpoints.
- `public/overlay.html` — the actual OBS Browser Source (1920×1080 canvas). Pure receiver: connects to `/ws`, animates counters and center-screen toasts based on incoming messages. No polling.
- `public/overlay_lol.html` (560×170 canvas) / `public/overlay_challenge_lp.html` (300×940 canvas) — two independent OBS Browser Sources for Challenge LoL: `overlay_lol.html` is the general-purpose League of Legends widget (profile/rank + win/loss ratio + champion icons of the last 10 ranked games, avatar framed by a rank-tier color) meant to stay in place long-term, while `overlay_challenge_lp.html` is specifically the LP progress bar tied to the current challenge's configurable rank milestones. Both are pure `/ws` receivers like `overlay.html`.

`pkg` follows `require()` calls statically from the `server.js` entry point, so this split has no effect on the `.exe` build — only `public/**/*` needs the explicit `pkg.assets` glob in `package.json` since those are non-JS static assets, not `require`d code.

### Data flow

1. Browser hits `/` → `server.js` redirects based on state: no `config.json` **or** no `tokens.json` → `/setup.html`; both present → `/admin`. `setup.html` itself redirects to `/auth` (Twitch OAuth) after a successful `POST /setup`, so the OAuth hop happens from the wizard, not from `/`.
2. `connectEventSub()` (`src/twitch/eventsub.js`) opens `wss://eventsub.wss.twitch.tv/ws`, subscribes to `channel.follow`, `channel.subscribe`, `channel.subscription.gift` once the session welcomes, and fetches initial follower/sub counts via Helix.
3. On a Twitch notification, `eventsub.js` mutates the shared in-memory `state` (from `src/store.js`), persists it (`saveState()`), and calls `broadcast()`/`broadcastState()` (`src/ws.js`) to fan out over the local `/ws` WebSocket server.
4. `overlay.html`'s `onmessage` switches on `msg.type`: `state` (full counter sync via `applyState`), `follow`/`sub` (queues a toast via `queueToast` + `fillTemplate`), `goalReached` (triggers `celebrateGoal`). Any new event type must be added on both ends: broadcast shape in `src/ws.js`/`eventsub.js` and a handler branch in `overlay.html`.
5. The admin panel does not use the WebSocket — it calls `/state` (GET) to read and `/admin/goal`, `/admin/goal-message`, `/admin/alert-messages`, `/admin/test/:event` (POST, `src/twitch/adminRoutes.js`) to write, then relies on the server also broadcasting so `overlay.html` picks up the change live.
6. Separately, `startRiotChallenge()` (`src/riot/poll.js`) runs `pollRiotChallenge()` on a 60s `setInterval` (only if Riot env vars are set — see below): it fetches the current Solo/Duo rank, the last 10 ranked games (for the match-history strip), and any new ranked match IDs since the last poll via the Riot API (`src/riot/api.js`), mutates the shared in-memory `challenge`, persists it (`saveChallenge()`), and calls `broadcast()`/`broadcastRiotState()` over the same `/ws` server using `riotState`/`riotMatch`/`riotMilestone` message types. `overlay_lol.html` and `overlay_challenge_lp.html` handle those the same way `overlay.html` handles Twitch events. The admin panel's "Challenge LoL" tab reads/writes via `/riot/state`, `/riot/start`, `/riot/adjust`, `/riot/milestones`, `/riot/test/*` (`src/riot/adminRoutes.js`).

### Persistence — flat JSON files, no database

- `config.json` — Twitch Client ID/Secret, resolved `broadcasterId`, `twitchUsername`. Created only by `/setup`. Deleting it forces the setup wizard again.
- `tokens.json` — OAuth access/refresh tokens from `/auth/callback`; refreshed automatically in `refreshAccessTokenIfNeeded` before each EventSub connection.
- `state.json` — follower/sub counters, `subGoal`, `goalReachedNotified`, and the three editable message templates (`goalMessage`, `followMessage`, `subMessage`). Defaults live in `STATE_DEFAULTS` and are merged with the file contents on load, so adding a new state field just means adding it to `STATE_DEFAULTS`.
- `challenge.json` — Challenge LoL state: `puuid`, `wins`, `losses`, `lastMatchId` (used to detect new ranked games between polls), `challengeStartedAt`, `currentRank`, `milestones` (array of `{ id, label, tier, division, lp, reachedAt }`), `riotStatus` (`unconfigured`/`connecting`/`ok`/`error`), `riotError`, `profileIconId`, `displayName` (`{ gameName, tagLine }`, resolved once from the Riot account API), `ddragonVersion` (current patch, used to build Data Dragon asset URLs), `recentMatches` (last 10 non-remake ranked games, most recent first: `{ matchId, win, championId, championName, queueId, endedAt }`), `ladderRank` (ladder position, apex tiers only — `null` otherwise). Same merge-with-`CHALLENGE_DEFAULTS` pattern as `state.json`.
- `.env` (optional, loaded via `dotenv` from `BASE_DIR`, not `__dirname`) — `RIOT_API_KEY`, `RIOT_GAME_NAME`, `RIOT_TAG_LINE`, `RIOT_PLATFORM`. Without it, `RIOT_CONFIGURED` is `false`, Challenge LoL polling never starts, and the two Challenge LoL overlays stay inactive while the Twitch overlay works normally. See `.env.example`.

**Packaged-exe path resolution matters**: `BASE_DIR` is `path.dirname(process.execPath)` when running under `pkg` (`process.pkg` truthy) so `config.json`/`tokens.json`/`state.json`/`challenge.json`/`.env` are read/written next to the `.exe`, but `PUBLIC_DIR` always resolves from `__dirname` (the read-only pkg virtual filesystem) since static assets are bundled into the snapshot. Don't collapse these two path bases — writing state next to `__dirname` would fail silently inside the packaged binary.

### Error handling convention

There's a global `crashAndWait()` hooked to `uncaughtException`/`unhandledRejection` that prints a French error banner and holds the console window open (via readline) rather than letting the exe window vanish — this is intentional for non-technical streamers running the packaged binary, not dead code to clean up.

### OBS auto-launch

`obs_autoload.lua` is an OBS Studio script (not part of the Node app) that streamers drop next to the `.exe` and load via OBS's Scripts panel; it shells out to `tasklist`/`start /MIN` on Windows to auto-launch `OverlayTwitch.exe` when OBS starts if it isn't already running.

### Manual launcher

`Lancer-Overlay.bat` is an alternative to `obs_autoload.lua` for streamers who'd rather double-click a shortcut than configure an OBS script: it just runs `dist\OverlayTwitch.exe` relative to its own location and keeps the console window open with a `pause` after the process exits, so a crash is visible instead of the window disappearing.

### Challenge LoL — Riot API polling

Independent of the Twitch/EventSub flow, gated entirely on `RIOT_CONFIGURED` (all four `.env` vars present and `RIOT_PLATFORM` mapped to a known continent in `RIOT_CONTINENT_BY_PLATFORM`). Lives in `src/riot/` (`config.js`, `rank.js`, `api.js`, `poll.js`, `adminRoutes.js`):

- `startRiotChallenge()` (`src/riot/poll.js`) is called once at server startup, kicks off a one-time `fetchDdragonVersion()` (current patch, cached in `challenge.ddragonVersion`, used to build Data Dragon profile-icon/champion-icon URLs — falls back to a hardcoded version if the fetch fails), and arms a 60s `setInterval` on `pollRiotChallenge()`.
- `pollRiotChallenge()` resolves the account once via `resolveRiotAccountInfo()` (cached in `challenge.puuid`/`challenge.profileIconId`/`challenge.displayName` — re-runs automatically on existing installs where `profileIconId` is still `null` from before this field existed), reads the current Solo/Duo (`RANKED_SOLO_5x5`) league entry for rank changes, and diffs the last 20 ranked match IDs against `challenge.lastMatchId` to detect newly completed games (remakes — under 5 min or an early surrender — are excluded from both the win/loss count and `recentMatches`).
- `challenge.recentMatches` (last 10 non-remake ranked games, for the match-history strip on `overlay_lol.html`) is independent of the wins/losses challenge counter — it's backfilled once via `backfillRecentMatches()` if empty, then kept incremental by reusing the match objects already fetched for win/loss detection (no extra API calls in the steady state).
- `challenge.ladderRank` is only populated for apex tiers (Master/Grandmaster/Challenger), via a dedicated per-tier league-listing endpoint (`fetchLadderRank()`) since Riot doesn't expose a ladder position below apex.
- `rankValue(tier, division, lp)` (`src/riot/rank.js`) is the single monotonic scale used both to detect milestones crossed by the current rank and to position/sort milestones for the LP bar UI — keep any new rank-comparison logic going through this function rather than comparing tiers/divisions ad hoc.
- Errors (bad/expired key vs. network issues) are distinguished by HTTP status and surfaced in French via `challenge.riotError`, shown in the admin panel's Riot status badge; polling keeps retrying every 60s regardless.
- `POST /riot/start` resets `wins`/`losses` and captures a new baseline `lastMatchId` so games played before the challenge start aren't retroactively counted — mirrors the "starting point" pattern used for `lastMatchId` on first poll. It does not touch `recentMatches`/`ladderRank`, which always reflect the true recent history regardless of when the challenge was (re)started.
