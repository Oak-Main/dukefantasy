import { brand } from "@/lib/config";
import { contentSourceModules, refreshAsOf, refreshRevision, refreshWeek } from "@/lib/content-refresh";

export function GET() {
  return Response.json({
    status: "ok",
    service: brand.name,
    dataEnvironment: "dataset",
    contentVersion: refreshAsOf,
    contentRevision: refreshRevision,
    nflWeek: refreshWeek,
    modules: contentSourceModules().map(({ id, sourceAsOf, fetchedAt, freshness }) => ({ id, sourceAsOf, fetchedAt, freshness })),
    timestamp: new Date().toISOString(),
  });
}
