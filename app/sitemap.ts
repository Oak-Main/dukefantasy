import type { MetadataRoute } from "next";
import { environment } from "@/lib/config";
import { coaches, conferenceHubSlugs, datasetAsOf, stadiums, teams } from "@/lib/cfb-dataset";

/**
 * Detail routes are enumerated from the ESPN 2026 NFL dataset (32 teams and
 * their divisions) so the sitemap can never claim a page the data cannot
 * fill. URLs are absolutized against the production origin — the sitemap
 * spec requires absolute <loc> values, and root-relative ones showed up as
 * GSC errors while the site sat on a stale build (2026-09-22 audit).
 *
 * lastmod is change-based: dataset routes stamp the dataset's own
 * generation date (it rebuilds around weekly) and stadium routes stamp each
 * stadium's lastVerified — only /injuries, which genuinely changes daily,
 * uses the current timestamp.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = environment.siteUrl;
  const datasetDate = new Date(`${datasetAsOf}T00:00:00Z`);
  const teamRoutes: MetadataRoute.Sitemap = teams.map((team) => ({
    url: `${origin}/teams/${team.slug}`,
    lastModified: datasetDate,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  const coachRoutes: MetadataRoute.Sitemap = coaches.map((coach) => ({
    url: `${origin}/coaches/${coach.slug}`,
    lastModified: datasetDate,
    changeFrequency: "weekly",
    priority: 0.4,
  }));
  const conferenceRoutes: MetadataRoute.Sitemap = conferenceHubSlugs().map((slug) => ({
    url: `${origin}/conferences/${slug}`,
    lastModified: datasetDate,
    changeFrequency: "weekly",
    priority: 0.5,
  }));
  const stadiumRoutes: MetadataRoute.Sitemap = stadiums.map((stadium) => ({
    url: `${origin}/stadiums/${stadium.slug}`,
    lastModified: new Date(`${stadium.lastVerified}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.5,
  }));
  const featureRoutes: MetadataRoute.Sitemap = [
    { url: `${origin}/stadiums`, lastModified: datasetDate, changeFrequency: "weekly", priority: 0.6 },
    { url: `${origin}/x-and-ys`, lastModified: datasetDate, changeFrequency: "weekly", priority: 0.7 },
    { url: `${origin}/injuries`, lastModified: datasetDate, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/fantasy-desk`, lastModified: datasetDate, changeFrequency: "weekly", priority: 0.8 },
    // Playoff surfaces exist as HubApp sections but were never listed here,
    // so Google had no discovery path once the season race started (2026-09-29
    // GSC ops audit). Weekly cadence matches how seeding shifts.
    { url: `${origin}/playoff-bracket`, lastModified: datasetDate, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/playoff-predictor`, lastModified: datasetDate, changeFrequency: "weekly", priority: 0.8 },
  ];
  const utilityRoutes: MetadataRoute.Sitemap = ["", "/scores", "/schedule", "/stats", "/transactions", "/data-sources", "/dfs", "/watch"].map(path => ({ url: `${origin}${path}`, lastModified: datasetDate, changeFrequency: "weekly", priority: 0.7 }));
  return [...utilityRoutes, ...teamRoutes, ...coachRoutes, ...conferenceRoutes, ...stadiumRoutes, ...featureRoutes];
}
