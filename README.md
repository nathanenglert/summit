# Summit

Pick the city that's easiest for your whole team to fly into.

Add everyone's home city, and Summit ranks every major hub airport in the world
by total team travel time, longest individual trip, and direct-flight count.
Click any candidate to see a world map of each traveler's actual routing —
direct or connecting through real OpenFlights hubs.

## Live demo

https://nathanenglert.github.io/summit/

## How it works

1. **Resolve each home city** to a major airport (free-text input + alias table).
2. **Score every candidate destination** in `airports.js` (145 hubs):
   - For each traveler, find the best path: direct → 1-stop → 2-stop → estimate.
   - Total = airport overhead + flight time at cruise speed + layovers.
3. **Rank by** average travel time + a fairness term on the worst individual trip.
4. **Render** top 10 + an interactive Equal Earth map with great-circle arcs per leg.

Direct-flight data comes from the
[OpenFlights routes dataset](https://github.com/jpatokal/openflights) (~67k
direct routes), filtered down to the pairs where both endpoints are in the
curated airport list.

## Local development

No build step required for the site itself — everything is static HTML/JS.

```bash
npm run dev
# open http://localhost:8765
```

Or use any static file server.

### Customizing the sample team

The "Load sample" button reads from `sample-team.js` by default. To use a
different team locally without committing it, create `sample-team.local.js`:

```js
export const SAMPLE_TEAM = [
  ["Alice", "Berlin"],
  ["Bob",   "Toronto"],
  // ...
];
```

`sample-team.local.js` is gitignored. When present, it overrides the default.

### Regenerating routes.js

`routes.js` is committed so the site deploys without a build step. To rebuild it
from a fresh OpenFlights snapshot:

```bash
npm run fetch-data     # downloads routes.dat + airports.dat to /tmp
npm run build-routes   # regenerates routes.js
```

### Auditing coverage

To see which airports OpenFlights has that we don't yet include — ranked by how
many connections they'd unlock to the airports we already track:

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
sample-team.js          Default sample team (override via sample-team.local.js)
scripts/
  build-routes.js       Regenerate routes.js
  audit-coverage.js     Report missing-airport opportunities
```

## Deploying to GitHub Pages

The repo is configured to be served as-is — no build step, no Actions workflow.

1. Push to GitHub
2. Settings → Pages → Source: `main` branch, root folder
3. Visit `https://<user>.github.io/<repo>/`

## Data attribution

- Routes & airport coordinates: [OpenFlights](https://github.com/jpatokal/openflights)
- World map outlines: [world-atlas](https://github.com/topojson/world-atlas)
- Travel time estimates are heuristic (great-circle distance + cruise speed + a
  2h layover per connection). Not a substitute for actual flight schedules.
