const { RIOT_API_KEY, RIOT_GAME_NAME, RIOT_TAG_LINE, RIOT_PLATFORM, RIOT_CONTINENT } = require("./config");
const { challenge, saveChallenge } = require("../store");

const DDRAGON_FALLBACK_VERSION = "14.23.1";

const APEX_LEAGUE_ENDPOINT = {
  CHALLENGER:  "challengerleagues",
  GRANDMASTER: "grandmasterleagues",
  MASTER:      "masterleagues",
};

async function riotFetch(url) {
  const r = await fetch(url, { headers: { "X-Riot-Token": RIOT_API_KEY } });
  if (!r.ok) {
    const err = new Error(`Riot API ${r.status} sur ${url}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// Resolu une fois (comme le PUUID) : compte Riot (PUUID + gameName/tagLine tels
// que renvoyes par Riot) puis icone de profil via summoner-v4.
async function resolveRiotAccountInfo() {
  const accountUrl = `https://${RIOT_CONTINENT}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(RIOT_GAME_NAME)}/${encodeURIComponent(RIOT_TAG_LINE)}`;
  const account     = await riotFetch(accountUrl);
  challenge.puuid       = account.puuid;
  challenge.displayName = { gameName: account.gameName, tagLine: account.tagLine };

  const summonerUrl = `https://${RIOT_PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${challenge.puuid}`;
  const summoner     = await riotFetch(summonerUrl);
  challenge.profileIconId = summoner.profileIconId ?? null;

  saveChallenge();
}

async function captureRiotBaselineMatchId() {
  if (!challenge.puuid) return null;
  const ids = await fetchRecentMatchIds(1);
  return ids[0] || null;
}

async function fetchRecentMatchIds(count) {
  if (!challenge.puuid) return [];
  const url = `https://${RIOT_CONTINENT}.api.riotgames.com/lol/match/v5/matches/by-puuid/${challenge.puuid}/ids?queue=420&start=0&count=${count}`;
  return riotFetch(url);
}

async function fetchMatchDetail(matchId) {
  return riotFetch(`https://${RIOT_CONTINENT}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
}

async function fetchLeagueEntries() {
  return riotFetch(`https://${RIOT_PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-puuid/${challenge.puuid}`);
}

// Position sur le ladder — uniquement expose par Riot pour les tiers apex
// (Master/Grandmaster/Challenger), via un endpoint dedie qui liste toute la ligue.
async function fetchLadderRank(tier) {
  const endpoint = APEX_LEAGUE_ENDPOINT[tier];
  if (!endpoint) return null;
  const url    = `https://${RIOT_PLATFORM}.api.riotgames.com/lol/league/v4/${endpoint}/by-queue/RANKED_SOLO_5x5`;
  const league = await riotFetch(url);
  const sorted = (league.entries || []).slice().sort((a, b) => b.leaguePoints - a.leaguePoints);
  const index  = sorted.findIndex((e) => e.puuid === challenge.puuid);
  return index === -1 ? null : index + 1;
}

async function fetchDdragonVersion() {
  try {
    const versions = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) => r.json());
    return versions[0] || DDRAGON_FALLBACK_VERSION;
  } catch (e) {
    console.error("[Riot] Impossible de recuperer la version Data Dragon, utilisation du fallback :", e.message);
    return DDRAGON_FALLBACK_VERSION;
  }
}

module.exports = {
  riotFetch,
  resolveRiotAccountInfo,
  captureRiotBaselineMatchId,
  fetchRecentMatchIds,
  fetchMatchDetail,
  fetchLeagueEntries,
  fetchLadderRank,
  fetchDdragonVersion,
};
