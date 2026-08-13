const RIOT_API_KEY   = process.env.RIOT_API_KEY   || "";
const RIOT_GAME_NAME  = process.env.RIOT_GAME_NAME || "";
const RIOT_TAG_LINE   = process.env.RIOT_TAG_LINE  || "";
const RIOT_PLATFORM   = (process.env.RIOT_PLATFORM || "").toLowerCase();

const RIOT_CONTINENT_BY_PLATFORM = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas", oc1: "americas",
  euw1: "europe",  eun1: "europe",  tr1: "europe",    ru: "europe",
  kr: "asia",      jp1: "asia",
};
const RIOT_CONTINENT  = RIOT_CONTINENT_BY_PLATFORM[RIOT_PLATFORM] || null;
const RIOT_CONFIGURED = !!(RIOT_API_KEY && RIOT_GAME_NAME && RIOT_TAG_LINE && RIOT_CONTINENT);

module.exports = {
  RIOT_API_KEY, RIOT_GAME_NAME, RIOT_TAG_LINE, RIOT_PLATFORM,
  RIOT_CONTINENT_BY_PLATFORM, RIOT_CONTINENT, RIOT_CONFIGURED,
};
