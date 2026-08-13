const { WebSocketServer, WebSocket } = require("ws");
const { state, challenge } = require("./store");

let wss = null;

function initWebsocket(server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "state", ...state }));
    ws.send(JSON.stringify(riotStatePayload()));
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

module.exports = { initWebsocket, broadcast, broadcastState, broadcastRiotState };
