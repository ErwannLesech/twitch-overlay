const readline = require("readline");

let keepingOpen = false;

function crashAndWait(title, err) {
  console.error("\n========================================");
  console.error(`  ${title}`);
  console.error("========================================");
  console.error(err?.stack ?? err);
  console.error("\nCopiez ce message et transmettez-le a votre contact technique.");
  if (keepingOpen) return;
  keepingOpen = true;
  console.error("\nAppuyez sur Entree pour fermer cette fenetre...");
  try {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", () => { rl.close(); process.exit(1); });
  } catch {
    process.exit(1);
  }
}

process.on("uncaughtException",  (err) => crashAndWait("Erreur inattendue", err));
process.on("unhandledRejection", (err) => crashAndWait("Erreur inattendue (promesse)", err));

module.exports = { crashAndWait };
