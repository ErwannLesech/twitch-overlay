const { RIOT_CONFIGURED } = require("./config");
const { RIOT_APEX_TIERS, rankValue } = require("./rank");
const {
  resolveRiotAccountInfo, captureRiotBaselineMatchId, fetchRecentMatchIds,
  fetchMatchDetail, fetchLeagueEntries, fetchLadderRank, fetchDdragonVersion,
} = require("./api");
const { challenge, saveChallenge } = require("../store");
const { broadcast, broadcastRiotState } = require("../ws");

function matchToRecentEntry(match, me) {
  return {
    matchId:      match.metadata.matchId,
    win:          me.win,
    championId:   me.championId,
    championName: me.championName,
    kills:        me.kills,
    deaths:       me.deaths,
    assists:      me.assists,
    queueId:      match.info.queueId,
    endedAt:      match.info.gameEndTimestamp || (match.info.gameCreation + match.info.gameDuration * 1000),
  };
}

function isRemake(match, me) {
  return match.info.gameDuration < 300 || !!me?.gameEndedInEarlySurrender;
}

function pushRecentMatch(match, me) {
  challenge.recentMatches = [matchToRecentEntry(match, me), ...challenge.recentMatches].slice(0, 10);
}

// Sondage independant du compteur wins/losses (qui repart de zero a chaque
// /riot/start) : toujours les 10 dernieres games classees reellement jouees,
// pour l'historique affiche dans le widget.
async function backfillRecentMatches() {
  const ids     = await fetchRecentMatchIds(10);
  const matches = [];
  for (const matchId of ids) {
    try {
      const match = await fetchMatchDetail(matchId);
      const me    = match.info.participants.find((p) => p.puuid === challenge.puuid);
      if (me && !isRemake(match, me)) matches.push(matchToRecentEntry(match, me));
    } catch (e) {
      console.error("[Riot] Erreur lors du backfill d'une game :", e.message);
    }
  }
  challenge.recentMatches = matches; // Riot renvoie les ids du plus recent au plus ancien
}

async function pollRiotChallenge() {
  if (!RIOT_CONFIGURED) return;
  try {
    if (!challenge.puuid || !challenge.profileIconId) await resolveRiotAccountInfo();

    // Rang classe Solo/Duo actuel + detection des paliers franchis.
    const entries = await fetchLeagueEntries();
    const solo    = entries.find((e) => e.queueType === "RANKED_SOLO_5x5");
    if (solo) {
      challenge.currentRank = { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints };
      const value = rankValue(solo.tier, solo.rank, solo.leaguePoints);
      for (const m of challenge.milestones) {
        if (!m.reachedAt && value >= rankValue(m.tier, m.division, m.lp)) {
          m.reachedAt = Date.now();
          broadcast({ type: "riotMilestone", milestone: m });
        }
      }
      challenge.ladderRank = RIOT_APEX_TIERS.has(solo.tier) ? await fetchLadderRank(solo.tier) : null;
    }

    if (challenge.recentMatches.length === 0) await backfillRecentMatches();

    // Nouvelles parties classees Solo/Duo terminees depuis le dernier sondage.
    const ids = await fetchRecentMatchIds(20);

    if (challenge.lastMatchId === null) {
      // Premier sondage : on memorise la partie la plus recente comme point de depart,
      // sans compter retroactivement les parties jouees avant le lancement de l'appli.
      challenge.lastMatchId = ids[0] || null;
    } else {
      const knownIndex = ids.indexOf(challenge.lastMatchId);
      const newIds      = (knownIndex === -1 ? ids : ids.slice(0, knownIndex)).slice().reverse(); // du plus ancien au plus recent

      for (const matchId of newIds) {
        const match = await fetchMatchDetail(matchId);
        const me    = match.info.participants.find((p) => p.puuid === challenge.puuid);
        if (me && !isRemake(match, me)) {
          if (me.win) { challenge.wins += 1; challenge.sessionWins += 1; }
          else        { challenge.losses += 1; challenge.sessionLosses += 1; }
          pushRecentMatch(match, me);
          broadcast({ type: "riotMatch", result: me.win ? "win" : "loss", championName: me.championName });
        }
        challenge.lastMatchId = matchId;
      }
    }

    challenge.riotStatus = "ok";
    challenge.riotError  = null;
    saveChallenge();
    broadcastRiotState();
  } catch (e) {
    challenge.riotStatus = "error";
    challenge.riotError  = (e.status === 401 || e.status === 403)
      ? "Cle Riot invalide ou expiree - regenerez-la sur le portail Riot et mettez a jour le fichier .env"
      : "Impossible de contacter l'API Riot - nouvelle tentative dans 60s";
    console.error("[Riot]", challenge.riotError, "-", e.message);
    saveChallenge();
    broadcastRiotState();
  }
}

function startRiotChallenge() {
  if (!RIOT_CONFIGURED) {
    challenge.riotStatus = "unconfigured";
    saveChallenge();
    return;
  }
  challenge.riotStatus = "connecting";

  fetchDdragonVersion().then((version) => {
    challenge.ddragonVersion = version;
    saveChallenge();
    broadcastRiotState();
  });

  pollRiotChallenge();
  setInterval(pollRiotChallenge, 60000);
}

module.exports = { pollRiotChallenge, startRiotChallenge };
