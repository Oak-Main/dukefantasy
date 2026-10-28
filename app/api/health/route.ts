import { brand } from "@/lib/config";
import { buildIdentity } from "@/lib/build-identity";
import manifest from "@/data/content-refresh/current.json";
import { contentSourceModules, refreshAsOf, refreshRevision, refreshWeek } from "@/lib/content-refresh";

export function GET() {
  return Response.json({
    status: "ok",
    service: brand.name,
    dataEnvironment: "dataset",
    contentVersion: refreshAsOf,
    contentRevision: refreshRevision,
    nflWeek: refreshWeek,
    build: buildIdentity,
    sourceCutoffUtc: manifest.cutoffUtc,
    modules: contentSourceModules().map(({ id, sourceAsOf, fetchedAt, freshness }) => ({ id, sourceAsOf, fetchedAt, freshness })),
    timestamp: new Date().toISOString(),
  });
}
