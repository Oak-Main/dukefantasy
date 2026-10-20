import { brand } from "@/lib/config";
import { contentSourceModules, refreshAsOf, refreshWeek } from "@/lib/content-refresh";

export function GET() {
  return Response.json({
    status: "ok",
    service: brand.name,
    dataEnvironment: "dataset",
    contentVersion: refreshAsOf,
    nflWeek: refreshWeek,
    modules: contentSourceModules().map(({ id, sourceAsOf, fetchedAt, freshness }) => ({ id, sourceAsOf, fetchedAt, freshness })),
    timestamp: new Date().toISOString(),
  });
}
