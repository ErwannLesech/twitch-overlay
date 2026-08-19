const { WebSocketServer, WebSocket } = require("ws");
const { state, challenge, spectator } = require("./store");

let wss = null;

function initWebsocket(server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "state", ...state }));
    ws.send(JSON.stringify(riotStatePayload()));
    ws.send(JSON.stringify(spectatorStatePayload()));
  });

  return wss;
}

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function broadcastState() {
  broadcast({ type: "state", ...state });
}

function riotStatePayload() {
  return {
    type:            "riotState",
    wins:            challenge.wins,
    losses:          challenge.losses,
    sessionWins:     challenge.sessionWins,
    sessionLosses:   challenge.sessionLosses,
    currentRank:     challenge.currentRank,
    milestones:      challenge.milestones,
    riotStatus:      challenge.riotStatus,
    riotError:       challenge.riotError,
    profileIconId:   challenge.profileIconId,
    displayName:     challenge.displayName,
    ddragonVersion:  challenge.ddragonVersion,
    recentMatches:   challenge.recentMatches,
    ladderRank:      challenge.ladderRank,
  };
}

function broadcastRiotState() {
  broadcast(riotStatePayload());
}

function spectatorStatePayload() {
  return {
    type:            "spectatorState",
    casting:         spectator.casting,
    spectatorStatus: spectator.spectatorStatus,
    spectatorError:  spectator.spectatorError,
    gameTime:        spectator.gameTime,
    goldDiff:        spectator.goldDiff,
    teamGold:        spectator.teamGold,
    recentEvents:    spectator.recentEvents,
    match:           spectator.match,
  };
}

function broadcastSpectatorState() {
  broadcast(spectatorStatePayload());
}

module.exports = { initWebsocket, broadcast, broadcastState, broadcastRiotState, broadcastSpectatorState };
