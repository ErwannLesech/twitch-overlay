const express = require("express");
const { RIOT_CONFIGURED, RIOT_GAME_NAME, RIOT_TAG_LINE } = require("./config");
const { rankValue } = require("./rank");
const { resolveRiotAccountInfo, captureRiotBaselineMatchId } = require("./api");
const { challenge, saveChallenge } = require("../store");
const { broadcast, broadcastRiotState } = require("../ws");

const router = express.Router();

router.get("/riot/state", (req, res) => {
  res.json({
    wins:               challenge.wins,
    losses:             challenge.losses,
    sessionWins:        challenge.sessionWins,
    sessionLosses:      challenge.sessionLosses,
    currentRank:        challenge.currentRank,
    milestones:         challenge.milestones,
    riotStatus:         challenge.riotStatus,
    riotError:          challenge.riotError,
    challengeStartedAt: challenge.challengeStartedAt,
    riotConfigured:     RIOT_CONFIGURED,
    riotAccount:        RIOT_CONFIGURED ? `${RIOT_GAME_NAME}#${RIOT_TAG_LINE}` : null,
    profileIconId:      challenge.profileIconId,
    displayName:        challenge.displayName,
    ddragonVersion:     challenge.ddragonVersion,
    recentMatches:      challenge.recentMatches,
    ladderRank:         challenge.ladderRank,
  });
});

router.post("/riot/start", async (req, res) => {
  if (!RIOT_CONFIGURED) {
    return res.status(400).json({ error: "Riot non configure - completez le fichier .env (voir .env.example)." });
  }
  try {
    if (!challenge.puuid) await resolveRiotAccountInfo();
    challenge.wins               = 0;
    challenge.losses             = 0;
    challenge.sessionWins        = 0;
    challenge.sessionLosses      = 0;
    challenge.lastMatchId        = await captureRiotBaselineMatchId();
    challenge.challengeStartedAt = Date.now();
    challenge.milestones.forEach((m) => { m.reachedAt = null; });
    saveChallenge();
    broadcastRiotState();
    res.json(challenge);
  } catch (e) {
    console.error("Erreur lors du demarrage du challenge :", e.message);
    res.status(500).json({ error: "Impossible de contacter l'API Riot pour demarrer le challenge." });
  }
});

router.post("/riot/reset-session", (req, res) => {
  challenge.sessionWins   = 0;
  challenge.sessionLosses = 0;
  saveChallenge();
  broadcastRiotState();
  res.json(challenge);
});

router.post("/riot/adjust", (req, res) => {
  const { wins, losses } = req.body;
  if (Number.isInteger(wins))   challenge.wins   = Math.max(0, challenge.wins + wins);
  if (Number.isInteger(losses)) challenge.losses = Math.max(0, challenge.losses + losses);
  saveChallenge();
  broadcastRiotState();
  res.json(challenge);
});

router.post("/riot/milestones", (req, res) => {
  const { milestones } = req.body;
  if (Array.isArray(milestones)) {
    challenge.milestones = milestones
      .filter((m) => m && m.tier)
      .map((m, i) => ({
        id:        m.id || `${Date.now()}-${i}`,
        label:     String(m.label || "").trim(),
        tier:      String(m.tier).toUpperCase(),
        division:  m.division ? String(m.division).toUpperCase() : null,
        lp:        Number(m.lp) || 0,
        reachedAt: m.reachedAt || null,
      }))
      .sort((a, b) => rankValue(a.tier, a.division, a.lp) - rankValue(b.tier, b.division, b.lp));
    saveChallenge();
    broadcastRiotState();
  }
  res.json(challenge);
});

router.post("/riot/test/match", (req, res) => {
  const win = req.body.result === "win";
  if (win) { challenge.wins += 1; challenge.sessionWins += 1; }
  else     { challenge.losses += 1; challenge.sessionLosses += 1; }
  broadcast({ type: "riotMatch", result: win ? "win" : "loss" });
  saveChallenge();
  broadcastRiotState();
  res.json(challenge);
});

router.post("/riot/test/milestone", (req, res) => {
  const milestone = challenge.milestones[0] || { label: "Palier test", tier: "DIAMOND", division: "IV", lp: 0 };
  broadcast({ type: "riotMilestone", milestone });
  res.json({ ok: true });
});

module.exports = router;
