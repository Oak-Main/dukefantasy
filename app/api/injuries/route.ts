import { teams } from "@/lib/cfb-dataset";
import { ESPN_INJURY_FEED, espnInjuries, espnInjuriesAsOf } from "@/lib/injury-report";

export const revalidate = 0;

const STATUS_MAP: Record<string, string> = {
  "Injured Reserve": "IR",
  Out: "OUT",
  Questionable: "QUESTIONABLE",
  Doubtful: "DOUBTFUL",
  Suspension: "SUSPENSION",
  Active: "ACTIVE",
};

const teamSlugByEspnId = new Map(teams.map((team) => [team.id, team.slug]));

interface CacheShape {
  asOf: string;
  fetchedAt: number;
  entries: Array<{
    player: string;
    teamSlug: string | null;
    position: string | null;
    status: string;
    detail: string | null;
    asOf: string | null;
  }>;
}

// Per-isolate live-feed cache. Editorial slots are a plan, not an automated
// refresh guarantee; a failed upstream request can return explicitly dated data.
let cache: CacheShape | null = null;
const TTL_MS = 10 * 60 * 1000;

async function loadEspnFeed(): Promise<CacheShape> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  const response = await fetch(ESPN_INJURY_FEED, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      referer: "https://www.espn.com/",
    },
  });
  if (!response.ok) {
    if (cache) return cache; // serve stale rather than fail
    throw new Error(`ESPN injury feed unavailable: ${response.status}`);
  }
  const doc = (await response.json()) as {
    timestamp?: string;
    injuries?: Array<{ id?: string | number; injuries?: Array<Record<string, unknown>> }>;
  };
  const entries: CacheShape["entries"] = [];
  for (const block of doc.injuries ?? []) {
    for (const row of block.injuries ?? []) {
      const status = STATUS_MAP[String(row.status)] ?? "QUESTIONABLE";
      if (status === "ACTIVE") continue;
      const athlete = (row.athlete ?? {}) as { displayName?: string; position?: { abbreviation?: string } };
      entries.push({
        player: athlete.displayName ?? "Unknown",
        teamSlug: teamSlugByEspnId.get(String(block.id)) ?? null,
        position: athlete.position?.abbreviation ?? null,
        status,
        detail: (row.shortComment as string) ?? (row.longComment as string) ?? null,
        asOf: typeof row.date === "string" ? row.date.slice(0, 10) : null,
      });
    }
  }
  cache = {
    asOf: doc.timestamp ? doc.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10),
    fetchedAt: Date.now(),
    entries,
  };
  return cache;
}

export async function GET() {
  try {
    const feed = await loadEspnFeed();
    return Response.json(
      {
        requestId: crypto.randomUUID(),
        source: "ESPN NFL injuries feed",
        asOf: feed.asOf,
        count: feed.entries.length,
        entries: feed.entries,
      },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    // ESPN can reject datacenter egress. The build snapshot keeps its actual
    // evidence date and may be old or empty; compilation does not renew it.
    return Response.json(
      {
        requestId: crypto.randomUUID(),
        source: "ESPN NFL injuries feed (build snapshot)",
        asOf: espnInjuriesAsOf,
        count: espnInjuries.length,
        entries: espnInjuries,
        degraded: true,
        detail: error instanceof Error ? error.message : "live fetch failed; serving build snapshot",
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }
}
