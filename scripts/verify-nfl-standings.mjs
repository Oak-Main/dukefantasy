/**
 * Cross-checks the standings baked into lib/nfl-generated.ts against ESPN's
 * official standings feed.
 *
 * The dataset builder tallies each record from the final scores in the
 * schedule it fetched, so a game missing from that schedule (an unfetched day,
 * a dropped event) surfaces here as a record mismatch.
 *
 * Run it right after `npm run dataset:build`. ESPN keeps moving during games,
 * so a stale snapshot is expected to differ for teams that have played since,
 * and the standings feed can trail a just-finished game by a few minutes.
 *
 * Exit codes: 0 every team matches, 1 mismatch, 2 could not verify.
 */
import nfl from "../lib/nfl-generated.ts";

const FEED = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=2026";

function entriesOf(node) {
  return [
    ...(node.standings?.entries ?? []),
    ...(node.children ?? []).flatMap(entriesOf),
  ];
}

async function officialStandings() {
  const response = await fetch(FEED, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${FEED}: HTTP ${response.status}`);
  const rows = new Map();
  for (const entry of entriesOf(await response.json())) {
    const stat = (name) => entry.stats?.find((item) => item.name === name)?.value ?? 0;
    rows.set(String(entry.team.id), {
      wins: stat("wins"),
      losses: stat("losses"),
      ties: stat("ties"),
      pf: stat("pointsFor"),
      pa: stat("pointsAgainst"),
    });
  }
  return rows;
}

const describe = (row) =>
  `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""} (PF ${row.pf} PA ${row.pa})`;

let official;
try {
  official = await officialStandings();
} catch (error) {
  console.error(`NFL standings check: COULD NOT VERIFY — ${error.message}`);
  process.exit(2);
}
if (official.size !== nfl.teams.length) {
  console.error(
    `NFL standings check: COULD NOT VERIFY — ESPN returned ${official.size} teams, dataset has ${nfl.teams.length}.`,
  );
  process.exit(2);
}

const mismatches = [];
for (const team of nfl.teams) {
  const baked = nfl.standings[team.slug];
  const espn = official.get(team.id);
  if (!baked || !espn) {
    mismatches.push(`${team.slug}: missing from ${baked ? "ESPN" : "dataset"} standings`);
    continue;
  }
  if (
    baked.wins !== espn.wins ||
    baked.losses !== espn.losses ||
    baked.ties !== espn.ties ||
    baked.pf !== espn.pf ||
    baked.pa !== espn.pa
  ) {
    mismatches.push(`${team.slug}: dataset ${describe(baked)} · ESPN ${describe(espn)}`);
  }
}

const context = `dataset generated ${nfl.generatedAt}, ESPN fetched ${new Date().toISOString()}`;
if (mismatches.length === 0) {
  console.log(
    `NFL standings check: PASS — ${nfl.teams.length}/${nfl.teams.length} teams match ESPN official standings (${context}).`,
  );
} else {
  console.error(
    `NFL standings check: FAIL — ${mismatches.length}/${nfl.teams.length} teams differ from ESPN official standings (${context}).`,
  );
  for (const line of mismatches) console.error(`  ${line}`);
  console.error(
    "A single missing game shifts both teams. Rerun `npm run dataset:build` first; games in progress or finished in the last few minutes can also differ.",
  );
  process.exit(1);
}
