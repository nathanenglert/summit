import { AIRPORTS, CITY_ALIASES } from "./airports.js";
import { DIRECT_ROUTES } from "./routes.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
// Kick off the fetch immediately but don't block module init on it —
// event listeners must be attachable before the network round-trip finishes.
const COUNTRIES_READY = fetch(WORLD_URL)
  .then(r => r.json())
  .then(world => topojson.feature(world, world.objects.countries));

const EARTH_RADIUS_KM = 6371;
const KM_TO_MI = 0.621371;
const CRUISE_KMH = 850;            // Avg cruise speed for jets
const TAXI_HOURS = 1.5;            // Total ground/airport overhead (start + end)
const LAYOVER_HOURS = 2.0;         // Time at each intermediate hub between flights
const FAIRNESS_WEIGHT = 0.35;      // Weight on worst-traveler time in final score

function hasDirectRoute(a, b) {
  if (a === b) return true;
  return DIRECT_ROUTES.has(`${a}-${b}`);
}

const AIRPORT_BY_IATA = new Map(AIRPORTS.map(a => [a.iata, a]));

// Sample N+1 points along the great-circle geodesic from a to b so d3.geoPath
// renders a curved arc rather than a straight line in projected space.
function geodesicCoords([lon1, lat1], [lon2, lat2], n = 96) {
  const interp = d3.geoInterpolate([lon1, lat1], [lon2, lat2]);
  return Array.from({ length: n + 1 }, (_, i) => interp(i / n));
}

async function renderMap(container, result) {
  container.innerHTML = `<div class="h-[360px] flex items-center justify-center text-sm text-slate-400">Loading map…</div>`;
  const countries = await COUNTRIES_READY;
  container.innerHTML = "";
  const width = container.clientWidth || 800;
  const height = Math.max(360, Math.min(520, Math.round(width * 0.55)));

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "w-full h-auto rounded-lg border border-slate-200 bg-sky-50");

  const projection = d3.geoEqualEarth().fitSize([width - 20, height - 20], countries);
  const path = d3.geoPath(projection);

  svg.append("g").selectAll("path")
    .data(countries.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#e2e8f0")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 0.6);

  const dest = result.candidate;

  // Arcs first so markers draw on top. Each path may have 2+ legs; draw each leg
  // as its own great-circle arc so connecting flights kink at the hub like reality.
  for (const m of result.perMember) {
    if (!m.path || m.path.length < 2) continue;
    for (let i = 0; i < m.path.length - 1; i++) {
      const a = AIRPORT_BY_IATA.get(m.path[i]);
      const b = AIRPORT_BY_IATA.get(m.path[i + 1]);
      if (!a || !b) continue;
      const arc = {
        type: "LineString",
        coordinates: geodesicCoords([a.lon, a.lat], [b.lon, b.lat])
      };
      svg.append("path")
        .datum(arc)
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", m.direct ? "#10b981" : "#f59e0b")
        .attr("stroke-width", 1.6)
        .attr("stroke-dasharray", m.direct ? null : "5,4")
        .attr("opacity", 0.85);
    }
  }

  // Intermediate hub markers (smaller than origin/summit, labeled with IATA code).
  // Dedup across travelers — multiple people may transit the same hub.
  const hubsSeen = new Set();
  for (const m of result.perMember) {
    if (!m.path || m.path.length < 3) continue;
    for (let i = 1; i < m.path.length - 1; i++) {
      const hub = AIRPORT_BY_IATA.get(m.path[i]);
      if (!hub || hubsSeen.has(hub.iata)) continue;
      hubsSeen.add(hub.iata);
      const [hx, hy] = projection([hub.lon, hub.lat]);
      const hg = svg.append("g");
      hg.append("circle")
        .attr("cx", hx).attr("cy", hy).attr("r", 3.5)
        .attr("fill", "#f59e0b").attr("stroke", "white").attr("stroke-width", 1.5);
      hg.append("text")
        .attr("x", hx + 6).attr("y", hy + 4)
        .attr("font-size", 10).attr("font-weight", 600).attr("fill", "#92400e")
        .attr("paint-order", "stroke").attr("stroke", "white").attr("stroke-width", 2.5)
        .text(hub.iata);
    }
  }

  // Origin markers
  for (const m of result.perMember) {
    const origin = AIRPORT_BY_IATA.get(m.fromIata);
    if (!origin || origin.iata === dest.iata) continue;
    const [x, y] = projection([origin.lon, origin.lat]);
    const g = svg.append("g");
    g.append("circle")
      .attr("cx", x).attr("cy", y).attr("r", 4)
      .attr("fill", "#4f46e5").attr("stroke", "white").attr("stroke-width", 1.5);
    g.append("text")
      .attr("x", x + 7).attr("y", y - 5)
      .attr("font-size", 11).attr("font-weight", 600).attr("fill", "#1e293b")
      .attr("paint-order", "stroke").attr("stroke", "white").attr("stroke-width", 3)
      .text(m.name);
  }

  // Summit marker
  const [dx, dy] = projection([dest.lon, dest.lat]);
  const g = svg.append("g");
  g.append("circle")
    .attr("cx", dx).attr("cy", dy).attr("r", 7)
    .attr("fill", "#dc2626").attr("stroke", "white").attr("stroke-width", 2);
  g.append("text")
    .attr("x", dx + 10).attr("y", dy - 7)
    .attr("font-size", 13).attr("font-weight", 700).attr("fill", "#7f1d1d")
    .attr("paint-order", "stroke").attr("stroke", "white").attr("stroke-width", 3)
    .text(`${dest.city} (${dest.iata})`);
}

function toRad(deg) { return deg * Math.PI / 180; }

function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function normalize(s) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

// Resolve free-text city to an airport entry.
// Tries: alias table -> exact city-name match -> IATA code match.
function resolveCity(input) {
  const n = normalize(input);
  if (!n) return null;
  if (CITY_ALIASES[n]) return AIRPORTS.find(a => a.iata === CITY_ALIASES[n]);
  const cityMatch = AIRPORTS.find(a => normalize(a.city) === n);
  if (cityMatch) return cityMatch;
  const iataMatch = AIRPORTS.find(a => a.iata.toLowerCase() === n);
  if (iataMatch) return iataMatch;
  // Last resort: substring on city or "city, country"
  const partial = AIRPORTS.find(a =>
    normalize(a.city).includes(n) || normalize(`${a.city}, ${a.country}`).includes(n)
  );
  return partial || null;
}

// Find the best route from origin to dest:
// - direct if one exists in OpenFlights data
// - else cheapest 1-stop via any hub that has direct service to both endpoints
// - else cheapest 2-stop via any pair of hubs
// - else fall back to a straight-line approximation flagged as estimated
// Returns { path: [iata...], hours, km, direct, estimated }.
function bestPath(origin, dest) {
  if (origin.iata === dest.iata) {
    return { path: [origin.iata], hours: 0, km: 0, direct: true, estimated: false };
  }
  if (hasDirectRoute(origin.iata, dest.iata)) {
    const km = haversineKm(origin, dest);
    return {
      path: [origin.iata, dest.iata],
      hours: TAXI_HOURS + km / CRUISE_KMH,
      km,
      direct: true,
      estimated: false
    };
  }
  let best = null;
  // 1-stop search
  for (const hub of AIRPORTS) {
    if (hub.iata === origin.iata || hub.iata === dest.iata) continue;
    if (!hasDirectRoute(origin.iata, hub.iata)) continue;
    if (!hasDirectRoute(hub.iata, dest.iata)) continue;
    const km1 = haversineKm(origin, hub);
    const km2 = haversineKm(hub, dest);
    const hours = TAXI_HOURS + (km1 + km2) / CRUISE_KMH + LAYOVER_HOURS;
    if (!best || hours < best.hours) {
      best = {
        path: [origin.iata, hub.iata, dest.iata],
        hours,
        km: km1 + km2,
        direct: false,
        estimated: false
      };
    }
  }
  if (best) return best;
  // 2-stop search — only the airports with a direct from origin can be hub1.
  const fromOrigin = AIRPORTS.filter(h =>
    h.iata !== origin.iata && h.iata !== dest.iata && hasDirectRoute(origin.iata, h.iata)
  );
  const toDest = AIRPORTS.filter(h =>
    h.iata !== origin.iata && h.iata !== dest.iata && hasDirectRoute(h.iata, dest.iata)
  );
  for (const h1 of fromOrigin) {
    for (const h2 of toDest) {
      if (h1.iata === h2.iata) continue;
      if (!hasDirectRoute(h1.iata, h2.iata)) continue;
      const km1 = haversineKm(origin, h1);
      const km2 = haversineKm(h1, h2);
      const km3 = haversineKm(h2, dest);
      const hours = TAXI_HOURS + (km1 + km2 + km3) / CRUISE_KMH + 2 * LAYOVER_HOURS;
      if (!best || hours < best.hours) {
        best = {
          path: [origin.iata, h1.iata, h2.iata, dest.iata],
          hours,
          km: km1 + km2 + km3,
          direct: false,
          estimated: false
        };
      }
    }
  }
  if (best) return best;
  // No route in our data at all — emit a flagged estimate so the city is still rankable.
  const km = haversineKm(origin, dest);
  return {
    path: [origin.iata, dest.iata],
    hours: TAXI_HOURS + km / CRUISE_KMH + 2 * LAYOVER_HOURS,
    km,
    direct: false,
    estimated: true
  };
}

function scoreCandidate(team, candidate) {
  let total = 0;
  let max = 0;
  let directCount = 0;
  const perMember = team.map(o => {
    const route = bestPath(o.airport, candidate);
    if (route.direct) directCount++;
    total += route.hours;
    if (route.hours > max) max = route.hours;
    return {
      name: o.name,
      fromIata: o.airport.iata,
      fromCity: o.airport.city,
      km: route.km,
      hours: route.hours,
      direct: route.direct,
      path: route.path,
      estimated: route.estimated
    };
  });
  const avg = total / team.length;
  const score = avg + FAIRNESS_WEIGHT * max;
  return { candidate, perMember, avg, max, total, directCount, score };
}

function rankSummitCities(team) {
  // Score every airport in the database as a candidate summit city.
  const candidates = AIRPORTS.map(candidate => scoreCandidate(team, candidate));

  // Collapse multi-airport metros (e.g. JFK + EWR -> show only the best for that city/country).
  const byCity = new Map();
  for (const c of candidates) {
    const key = `${c.candidate.city}|${c.candidate.country}`;
    const existing = byCity.get(key);
    if (!existing || c.score < existing.score) byCity.set(key, c);
  }

  return [...byCity.values()].sort((a, b) => a.score - b.score);
}

// --- UI wiring ---

const teamList = document.getElementById("team-list");
const addBtn = document.getElementById("add-member");
const computeBtn = document.getElementById("compute");
const resultsSection = document.getElementById("results");
const errorBox = document.getElementById("error");
const sampleBtn = document.getElementById("load-sample");
const clearBtn = document.getElementById("clear-all");

function makeMemberRow(name = "", city = "") {
  const row = document.createElement("div");
  row.className = "flex gap-2 items-center";
  row.innerHTML = `
    <input type="text" placeholder="Name" value="${escapeHtml(name)}"
           class="member-name flex-1 rounded-md border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
    <input type="text" placeholder="City (e.g. Seattle, London, Tokyo)" value="${escapeHtml(city)}"
           class="member-city flex-[2] rounded-md border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
    <button class="remove-row text-slate-400 hover:text-red-500 px-2 py-1 text-xl leading-none" title="Remove">&times;</button>
  `;
  row.querySelector(".remove-row").addEventListener("click", () => {
    row.remove();
    if (teamList.children.length === 0) makeMemberRow();
  });
  teamList.appendChild(row);
  return row;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function readTeam() {
  const rows = [...teamList.querySelectorAll(".member-city")];
  const team = [];
  const unresolved = [];
  rows.forEach((cityEl, i) => {
    const nameEl = teamList.querySelectorAll(".member-name")[i];
    const name = nameEl.value.trim() || `Member ${i + 1}`;
    const cityRaw = cityEl.value.trim();
    if (!cityRaw) return;
    const airport = resolveCity(cityRaw);
    if (!airport) {
      unresolved.push(cityRaw);
      return;
    }
    team.push({ name, cityInput: cityRaw, airport });
  });
  return { team, unresolved };
}

function formatHours(h) {
  if (h <= 0) return "—";
  let totalMinutes = Math.round(h * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
}

function formatRouting(m) {
  if (!m.path || m.path.length < 2) {
    return '<span class="text-slate-400">—</span>';
  }
  if (m.direct) {
    return '<span class="text-emerald-700 font-medium">Direct</span>';
  }
  if (m.estimated) {
    return '<span class="text-slate-500 italic" title="No 1- or 2-stop itinerary in our data — distance shown is a straight-line estimate">No itinerary in data</span>';
  }
  const stops = m.path.slice(1, -1);
  const arrow = ' <span class="text-slate-400">→</span> ';
  return `<span class="text-amber-700">${stops.length} stop · via ${stops.join(arrow)}</span>`;
}

function renderResults(ranked, team) {
  resultsSection.innerHTML = "";
  if (!ranked.length) return;

  const top = ranked.slice(0, 10);

  const header = document.createElement("div");
  header.className = "mb-4 flex items-baseline justify-between";
  header.innerHTML = `
    <h2 class="text-2xl font-semibold text-slate-900">Top summit cities</h2>
    <span class="text-sm text-slate-500">${team.length} traveler${team.length === 1 ? "" : "s"}</span>
  `;
  resultsSection.appendChild(header);

  const podium = document.createElement("div");
  podium.className = "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6";
  top.slice(0, 3).forEach((r, i) => {
    const card = document.createElement("div");
    const rankColors = ["bg-amber-100 border-amber-300", "bg-slate-100 border-slate-300", "bg-orange-100 border-orange-300"];
    card.className = `rounded-xl border-2 p-5 ${rankColors[i]}`;
    card.innerHTML = `
      <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">
        <span>#${i + 1}</span>
        <span>${r.candidate.iata}</span>
      </div>
      <div class="text-2xl font-bold text-slate-900">${escapeHtml(r.candidate.city)}</div>
      <div class="text-sm text-slate-600 mb-3">${escapeHtml(r.candidate.country)}</div>
      <dl class="text-sm space-y-1">
        <div class="flex justify-between"><dt class="text-slate-500">Avg travel</dt><dd class="font-medium">${formatHours(r.avg)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Longest trip</dt><dd class="font-medium">${formatHours(r.max)}</dd></div>
        <div class="flex justify-between"><dt class="text-slate-500">Direct flights</dt><dd class="font-medium">${r.directCount}/${team.length}</dd></div>
      </dl>
    `;
    podium.appendChild(card);
  });
  resultsSection.appendChild(podium);

  // Full ranking table
  const tableWrap = document.createElement("div");
  tableWrap.className = "overflow-x-auto rounded-lg border border-slate-200 bg-white";
  tableWrap.innerHTML = `
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
        <tr>
          <th class="px-4 py-2 text-left">#</th>
          <th class="px-4 py-2 text-left">City</th>
          <th class="px-4 py-2 text-left">Airport</th>
          <th class="px-4 py-2 text-right">Avg time</th>
          <th class="px-4 py-2 text-right">Worst</th>
          <th class="px-4 py-2 text-right">Direct</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        ${top.map((r, i) => `
          <tr class="hover:bg-indigo-50/40 cursor-pointer" data-idx="${i}">
            <td class="px-4 py-2 text-slate-500">${i + 1}</td>
            <td class="px-4 py-2 font-medium text-slate-900">${escapeHtml(r.candidate.city)}<span class="text-slate-400 font-normal">, ${escapeHtml(r.candidate.country)}</span></td>
            <td class="px-4 py-2 text-slate-600">${r.candidate.iata}</td>
            <td class="px-4 py-2 text-right">${formatHours(r.avg)}</td>
            <td class="px-4 py-2 text-right">${formatHours(r.max)}</td>
            <td class="px-4 py-2 text-right">${r.directCount}/${team.length}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  resultsSection.appendChild(tableWrap);

  // "Score any city" picker — lets the user evaluate a destination not in the top 10.
  const picker = document.createElement("div");
  picker.className = "mt-6 rounded-lg border border-slate-200 bg-white p-4";
  picker.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-end gap-3">
      <div class="flex-1">
        <label for="custom-city" class="block text-sm font-medium text-slate-700 mb-1">Score a specific city</label>
        <p class="text-xs text-slate-500 mb-2">See what the breakdown looks like for any destination — not just the top 10.</p>
        <input id="custom-city" type="text" placeholder="e.g. Mexico City, Reykjavik, Bali"
               class="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
      </div>
      <button id="custom-submit"
              class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-lg shadow-sm whitespace-nowrap">
        Show paths
      </button>
    </div>
    <div id="custom-error" class="hidden mt-2 text-sm text-red-700"></div>
  `;
  resultsSection.appendChild(picker);

  // Per-member breakdown for #1
  const detailWrap = document.createElement("div");
  detailWrap.id = "detail";
  detailWrap.className = "mt-6";
  resultsSection.appendChild(detailWrap);
  renderDetail(top[0], 0);

  tableWrap.querySelectorAll("tbody tr").forEach(tr => {
    tr.addEventListener("click", () => {
      const idx = Number(tr.dataset.idx);
      renderDetail(top[idx], idx);
    });
  });

  const customInput = picker.querySelector("#custom-city");
  const customSubmit = picker.querySelector("#custom-submit");
  const customError = picker.querySelector("#custom-error");

  function tryCustom() {
    customError.classList.add("hidden");
    customError.textContent = "";
    const raw = customInput.value.trim();
    if (!raw) {
      customError.textContent = "Enter a city to evaluate.";
      customError.classList.remove("hidden");
      return;
    }
    const airport = resolveCity(raw);
    if (!airport) {
      customError.textContent = `Couldn't find "${raw}". Try a nearby major city or an IATA code.`;
      customError.classList.remove("hidden");
      return;
    }
    const result = scoreCandidate(team, airport);
    const rankIdx = ranked.findIndex(r => r.candidate.iata === airport.iata);
    renderDetail(result, rankIdx);
    document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  customSubmit.addEventListener("click", tryCustom);
  customInput.addEventListener("keydown", e => {
    if (e.key === "Enter") tryCustom();
  });
}

function renderDetail(result, rank) {
  const wrap = document.getElementById("detail");
  if (!wrap || !result) return;
  const heading = rank != null && rank >= 0
    ? `Travel paths — #${rank + 1} ${escapeHtml(result.candidate.city)} (${result.candidate.iata})`
    : `Travel paths — ${escapeHtml(result.candidate.city)} (${result.candidate.iata})
       <span class="text-sm font-normal text-slate-500">— outside top 10</span>`;
  wrap.innerHTML = `
    <h3 class="text-lg font-semibold text-slate-900 mb-3">${heading}</h3>
    <div class="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
      <span><span class="text-slate-500">Avg travel:</span> <span class="font-medium text-slate-900">${formatHours(result.avg)}</span></span>
      <span><span class="text-slate-500">Longest trip:</span> <span class="font-medium text-slate-900">${formatHours(result.max)}</span></span>
      <span><span class="text-slate-500">Direct flights:</span> <span class="font-medium text-slate-900">${result.directCount}/${result.perMember.length}</span></span>
    </div>
    <div id="map" class="mb-2"></div>
    <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 mb-5">
      <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded-full bg-red-600 ring-2 ring-white"></span>Summit city</span>
      <span class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-indigo-600 ring-2 ring-white"></span>Origin</span>
      <span class="flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#10b981" stroke-width="2"/></svg>Direct flight</span>
      <span class="flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,3"/></svg>Connecting</span>
    </div>
    <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
          <tr>
            <th class="px-4 py-2 text-left">Traveler</th>
            <th class="px-4 py-2 text-left">From</th>
            <th class="px-4 py-2 text-left">Routing</th>
            <th class="px-4 py-2 text-right">Distance</th>
            <th class="px-4 py-2 text-right">Est. door-to-door</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${result.perMember.map(m => `
            <tr>
              <td class="px-4 py-2 font-medium text-slate-900">${escapeHtml(m.name)}</td>
              <td class="px-4 py-2 text-slate-600">${escapeHtml(m.fromCity)} (${m.fromIata})</td>
              <td class="px-4 py-2">${formatRouting(m)}</td>
              <td class="px-4 py-2 text-right text-slate-600">${Math.round(m.km * KM_TO_MI).toLocaleString()} mi</td>
              <td class="px-4 py-2 text-right">${formatHours(m.hours)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  renderMap(document.getElementById("map"), result);
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}

// --- Event wiring ---

addBtn.addEventListener("click", () => makeMemberRow());

clearBtn.addEventListener("click", () => {
  teamList.innerHTML = "";
  makeMemberRow();
  resultsSection.innerHTML = "";
  clearError();
});

async function loadSampleTeam() {
  // Prefer a local override (gitignored) so contributors can keep a private team
  // without modifying the committed default.
  try {
    const local = await import("./sample-team.local.js");
    if (local?.SAMPLE_TEAM) return local.SAMPLE_TEAM;
  } catch {
    // No local override present — fall through to the committed default.
  }
  const def = await import("./sample-team.js");
  return def.SAMPLE_TEAM;
}

sampleBtn.addEventListener("click", async () => {
  const sample = await loadSampleTeam();
  teamList.innerHTML = "";
  sample.forEach(([n, c]) => makeMemberRow(n, c));
  clearError();
});

computeBtn.addEventListener("click", () => {
  clearError();
  const { team, unresolved } = readTeam();
  if (unresolved.length) {
    showError(`Couldn't find these cities in the airport database: ${unresolved.join(", ")}. Try a nearby major city or IATA code.`);
    return;
  }
  if (team.length < 2) {
    showError("Add at least 2 team members to compute a summit city.");
    return;
  }
  const ranked = rankSummitCities(team);
  renderResults(ranked, team);
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

// Start with two blank rows
makeMemberRow();
makeMemberRow();
