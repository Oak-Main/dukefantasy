import { brand } from "@/lib/config";
import { refreshAsOf, refreshWeek } from "@/lib/content-refresh";
import { routeSearchCopy } from "@/lib/route-metadata";

export function EditionStructuredData({ path }: { path: "/" | "/fantasy-desk" }) {
  const copy = routeSearchCopy[path];
  const page = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: new URL(path, brand.siteUrl).href,
    name: copy.title,
    description: copy.description,
    dateModified: refreshAsOf,
    about: { "@type": "Thing", name: `2026 NFL Week ${refreshWeek}` },
    isPartOf: { "@type": "WebSite", name: brand.name, url: brand.siteUrl },
  };
  return <script type="application/ld+json">{JSON.stringify(page).replaceAll("<", "\\u003c")}</script>;
}
