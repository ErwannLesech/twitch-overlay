const RIOT_TIERS      = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const RIOT_DIVISIONS  = ["IV", "III", "II", "I"]; // non pertinent a partir de MASTER
const RIOT_APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

// Echelle monotone commune au rang courant et aux paliers, pour trier/positionner la barre LP.
function rankValue(tier, division, lp) {
  const t         = (tier || "").toUpperCase();
  const tierIndex = RIOT_TIERS.indexOf(t);
  if (tierIndex === -1) return 0;
  if (RIOT_APEX_TIERS.has(t)) return RIOT_TIERS.indexOf("MASTER") * 400 + (lp || 0);
  const divIndex = Math.max(0, RIOT_DIVISIONS.indexOf((division || "IV").toUpperCase()));
  return tierIndex * 400 + divIndex * 100 + (lp || 0);
}

module.exports = { RIOT_TIERS, RIOT_DIVISIONS, RIOT_APEX_TIERS, rankValue };
