// Same-day retries compare the actual schedule, standings, by-game sources and
// verification decisions without treating new retrieval clocks as changed facts.
import { readFileSync } from "node:fs";
const snapshot = JSON.parse(readFileSync(0, "utf8"));
const schedule = snapshot.schedule.map(({ source_retrieved_at, ...game }) => game);
process.stdout.write(JSON.stringify({ season: snapshot.season, teams: snapshot.teams, schedule, standings: snapshot.standings }));
