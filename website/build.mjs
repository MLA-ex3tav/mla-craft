import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("./", import.meta.url);
mkdirSync(new URL("dist/", root), { recursive: true });
for (const entry of ["index.html", "assets"]) {
  cpSync(new URL(entry, root), new URL(`dist/${entry}`, root), { recursive: true });
}
console.log(`Sitio estático preparado en ${fileURLToPath(new URL("dist/", root))}`);
