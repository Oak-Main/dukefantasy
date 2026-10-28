import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HubApp } from "@/components/HubApp";
import { coaches, fantasyNotes, games, getConferenceHub, portalEvents, stadiums, teams } from "@/lib/cfb-dataset";
import { getRosterPlayerBySlug, playerSlugForName } from "@/lib/player-records";
import { routeSearchCopy } from "@/lib/route-metadata";
import { brand } from "@/lib/config";

const staticRoots = new Set([
  "scores",
  "schedule",
  "transfer-portal",
  "playoff-predictor",
  "playoff-bracket",
  "coaches",
  "coaching-carousel",
  "dfs",
  "x-and-ys",
  "injuries",
  "fantasy-desk",
  "transactions",
  "stats",
  "teams",
  "conferences",
  "stadiums",
  "watch",
  "rankings",
  "search",
  "newsletter",
  "methodology",
  "data-sources",
  "corrections",
  "about",
  "advertise",
  "partnerships",
  "media-kit",
  "privacy",
  "terms",
  "affiliate-disclosure",
  "responsible-gaming",
  "design-system",
]);

function isKnownPath(parts: string[]) {
  const [root, id] = parts;
  if (staticRoots.has(root)) {
    if (!id) return true;
    if (root === "teams" || root === "transfer-portal") return teams.some((team) => team.slug === id);
    if (root === "coaches") return coaches.some((coach) => coach.slug === id);
    if (root === "stadiums") return stadiums.some((stadium) => stadium.slug === id);
    if (root === "conferences") return getConferenceHub(id) != null;
    return false;
  }
  if (root === "games") return games.some((game) => game.id === id);
  if (root === "players") {
    return (
      portalEvents.some((event) => event.playerSlug === id) ||
      fantasyNotes.some((note) => playerSlugForName(note.player) === id) ||
      Boolean(getRosterPlayerBySlug(id))
    );
  }
  return false;
}

interface RoutePageProps {
  params: Promise<{ slug: string[] }>;
  searchParams?: Promise<{ week?: string | string[] }>;
}

async function existingRouteMetadata({
  params,
}: RoutePageProps): Promise<Metadata> {
  const { slug } = await params;
  const [root, detail] = slug;
  if (root === "stadiums") {
    const stadium = detail ? stadiums.find((candidate) => candidate.slug === detail) : undefined;
    const team = stadium ? teams.find((candidate) => candidate.id === stadium.teamId) : undefined;
    return {
      title: stadium ? `${stadium.name} Gameday Guide` : "NFL Stadium Gameday Guides",
      description: stadium
        ? `Published venue facts for ${stadium.name}, home of ${team?.name ?? "its NFL franchise"}. Unverified visitor guidance is marked unpublished.`
        : "NFL stadium venue facts with dated sources. Visitor guidance is shown only when verified.",
    };
  }
  if (root === "players" && detail) {
    const portal = portalEvents.find((event) => event.playerSlug === detail);
    const fantasy = fantasyNotes.find((note) => playerSlugForName(note.player) === detail);
    const roster = getRosterPlayerBySlug(detail);
    const playerName = portal?.player ?? fantasy?.player ?? roster?.name ?? detail.replaceAll("-", " ");
    const position = portal?.position ?? fantasy?.position ?? roster?.position ?? "NFL player";
    const teamId = portal?.toTeamId ?? fantasy?.team ?? roster?.teamId ?? portal?.fromTeamId;
    const team = teams.find((candidate) => candidate.id === teamId);
    return {
      title: `${playerName} — ${position} Player Record`,
      description: `${playerName} player record${team ? ` for ${team.name}` : ""}, including verified portal movement or fantasy analysis when published.`,
    };
  }
  if (root === "search") {
    return {
      title: "Search Teams, Coaches, and Players",
      description: "Search Duke Fantasy across all 32 NFL teams and rostered players.",
    };
  }
  if (root === "watch") {
    return {
      title: "Where to Watch NFL Football",
      description:
        "Find weekly NFL TV windows, broadcast assignments, and official team ticket destinations.",
    };
  }
  if (root === "playoff-bracket") {
    return {
      title: "2026 NFL Playoff Bracket — Publication Status",
      description:
        "NFL postseason format and the publication status of the verified seeding board. Current division standings are available separately.",
    };
  }
  if (root === "playoff-predictor") {
    return {
      title: "NFL Playoff Predictor — Clinching Scenarios",
      description:
        "Which teams are on pace to make the 2026 NFL playoffs: seeding outlook, clinching scenarios, and division-race stakes across the AFC and NFC, updated through the season.",
    };
  }
  if (root === "transfer-portal") {
    const team = detail ? teams.find((candidate) => candidate.slug === detail) : null;
    return {
      title: team ? `${team.shortName} Roster Moves` : "NFL Roster & Transaction Board",
      description: team
        ? `Verified incoming and outgoing transfer movement for ${team.name}.`
        : "Track verified NFL transactions by player, position, team, status, and date.",
    };
  }
  if (root === "dfs") {
    return {
      title: "DFS Projections & Accuracy Ledger",
      description:
        "Weekly NFL fantasy projections, past-week results, and a verification guide that grades every published top-10 pick — hits, misses, and points error.",
    };
  }
  if (root === "injuries") {
    return {
      title: "NFL Injury Report — Long-Term Ledger & Week-to-Week Watch",
      description:
        "Every NFL player on IR or out more than two weeks, plus a week-to-week watch with verified practice status and sourced likelihood to play. Updates Sunday mornings, midday, and before Monday night football.",
    };
  }
  if (root === "fantasy-desk") {
    return {
      title: "Fantasy Desk — Waiver, Start/Sit, Rookie & Trade Boards",
      description:
        "Four sourced weekly decision rails: waiver wire watch after MNF, start/sit tiers by Thursday, rookie usage Tuesdays, and rest-of-season trade values. Tiers are decisions, never projections.",
    };
  }
  if (root === "x-and-ys") {
    return {
      title: "X & Ys — NFL Offensive Concept Library",
      description:
        "Deep breakdowns of NFL pass and run concepts, macro scheme families to micro technique, how 2026 teams execute them, and a weekly film spotlight of the league's best playmakers.",
    };
  }
  if (root === "coaching-carousel" || root === "coaches") {
    const coach = detail ? coaches.find((candidate) => candidate.slug === detail) : null;
    return {
      title: coach ? `${coach.name} Contract Ledger` : "NFL Coaching Ledger",
      description:
        "Compare verified NFL coaching contracts, source notes, and explainable buyout estimates.",
    };
  }
  return {};
}

export async function generateMetadata(props: RoutePageProps): Promise<Metadata> {
  const { slug } = await props.params;
  const path = `/${slug.join("/")}`;
  const copy = routeSearchCopy[path];
  const existing = await existingRouteMetadata(props);
  const title = copy?.title ?? existing.title ?? `${slug[0].replaceAll("-", " ")} — NFL`;
  const description = copy?.description ?? existing.description ?? brand.description;
  return { ...existing, title, description,
    alternates: { canonical: `${brand.siteUrl}${path}` },
    openGraph: { title, description, url: `${brand.siteUrl}${path}` },
    twitter: { title, description },
  };
}

export default async function RoutePage({ params, searchParams }: RoutePageProps) {
  const { slug } = await params;
  if (!isKnownPath(slug)) notFound();
  return <HubApp path={`/${slug.join("/")}`} requestedWeek={slug[0] === "scores" ? (await searchParams)?.week : undefined} />;
}
