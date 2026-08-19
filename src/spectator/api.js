const https = require("https");
const { SPECTATOR_LCU_URL } = require("./config");

// Certificat auto-signe sur 127.0.0.1:2999 - un Agent dedie a ce seul module
// desactive la verif TLS uniquement pour cet appel, sans affaiblir les vrais
// appels HTTPS vers Riot/Twitch ailleurs dans l'app.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function fetchLiveClientData() {
  return new Promise((resolve, reject) => {
    const req = https.get(SPECTATOR_LCU_URL, { agent: insecureAgent }, (res) => {
      if (res.statusCode !== 200) {
        const err = new Error(`Live Client Data API ${res.statusCode}`);
        err.status = res.statusCode;
        res.resume();
        reject(err);
        return;
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
  });
}

module.exports = { fetchLiveClientData };
