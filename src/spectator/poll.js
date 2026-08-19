const { fetchLiveClientData } = require("./api");
const { SPECTATOR_POLL_INTERVAL_MS } = require("./config");
const { spectator, saveSpectator } = require("../store");
const { broadcast, broadcastSpectatorState } = require("../ws");

const INTERESTING_EVENTS = new Set([
  "DragonKill", "BaronKill", "HeraldKill", "TurretKilled", "InhibKilled", "ChampionKill",
]);

// L'API Live Client Data n'expose l'or reellement en banque que pour le joueur
// actif/selectionne (perspective spectateur = un seul joueur a la fois) - le
// diff affiche est donc une estimation basee sur le prix cumule des items
// possedes par chaque equipe, comme le font les autres overlays communautaires.
// team "ORDER" = cote bleu, "CHAOS" = cote rouge (convention interne Riot).
function applyLiveClientData(data) {
  const players = data.allPlayers || [];
  let blueGold = 0;
  let redGold = 0;
  for (const p of players) {
    const itemGold = (p.items || []).reduce((sum, item) => sum + (item.price || 0), 0);
    if (p.team === "ORDER") blueGold += itemGold;
    else if (p.team === "CHAOS") redGold += itemGold;
  }
  spectator.teamGold = { blue: blueGold, red: redGold };
  spectator.goldDiff = blueGold - redGold;
  spectator.gameTime = data.gameData?.gameTime ?? null;

  const events    = (data.events && data.events.Events) || [];
  const newEvents = events.filter((e) => e.EventID > spectator.lastEventId && INTERESTING_EVENTS.has(e.EventName));
  for (const event of newEvents) {
    spectator.recentEvents = [event, ...spectator.recentEvents].slice(0, 10);
    broadcast({ type: "spectatorEvent", event });
  }
  if (events.length > 0) {
    spectator.lastEventId = Math.max(spectator.lastEventId, ...events.map((e) => e.EventID));
  }
}

async function pollSpectator() {
  if (!spectator.casting) return;
  try {
    const data = await fetchLiveClientData();
    applyLiveClientData(data);
    spectator.spectatorStatus = "live";
    spectator.spectatorError  = null;
    saveSpectator();
    broadcastSpectatorState();
  } catch (e) {
    if (e.code === "ECONNREFUSED") {
      // Pas de client League avec une partie en cours sur cette machine - etat
      // normal entre deux games, pas une vraie erreur.
      spectator.spectatorStatus = "waiting";
      spectator.spectatorError  = null;
    } else {
      spectator.spectatorStatus = "error";
      spectator.spectatorError  = "Impossible de lire les donnees du client League - verifiez qu'il est lance sur cette machine";
      console.error("[Spectator]", spectator.spectatorError, "-", e.message);
    }
    saveSpectator();
    broadcastSpectatorState();
  }
}

function startSpectator() {
  pollSpectator();
  setInterval(pollSpectator, SPECTATOR_POLL_INTERVAL_MS);
}

module.exports = { applyLiveClientData, pollSpectator, startSpectator };
