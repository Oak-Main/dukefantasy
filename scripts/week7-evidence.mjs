import { createHash } from "node:crypto";

export const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
export function publisher(url) { const parsed = new URL(url); if (parsed.protocol !== "https:") throw new Error("Evidence must use HTTPS"); return parsed.hostname.toLowerCase().split(".").slice(-2).join("."); }

export function collectFacts({ snapshot, injury, editorial }) {
  const facts = new Map();
  const put = (kind, key, value) => { const id = `${kind}:${key}`; if (facts.has(id)) throw new Error(`Duplicate publication record ${id}`); facts.set(id, { kind, key, value }); };
  for (const row of [...injury.ledger, ...injury.watch]) put("injury", `${row.team_slug}:${row.player}`, {
    player: row.player, team_slug: row.team_slug, status: row.published_status ?? row.status ?? null,
    injury: row.injury ?? null, practice: row.practice ?? null,
    designation_date: row.designation_date ?? null, designation_week: row.designation_week ?? null,
  });
  for (const row of editorial.reserveStatuses ?? []) put("reserve", `${row.team_slug}:${row.player}`, { player: row.player, team_slug: row.team_slug, status: row.status, asOf: row.asOf ?? null });
  for (const report of editorial.practiceReports ?? []) put("practice", `${report.date}:${report.team_slug}:${report.player}`, { date: report.date, week: report.week, player: report.player, team_slug: report.team_slug, participation: report.participation, report_type: report.report_type, injury: report.injury });
  for (const report of editorial.inactives ?? []) put("inactive", `${report.gameId}:${report.teamSlug}`, { gameId: report.gameId, week: report.week, teamSlug: report.teamSlug, complete: report.complete, players: [...report.players].sort((a,b) => a.name.localeCompare(b.name)) });
  for (const game of snapshot.schedule.filter(game => game.week <= 7)) put("result", game.id, {
    week: game.week, status: game.status, awayScore: game.awayScore, homeScore: game.homeScore,
  });
  return facts;
}

export function validateEvidence(evidence, before, after, now = new Date()) {
  if (evidence.week !== 7 || !/^[a-f0-9]{40}$/.test(evidence.baseCommit ?? "")) throw new Error("Week 7 and the exact base commit are required");
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(id => canonical(before.get(id)?.value ?? null) !== canonical(after.get(id)?.value ?? null));
  const observations = new Map((evidence.observations ?? []).map(row => [`${row.kind}:${row.key}`, row]));
  const checkSources = (sources, value, label) => {
    if (!Array.isArray(sources) || new Set(sources.map(source => publisher(source.url))).size < 2) throw new Error(`${label}: two publisher families required`);
    for (const source of sources) {
      const at = Date.parse(source.checkedAt);
      if (!Number.isFinite(at) || at > now.getTime() + 60_000 || now.getTime() - at > 2 * 3_600_000) throw new Error(`${label}: missing, future or stale retrieval time`);
      if (source.reportedWeek !== (value?.week ?? 7)) throw new Error(`${label}: wrong report week`);
      if (canonical(source.value) !== canonical(value)) throw new Error(`${label}: source observations disagree with the published value`);
    }
  };
  for (const id of changed) {
    const observation = observations.get(id);
    if (!observation) throw new Error(`${id}: missing evidence for a changed fact`);
    const actual = after.get(id)?.value ?? null;
    if (canonical(observation.value) !== canonical(actual)) throw new Error(`${id}: evidence does not match the candidate`);
    if (actual === null && !observation.removalReason) throw new Error(`${id}: removal needs an explicit sourced reason; omission is not activation`);
    checkSources(observation.sources, actual, id);
  }
  for (const review of evidence.moduleReviews ?? []) {
    const selected = [...after.values()].filter(row => review.module === "injuries" ? ["injury", "reserve", "practice"].includes(row.kind) : review.module === "schedule" ? row.kind === "result" : review.module === "inactives" ? row.kind === "inactive" : false);
    if (selected.length === 0 || review.dataSha256 !== digest(selected)) throw new Error(`${review.module}: complete module review hash does not match`);
    checkSources(review.sources, { dataSha256: review.dataSha256, complete: true }, review.module);
  }
  if (changed.length === 0 && !(evidence.moduleReviews?.length)) throw new Error("NOOP: no changed verified facts or completed module reviews");
  return { changedFacts: changed.length, moduleReviews: evidence.moduleReviews?.length ?? 0 };
}
