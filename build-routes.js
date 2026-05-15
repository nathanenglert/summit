// One-shot build script: reads OpenFlights routes.dat from /tmp,
// filters to direct routes whose endpoints are both in our AIRPORTS list,
// and writes routes.js exporting a Set of "ORIG-DEST" strings (bidirectional).
//
// Run with: node build-routes.js
import { readFileSync, writeFileSync } from "node:fs";
import { AIRPORTS } from "./airports.js";

const iataSet = new Set(AIRPORTS.map(a => a.iata));

const raw = readFileSync("/tmp/routes.dat", "utf8");
const lines = raw.split("\n");

const pairs = new Set();
let kept = 0;
let totalDirect = 0;

for (const line of lines) {
  if (!line.trim()) continue;
  const cols = line.split(",");
  // Columns: airline, airline_id, source_iata, source_id, dest_iata, dest_id, codeshare, stops, equipment
  const src = cols[2];
  const dst = cols[4];
  const stops = cols[7];
  if (stops !== "0") continue;
  totalDirect++;
  if (!iataSet.has(src) || !iataSet.has(dst)) continue;
  // Store both directions — if airline X flies A->B, B->A almost always exists too.
  pairs.add(`${src}-${dst}`);
  pairs.add(`${dst}-${src}`);
  kept++;
}

const sorted = [...pairs].sort();

const out =
  `// Auto-generated from OpenFlights routes.dat. Do not edit by hand.\n` +
  `// Source: https://github.com/jpatokal/openflights\n` +
  `// ${sorted.length} directed pairs across ${iataSet.size} airports.\n` +
  `export const DIRECT_ROUTES = new Set(${JSON.stringify(sorted)});\n`;

writeFileSync("./routes.js", out);

console.log(`OpenFlights routes parsed: ${lines.length}`);
console.log(`Direct (stops=0): ${totalDirect}`);
console.log(`Kept (both endpoints in AIRPORTS): ${kept}`);
console.log(`Unique directed pairs written: ${sorted.length}`);
console.log(`Output: ./routes.js`);
