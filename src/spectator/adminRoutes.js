const express = require("express");
const { spectator, saveSpectator } = require("../store");
const { broadcastSpectatorState } = require("../ws");
const { applyLiveClientData } = require("./poll");

const router = express.Router();

router.get("/spectator/state", (req, res) => {
  res.json({
    casting:         spectator.casting,
    spectatorStatus: spectator.spectatorStatus,
    spectatorError:  spectator.spectatorError,
    gameTime:        spectator.gameTime,
    goldDiff:        spectator.goldDiff,
    teamGold:        spectator.teamGold,
    recentEvents:    spectator.recentEvents,
    match:           spectator.match,
  });
});

router.post("/spectator/cast", (req, res) => {
  const enabled = !!req.body.enabled;
  spectator.casting = enabled;
  if (enabled) {
    // Nouvelle session de cast : on repart d'un etat "en direct" propre, sans
    // toucher a la configuration du match (equipes/round) saisie a part.
    spectator.gameTime        = null;
    spectator.goldDiff        = null;
    spectator.teamGold        = { blue: 0, red: 0 };
    spectator.lastEventId     = -1;
    spectator.recentEvents    = [];
    spectator.spectatorStatus = "waiting";
    spectator.spectatorError  = null;
  } else {
    spectator.spectatorStatus = "idle";
    spectator.spectatorError  = null;
  }
  saveSpectator();
  broadcastSpectatorState();
  res.json(spectator);
});

router.post("/spectator/config", (req, res) => {
  const { teamBlueName, teamBlueLogo, teamRedName, teamRedLogo, roundLabel } = req.body;
  spectator.match = {
    teamBlueName: String(teamBlueName || "").trim(),
    teamBlueLogo: String(teamBlueLogo || "").trim(),
    teamRedName:  String(teamRedName || "").trim(),
    teamRedLogo:  String(teamRedLogo || "").trim(),
    roundLabel:   String(roundLabel || "").trim(),
  };
  saveSpectator();
  broadcastSpectatorState();
  res.json(spectator);
});

// Route de developpement uniquement (pas de bouton dans l'admin, meme logique
// que /riot/test/* conservees mais retirees de l'UI) : permet de rejouer le
// pipeline de traitement avec un payload allgamedata fourni a la main, pour
// iterer sur le visuel de l'overlay sans avoir besoin du client League.
router.post("/spectator/test/inject", (req, res) => {
  try {
    applyLiveClientData(req.body);
    spectator.spectatorStatus = "live";
    spectator.spectatorError  = null;
    saveSpectator();
    broadcastSpectatorState();
    res.json(spectator);
  } catch (e) {
    res.status(400).json({ error: "Payload allgamedata invalide : " + e.message });
  }
});

module.exports = router;
