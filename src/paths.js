const path = require("path");

// When packaged with pkg, write persistent files next to the .exe (the virtual
// snapshot is read-only at runtime). PUBLIC_DIR always resolves from __dirname
// (this file's location, one level under the project root) since static assets
// are bundled into the pkg snapshot.
const BASE_DIR       = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, "..");
const CONFIG_FILE    = path.join(BASE_DIR, "config.json");
const TOKENS_FILE    = path.join(BASE_DIR, "tokens.json");
const STATE_FILE     = path.join(BASE_DIR, "state.json");
const CHALLENGE_FILE = path.join(BASE_DIR, "challenge.json");
const PUBLIC_DIR     = path.join(__dirname, "..", "public");
const PORT = 3000;

module.exports = { BASE_DIR, CONFIG_FILE, TOKENS_FILE, STATE_FILE, CHALLENGE_FILE, PUBLIC_DIR, PORT };
