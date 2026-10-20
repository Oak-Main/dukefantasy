import { providerHealth } from "@/lib/cfb-dataset";
import { getProductionGates, isProductionLaunchReady } from "@/lib/release-readiness";
import { contentSourceModules } from "@/lib/content-refresh";

export function GET() {
  const gates = getProductionGates(process.env);
  return Response.json(
    {
      readyForPreview: true,
      readyForProductionLiveData: isProductionLaunchReady(process.env),
      datasetProvider: "reviewed-nfl-snapshot",
      contentModules: contentSourceModules(),
      externalDependencies: providerHealth
        .filter((provider) => provider.mode === "production")
        .map(({ id, status, note }) => ({ id, status, note })),
      productionGates: gates.map(({ id, label, status, blockedReason }) => ({
        id,
        label,
        status,
        note: status === "blocked" ? blockedReason : "Approval recorded.",
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
