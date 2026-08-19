const fs = require("fs");
const { CONFIG_FILE, TOKENS_FILE, STATE_FILE, CHALLENGE_FILE, SPECTATOR_FILE } = require("./paths");

// ---------------------------------------------------------------------------
// config.json — Twitch Client ID/Secret, broadcasterId, twitchUsername.
// Exposed via getConfig()/setConfig() (not a raw exported binding) because it
// starts out null and is only assigned once /setup succeeds — a module that
// destructured `config` at require time would never see that assignment.
// ---------------------------------------------------------------------------
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    console.error(`[!] ${CONFIG_FILE} est illisible ou corrompu - il sera recrée via /setup.html`);
    return null;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();

function getConfig() {
  return config;
}

function setConfig(cfg) {
  config = cfg;
  saveConfig(config);
  return config;
}

// ---------------------------------------------------------------------------
// state.json — Twitch overlay counters/messages.
// ---------------------------------------------------------------------------
const STATE_DEFAULTS = {
  followers: 0, subs: 0, subGoal: 100, goalReachedNotified: false,
  alertsEnabled: true,
  goalMessage:   "Chaque sub rapproche la guilde de la victoire — rejoins-nous !",
  followMessage: "Merci pour le follow, {name} ! Bienvenue dans la Faille",
  subMessage:    "GG {name}, merci pour le sub ! Un guerrier de plus dans l'équipe",
};

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { ...STATE_DEFAULTS };
  try {
    return { ...STATE_DEFAULTS, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) };
  } catch {
    console.error(`[!] ${STATE_FILE} est illisible ou corrompu - les compteurs repartent de zero`);
    return { ...STATE_DEFAULTS };
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const state = loadState();

// Reset in place (Object.assign) rather than reassigning `state` — other
// modules hold a reference to this same object, so a reassignment here
// wouldn't be visible to them.
function resetState() {
  Object.assign(state, STATE_DEFAULTS, {
    subGoal:             state.subGoal,
    alertsEnabled:       state.alertsEnabled,
    goalMessage:         state.goalMessage,
    followMessage:       state.followMessage,
    subMessage:          state.subMessage,
    goalReachedNotified: false,
  });
}

// Ne diffuse pas lui-meme le message "goalReached" (pour eviter une dependance
// circulaire avec ws.js) - l'appelant diffuse si la valeur de retour est true.
function checkGoalReached() {
  if (state.subs >= state.subGoal && !state.goalReachedNotified) {
    state.goalReachedNotified = true;
    return true;
  }
  if (state.subs < state.subGoal) state.goalReachedNotified = false;
  return false;
}

// ---------------------------------------------------------------------------
// challenge.json — Challenge LoL (Riot API) state.
// ---------------------------------------------------------------------------
const CHALLENGE_DEFAULTS = {
  puuid:              null,
  wins:               0,
  losses:             0,
  sessionWins:        0,   // remis a zero a chaque demarrage du serveur (pas persistant entre sessions de stream)
  sessionLosses:      0,
  lastMatchId:        null,
  challengeStartedAt: null,
  currentRank:        null,  // { tier, division, lp }
  milestones:         [],    // [{ id, label, tier, division, lp, reachedAt }]
  riotStatus:         "unconfigured", // unconfigured | connecting | ok | error
  riotError:          null,
  profileIconId:      null,
  displayName:        null,  // { gameName, tagLine }
  ddragonVersion:     null,
  recentMatches:      [],    // [{ matchId, win, championId, championName, queueId, endedAt }], plus recent en 1er, max 10
  ladderRank:         null,  // position sur le ladder (tiers apex uniquement)
};

function loadChallenge() {
  if (!fs.existsSync(CHALLENGE_FILE)) return { ...CHALLENGE_DEFAULTS };
  try {
    return { ...CHALLENGE_DEFAULTS, ...JSON.parse(fs.readFileSync(CHALLENGE_FILE, "utf-8")) };
  } catch {
    console.error(`[!] ${CHALLENGE_FILE} est illisible ou corrompu - le challenge repart de zero`);
    return { ...CHALLENGE_DEFAULTS };
  }
}

function saveChallenge() {
  fs.writeFileSync(CHALLENGE_FILE, JSON.stringify(challenge, null, 2));
}

const challenge = loadChallenge();
// Le compteur "session" reflete le direct en cours : toujours remis a zero au
// demarrage du process, meme si une valeur perimee trainait dans challenge.json.
challenge.sessionWins   = 0;
challenge.sessionLosses = 0;

// ---------------------------------------------------------------------------
// spectator.json — Spectateur Cast (Live Client Data API) state.
// ---------------------------------------------------------------------------
const SPECTATOR_DEFAULTS = {
  casting:         false,   // interrupteur manuel (admin) - rythme "sur activation", pas de poll permanent
  spectatorStatus: "idle",  // idle | waiting | live | error
  spectatorError:  null,
  gameTime:        null,
  goldDiff:        null,    // gold equipe bleue - gold equipe rouge
  teamGold:        { blue: 0, red: 0 },
  lastEventId:     -1,      // dernier EventID Live Client Data traite
  recentEvents:    [],      // ring buffer des derniers events (feed debug admin + ticker overlay)
  match: {                  // saisi a la main dans l'admin, jamais deduit de l'API
    teamBlueName: "", teamBlueLogo: "",
    teamRedName:  "", teamRedLogo:  "",
    roundLabel:   "",       // ex. "Quart de finale - BO3 (1-0)"
  },
};

function loadSpectator() {
  if (!fs.existsSync(SPECTATOR_FILE)) return { ...SPECTATOR_DEFAULTS };
  try {
    return { ...SPECTATOR_DEFAULTS, ...JSON.parse(fs.readFileSync(SPECTATOR_FILE, "utf-8")) };
  } catch {
    console.error(`[!] ${SPECTATOR_FILE} est illisible ou corrompu - le spectateur cast repart de zero`);
    return { ...SPECTATOR_DEFAULTS };
  }
}

function saveSpectator() {
  fs.writeFileSync(SPECTATOR_FILE, JSON.stringify(spectator, null, 2));
}

const spectator = loadSpectator();

// ---------------------------------------------------------------------------
// tokens.json — OAuth access/refresh tokens.
// ---------------------------------------------------------------------------
function loadTokens() {
  if (!fs.existsSync(TOKENS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));
  } catch {
    console.error(`[!] ${TOKENS_FILE} est illisible ou corrompu - une nouvelle autorisation est necessaire`);
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

module.exports = {
  getConfig, setConfig,
  STATE_DEFAULTS, state, saveState, resetState, checkGoalReached,
  CHALLENGE_DEFAULTS, challenge, saveChallenge,
  SPECTATOR_DEFAULTS, spectator, saveSpectator,
  loadTokens, saveTokens,
};
