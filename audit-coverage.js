// One-shot audit: find airports NOT in our list that would be the most valuable
// to add — ranked by how many OpenFlights direct routes touch them.
// Usage: node audit-coverage.js
import { readFileSync } from "node:fs";
import { AIRPORTS } from "./airports.js";

const inList = new Set(AIRPORTS.map(a => a.iata));

// Pull friendly names from airports.dat so we can label the output.
// Format: id, name, city, country, iata, icao, lat, lon, ...
const airportsRaw = readFileSync("/tmp/airports.dat", "utf8");
const meta = new Map();
for (const line of airportsRaw.split("\n")) {
  if (!line.trim()) continue;
  // CSV with quoted strings; simple parse is OK for IATA / city / country fields.
  const m = line.match(/^(\d+),"([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
  if (!m) continue;
  const [, , name, city, country, iata] = m;
  if (iata && iata.length === 3 && iata !== "\\N") {
    meta.set(iata, { name, city, country });
  }
}

// Tally how many direct routes touch each non-listed airport.
const routesRaw = readFileSync("/tmp/routes.dat", "utf8");
const touchCount = new Map();
const touchesListed = new Map(); // routes from THIS airport to an airport that IS in our list

for (const line of routesRaw.split("\n")) {
  if (!line.trim()) continue;
  const cols = line.split(",");
  if (cols[7] !== "0") continue;
  const src = cols[2], dst = cols[4];
  for (const [endpoint, other] of [[src, dst], [dst, src]]) {
    if (inList.has(endpoint)) continue;
    touchCount.set(endpoint, (touchCount.get(endpoint) || 0) + 1);
    if (inList.has(other)) {
      touchesListed.set(endpoint, (touchesListed.get(endpoint) || 0) + 1);
    }
  }
}

const ranked = [...touchCount.entries()]
  .map(([iata, total]) => ({
    iata,
    total,
    toListed: touchesListed.get(iata) || 0,
    ...(meta.get(iata) || { city: "?", country: "?" })
  }))
  // Rank by routes to airports we already track — those are the ones that would
  // actually unlock new connecting options for our existing candidate cities.
  .sort((a, b) => b.toListed - a.toListed);

console.log(`Airports in our list: ${inList.size}`);
console.log(`Distinct non-listed airports touched by direct routes: ${touchCount.size}`);
console.log("\nTop 30 missing airports, ranked by direct routes to airports we DO track:\n");
console.log("IATA  ToListed  Total  City, Country");
console.log("----  --------  -----  -------------");
for (const r of ranked.slice(0, 30)) {
  console.log(`${r.iata.padEnd(4)}  ${String(r.toListed).padStart(8)}  ${String(r.total).padStart(5)}  ${r.city}, ${r.country}`);
}
