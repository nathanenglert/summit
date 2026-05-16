# Summit

Pick the city that's easiest for your whole team to fly into.

Add everyone's home city — or upload a CSV — and Summit ranks every major hub
airport in the world by total team travel time, longest individual trip, and
direct-flight count. Click any candidate to see a world map of each traveler's
actual routing, with great-circle arcs through real OpenFlights connecting
hubs.

**[Try it live →](https://nathanenglert.github.io/summit/)**

## How it works

1. **Resolve each home city** to a major airport (free-text input + alias
   table covering ~300 spellings).
2. **Score every candidate destination** in `airports.js` (145 hubs):
   - For each traveler, find the best path: direct → 1-stop → 2-stop →
     estimate.
   - Total = airport overhead + flight time at cruise speed + 2h layover per
     connection.
3. **Rank by** average travel time plus a fairness term on the worst
   individual trip (so no single person gets stranded with a 24h itinerary
   while everyone else is fine).
4. **Render** the top 10 plus an interactive Equal Earth world map with
   per-leg great-circle arcs.

Direct-flight data comes from the
[OpenFlights routes dataset](https://github.com/jpatokal/openflights)
(~67k direct routes), filtered down to the pairs where both endpoints are
in the curated airport list.

## Tech stack

Pure static HTML/JS. No build step, no server, no API keys:

- Vanilla JavaScript ES modules
- [Tailwind CSS](https://tailwindcss.com/) via CDN for styling
- [D3](https://d3js.org/) + [TopoJSON](https://github.com/topojson/topojson)
  for the map
- [world-atlas](https://github.com/topojson/world-atlas) for country
  outlines
- [OpenFlights](https://github.com/jpatokal/openflights) for direct-route
  data

## Local development

```bash
npm run dev
# open http://localhost:8765
```

Or just open `index.html` through any static file server — ES modules need
HTTP, not the `file://` protocol.

### Loading your own team

Click **Upload CSV** in the form header and pick a file with `Name,City`
columns:

```csv
Name,City
Alice,Berlin
Bob,Toronto
```

Extra columns are ignored. The parser handles quoted fields, embedded
commas, and recognizes header rows that mention `name`, `city`, `location`,
or `home`. If no header is present, columns 1 and 2 are used.

Files matching `*.local.csv` are gitignored, so you can keep a personal
`team.local.csv` in the repo for quick re-loading without it showing up in
`git status`.

The **Load sample** button always loads the committed generic team from
`sample-team.js`.

### Regenerating routes.js

`routes.js` is committed so the site deploys without a build step. To
rebuild it from a fresh OpenFlights snapshot:

```bash
npm run fetch-data     # downloads routes.dat + airports.dat to /tmp
npm run build-routes   # regenerates routes.js
```

### Auditing airport coverage

To see which airports OpenFlights has that we don't yet include — ranked by
how many connections they'd unlock for the airports we already track:

```bash
npm run fetch-data   # if not already done
npm run audit
```

Use the output to decide whether to add new airports to `airports.js`, then
re-run `npm run build-routes` to pick up the new routes.

## Project layout

```
index.html              Site entry
app.js                  Main app: scoring, map, UI
airports.js             Curated hub airports + city aliases
routes.js               Direct-flight pairs (generated from OpenFlights)
sample-team.js          Default sample team
scripts/
  build-routes.js       Regenerate routes.js
  audit-coverage.js     Report missing-airport opportunities
```

## Limitations

Be aware of what Summit is and isn't:

- **OpenFlights data is a static snapshot from ~2014.** Newer routes
  (post-COVID launches, recent Gulf/Asian expansion, point-to-point
  startups) won't appear. Traditional long-haul pairs are very stable, so
  results are still useful for the top of the leaderboard.
- **Travel times are heuristic.** Great-circle distance + cruise speed +
  fixed overhead. Real itineraries have winds, holding patterns, terminal
  changes, immigration queues. Treat the numbers as comparative, not
  predictive.
- **Direct-flight check is binary**, not informed by frequency, seat
  availability, time of day, or price. A route flown once a week shows
  identically to one flown four times daily.
- **The 1- and 2-stop search picks the geographically shortest path** with
  valid OpenFlights connections, not the cheapest or most common. Real
  travelers might prefer different routes for hub-loyalty, visa, or
  schedule reasons.
- **No live data, no booking links.** Summit is a *which city should we
  meet in* tool, not a *book my trip* tool.

## Deploying to GitHub Pages

The repo is configured to serve as-is — no Actions workflow needed.

1. Push to GitHub
2. **Settings → Pages → Source:** `main` branch, `/` (root)
3. Visit `https://<user>.github.io/<repo>/`

## Contributing

Contributions welcome, especially the easy ones:

- **Add an airport.** If your city or favorite hub isn't covered, add an
  entry to `airports.js` with lat/lon and an alias for common city names,
  then run `npm run build-routes` to pull in its OpenFlights routes.
  See [`scripts/audit-coverage.js`](scripts/audit-coverage.js) output for
  the highest-impact additions.
- **Improve city aliases.** Multilingual spellings, common typos, metro
  names — all welcome in the `CITY_ALIASES` table in `airports.js`.
- **Bug reports.** Open an issue with the team setup that produced the
  weird ranking and what you'd have expected instead.

For larger changes (algorithm tweaks, new features, restructuring), please
open an issue to discuss first so we can confirm direction before you spend
time on a PR.

## License

[MIT](LICENSE) — do whatever you want with it; attribution appreciated.

## Acknowledgments

- Routes & airport coordinates: [OpenFlights](https://github.com/jpatokal/openflights)
- World map outlines: [world-atlas](https://github.com/topojson/world-atlas)
