"use client";

import {
	CalendarDays,
	ExternalLink,
	Headphones,
	Radio,
	ShieldCheck,
	Ticket,
	Tv,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	ticketAffiliatesConfigured,
	ticketLinksForTeam,
} from "@/lib/affiliates";
import { travelLinksForQuery, travelAffiliatesConfigured } from "@/lib/travel-affiliates";
import { timeEtLabel, type RadioStation, type TvRow } from "@/lib/cfb-dataset";
import type { Stadium, Team } from "@/lib/types";
import { TeamMark } from "./primitives";

export interface WatchPageProps {
	tvRows: readonly TvRow[];
	tvWeeks: () => number[];
	broadcastAsOf: string | null;
	broadcastNote: string | null;
	radioForTeam: (slug: string) => RadioStation | null;
	radioAsOf: string | null;
	stadiums: readonly Stadium[];
	teams: readonly Team[];
}

type NetworkTone = "red" | "blue" | "gold" | "cyan" | "neutral";

interface NetworkGroup {
	name: string;
	tone: NetworkTone;
	games: TvRow[];
}

const networkOrder = [
	"ABC",
	"ESPN",
	"ESPN2",
	"FOX",
	"CBS",
	"NBC",
	"Peacock",
	"FS1",
	"CBSSN",
	"ACCN",
	"SECN",
	"BTN",
	"CW",
];

function validHttpUrl(value: string | null | undefined) {
	if (!value) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function sourceLabel(value: string) {
	try {
		return new URL(value).hostname.replace(/^www\./, "");
	} catch {
		return "Research source";
	}
}

function formatDate(value: string | null, style: "long" | "board" = "long") {
	if (!value) return "Not published";
	const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
	if (!Number.isFinite(date.getTime())) return "Not published";
	return new Intl.DateTimeFormat("en-US", {
		weekday: style === "board" ? "short" : undefined,
		month: style === "board" ? "short" : "long",
		day: "numeric",
		year: style === "long" ? "numeric" : undefined,
		timeZone: "UTC",
	}).format(date);
}

function weekLabel(week: number) {
	return week === 0 ? "Week 0" : `Week ${week}`;
}

function initialWeek(
	rows: readonly TvRow[],
	weeks: readonly number[],
	asOf: string | null,
) {
	// On or after the as-of day: on game day (and on the final Sunday) the
	// current week is still the one to show.
	const nextGame = asOf
		? rows.find((row) => row.date >= asOf.slice(0, 10))
		: undefined;
	return nextGame?.week ?? weeks.at(-1) ?? 1;
}

function networkTone(name: string): NetworkTone {
	const network = name.toUpperCase();
	if (network.includes("ESPN") || network === "ACCN" || network === "SECN") {
		return "red";
	}
	if (
		network.includes("FOX") ||
		network.startsWith("FS") ||
		network === "BTN" ||
		network.includes("CBS")
	) {
		return "blue";
	}
	if (network.includes("NBC") || network.includes("PEACOCK")) return "gold";
	if (network === "CW") return "cyan";
	return "neutral";
}

function networkPriority(name: string) {
	if (name === "unassigned") return Number.MAX_SAFE_INTEGER;
	const exact = networkOrder.indexOf(name);
	if (exact >= 0) return exact;
	const family = networkOrder.findIndex((network) => name.startsWith(network));
	return family >= 0 ? family : networkOrder.length;
}

function groupByNetwork(rows: readonly TvRow[]): NetworkGroup[] {
	const groups = new Map<string, TvRow[]>();
	for (const row of rows) {
		const name = row.tv ?? "unassigned";
		const games = groups.get(name) ?? [];
		games.push(row);
		groups.set(name, games);
	}
	return [...groups.entries()]
		.map(([name, games]) => ({ name, games, tone: networkTone(name) }))
		.sort(
			(a, b) =>
				networkPriority(a.name) - networkPriority(b.name) ||
				a.name.localeCompare(b.name),
		);
}

function officialAthleticsUrl(
	stadium: Stadium | undefined,
	station: RadioStation | null,
) {
	const excludedHosts = ["wikipedia.org", "ncaa.com", "fbschedules.com"];
	for (const source of stadium?.sources ?? []) {
		const url = validHttpUrl(source);
		if (url && !excludedHosts.some((host) => url.includes(host))) return url;
	}
	return validHttpUrl(station?.stream);
}

function TeamLine({ team, slug }: { team?: Team; slug: string }) {
	const fallback = slug
		.replaceAll("-", " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
	return (
		<a className="watch-team-line" href={`/teams/${slug}`}>
			{team ? <TeamMark team={team} size="xs" /> : null}
			<span>{team?.shortName ?? fallback}</span>
		</a>
	);
}

function NetworkCard({
	group,
	teamsBySlug,
}: {
	group: NetworkGroup;
	teamsBySlug: ReadonlyMap<string, Team>;
}) {
	return (
		<article className="watch-network-card" data-tone={group.tone}>
			<header className="watch-network-card__header">
				<div>
					<span className="watch-network-card__signal" aria-hidden="true" />
					<h3 className="font-display">{group.name}</h3>
				</div>
				<span>
					{group.games.length} {group.games.length === 1 ? "game" : "games"}
				</span>
			</header>
			<ol className="watch-network-games">
				{group.games.map((game) => (
					<li key={`${game.date}-${game.away}-${game.home}`}>
						<div className="watch-game-time">
							<span>{formatDate(game.date, "board")}</span>
							<strong className="font-display">
								{timeEtLabel(game.time_et) ?? "TBD"}
							</strong>
						</div>
						<div className="watch-matchup">
							<TeamLine team={teamsBySlug.get(game.away)} slug={game.away} />
							<span className="watch-matchup__at">AT</span>
							<TeamLine team={teamsBySlug.get(game.home)} slug={game.home} />
						</div>
					</li>
				))}
			</ol>
		</article>
	);
}

export function WatchPage({
	tvRows,
	tvWeeks,
	broadcastAsOf,
	broadcastNote,
	radioForTeam,
	radioAsOf,
	stadiums,
	teams,
}: WatchPageProps) {
	const weeks = useMemo(() => tvWeeks(), [tvWeeks]);
	const [week, setWeek] = useState(() =>
		initialWeek(tvRows, tvWeeks(), broadcastAsOf),
	);
	const sortedTeams = useMemo(
		() => [...teams].sort((a, b) => a.shortName.localeCompare(b.shortName)),
		[teams],
	);
	const [selectedTeamSlug, setSelectedTeamSlug] = useState(() =>
		teams.some((team) => team.slug === "alabama")
			? "alabama"
			: (sortedTeams[0]?.slug ?? ""),
	);
	const teamsBySlug = useMemo(
		() => new Map(teams.map((team) => [team.slug, team])),
		[teams],
	);
	const weekRows = useMemo(
		() => tvRows.filter((row) => row.week === week),
		[tvRows, week],
	);
	const networkGroups = useMemo(() => groupByNetwork(weekRows), [weekRows]);
	const networkCount = useMemo(
		() => new Set(weekRows.flatMap((row) => (row.tv ? [row.tv] : []))).size,
		[weekRows],
	);
	const selectedTeam = teamsBySlug.get(selectedTeamSlug);
	const station = radioForTeam(selectedTeamSlug);
	const isRadioVerified = Boolean(station?.station && station.sources.length);
	const selectedStadium = stadiums.find(
		(stadium) => stadium.teamId === selectedTeamSlug,
	);
	const athleticsUrl = officialAthleticsUrl(selectedStadium, station);
	const authorizedStream = validHttpUrl(station?.stream);
	const stationSources = (station?.sources ?? [])
		.map((source) => validHttpUrl(source))
		.filter((source): source is string => Boolean(source));
	const affiliateLinks = selectedTeam
		? ticketLinksForTeam(selectedTeam.name)
		: [];

	return (
		<div className="watch-page">
			<header className="watch-hero">
				<div className="watch-hero__field" aria-hidden="true" />
				<div className="apex-container watch-hero__inner">
					<div className="watch-hero__copy">
						<span className="watch-kicker">
							<span aria-hidden="true" /> DUKE FANTASY BROADCAST DESK
						</span>
						<h1 className="font-display text-balance">
							Where the game <span>lives.</span>
						</h1>
						<p className="text-pretty">
							TV windows, trusted radio flagships, and the team-owned path to
							the gate—compiled into one verified game-day handoff.
						</p>
					</div>
					<div className="watch-hero__stamp">
						<CalendarDays size={22} aria-hidden="true" />
						<div>
							<span>BROADCAST BOARD</span>
							<strong className="font-display">
								COMPILED {formatDate(broadcastAsOf).toUpperCase()}
							</strong>
							<small>
								{tvRows.length} designations across {weeks.length} weeks
							</small>
						</div>
					</div>
				</div>
			</header>

			<nav className="watch-jump-nav" aria-label="Ways to follow the game">
				<div className="apex-container">
					<a href="#tv-board">
						<Tv size={20} aria-hidden="true" />
						<span>
							<strong className="font-display">TV</strong>
							<small>Weekly network board</small>
						</span>
					</a>
					<a href="#radio">
						<Headphones size={20} aria-hidden="true" />
						<span>
							<strong className="font-display">RADIO</strong>
							<small>Verified flagships</small>
						</span>
					</a>
					<a href="#tickets">
						<Ticket size={20} aria-hidden="true" />
						<span>
							<strong className="font-display">TICKETS</strong>
							<small>Official destinations</small>
						</span>
					</a>
				</div>
			</nav>

			<div className="apex-container">
				<section
					className="watch-section"
					id="tv-board"
					aria-labelledby="tv-title"
				>
					<header className="watch-section-heading">
						<div>
							<span className="watch-kicker">01 / WEEKLY TV BOARD</span>
							<h2 id="tv-title" className="font-display text-balance">
								Find the window. Own the weekend.
							</h2>
							<p>
								Every published national designation, sorted into the network
								cards you already recognize.
							</p>
						</div>
						<div className="watch-now-viewing">
							<span>NOW VIEWING</span>
							<strong className="font-display">{weekLabel(week)}</strong>
						</div>
					</header>

					<fieldset className="watch-week-rail">
						<legend className="sr-only">Select a broadcast week</legend>
						{weeks.map((item) => (
							<button
								type="button"
								key={item}
								aria-pressed={week === item}
								onClick={() => setWeek(item)}
							>
								{weekLabel(item)}
							</button>
						))}
					</fieldset>

					<dl className="watch-summary-strip" aria-live="polite">
						<div>
							<dt>televised games</dt>
							<dd className="font-display">{weekRows.length}</dd>
						</div>
						<div>
							<dt>Networks broadcasting</dt>
							<dd className="font-display">{networkCount}</dd>
						</div>
						<div>
							<dt>Board compiled</dt>
							<dd className="font-display">{formatDate(broadcastAsOf)}</dd>
						</div>
					</dl>

					{networkGroups.length ? (
						<div className="watch-network-grid watch-board-enter" key={week}>
							{networkGroups.map((group) => (
								<NetworkCard
									group={group}
									teamsBySlug={teamsBySlug}
									key={group.name}
								/>
							))}
						</div>
					) : (
						<div className="watch-empty-board">
							<Tv size={28} aria-hidden="true" />
							<h3 className="font-display">Designations not published</h3>
							<p>
								This week is still inside the network selection window. Check
								back when the next release lands.
							</p>
						</div>
					)}
					<p className="watch-board-note">
						{broadcastNote ??
							"Broadcast notes are not published. All kickoff times are Eastern."}
					</p>
				</section>

				<section
					className="watch-section"
					id="radio"
					aria-labelledby="radio-title"
				>
					<header className="watch-section-heading watch-section-heading--destinations">
						<div>
							<span className="watch-kicker">02 / RADIO &amp; TICKETS</span>
							<h2 id="radio-title" className="font-display text-balance">
								Follow your team, your way.
							</h2>
							<p>
								Choose a program once. We will surface its verified flagship and
								official team destination.
							</p>
						</div>
						<label className="watch-team-select" htmlFor="watch-team">
							<span>Choose your team</span>
							<select
								id="watch-team"
								value={selectedTeamSlug}
								onChange={(event) => setSelectedTeamSlug(event.target.value)}
							>
								{sortedTeams.map((team) => (
									<option value={team.slug} key={team.slug}>
										{team.shortName}
									</option>
								))}
							</select>
						</label>
					</header>

					<div className="watch-destination-grid">
						<article
							className="watch-radio-card"
							aria-labelledby="radio-card-title"
						>
							<div className="watch-card-topline">
								<span
									className="watch-verification"
									data-verified={isRadioVerified}
								>
									<ShieldCheck size={16} aria-hidden="true" />
									{isRadioVerified ? "RESEARCH VERIFIED" : "RESEARCH GAP"}
								</span>
								<span>Compiled {formatDate(radioAsOf)}</span>
							</div>

							<div className="watch-station-lockup">
								<span className="watch-station-icon" aria-hidden="true">
									<Radio size={28} />
								</span>
								<div>
									<span>Local radio flagship</span>
									<h3 id="radio-card-title" className="font-display">
										{station?.station ?? "Not published"}
									</h3>
									<strong>{station?.frequency ?? "Not published"}</strong>
								</div>
							</div>

							<dl className="watch-station-details">
								<div>
									<dt>Market</dt>
									<dd>{station?.market ?? "Not published"}</dd>
								</div>
								<div>
									<dt>Network</dt>
									<dd>{station?.network ?? "Not published"}</dd>
								</div>
								<div>
									<dt>Rights holder</dt>
									<dd>{station?.rights_holder ?? "Not published"}</dd>
								</div>
							</dl>

							{station?.notes ? (
								<p className="watch-station-note">{station.notes}</p>
							) : null}

							<div className="watch-source-list">
								<span>RESEARCH SOURCES</span>
								{stationSources.length ? (
									<ul>
										{stationSources.map((source) => (
											<li key={source}>
												<a
													href={source}
													target="_blank"
													rel="nofollow noreferrer noopener"
												>
													{sourceLabel(source)}
													<ExternalLink size={14} aria-hidden="true" />
												</a>
											</li>
										))}
									</ul>
								) : (
									<p>Not published</p>
								)}
							</div>

							<div className="watch-card-actions">
								{athleticsUrl ? (
									<a
										className="watch-primary-button"
										href={athleticsUrl}
										target="_blank"
										rel="nofollow noreferrer noopener"
									>
										Open official team site
										<ExternalLink size={16} aria-hidden="true" />
									</a>
								) : (
									<span className="watch-disabled-button">
										Official site not published
									</span>
								)}
								{authorizedStream && authorizedStream !== athleticsUrl ? (
									<a
										className="watch-secondary-button"
										href={authorizedStream}
										target="_blank"
										rel="nofollow noreferrer noopener"
									>
										Authorized audio destination
										<ExternalLink size={16} aria-hidden="true" />
									</a>
								) : null}
							</div>
						</article>

						<article
							className="watch-ticket-card"
							id="tickets"
							aria-labelledby="tickets-card-title"
						>
							<div className="watch-card-topline">
								<span
									className="watch-verification"
									data-verified={ticketAffiliatesConfigured}
								>
									{ticketAffiliatesConfigured
										? "PARTNER ACTIVE"
										: "LINKS LIVE · COMMISSION PENDING"}
								</span>
							</div>

							<div className="watch-ticket-heading">
								<Ticket size={27} aria-hidden="true" />
								<div>
									<span>THE TEAM-OWNED PATH</span>
									<h3 id="tickets-card-title" className="font-display">
										Ticket inventory
									</h3>
								</div>
							</div>

							<div className="watch-ticket-team">
								{selectedTeam ? (
									<TeamMark team={selectedTeam} size="md" />
								) : null}
								<div>
									<strong>{selectedTeam?.name ?? "Team not selected"}</strong>
									<span>{selectedStadium?.name ?? "Venue not published"}</span>
								</div>
							</div>

							<p>
								NFL teams are the primary
								ticket source shown by default. Duke Fantasy does not invent resale
								inventory, prices, or availability.
							</p>

							{athleticsUrl ? (
								<a
									className="watch-primary-button"
									href={athleticsUrl}
									target="_blank"
									rel="nofollow noreferrer noopener"
								>
									Visit the official team site
									<ExternalLink size={16} aria-hidden="true" />
								</a>
							) : (
								<span className="watch-disabled-button">
									Official site not published
								</span>
							)}

							{affiliateLinks.length ? (
								<div className="watch-sponsored-links">
									<span>{affiliateLinks.some((link) => link.tracked) ? "SPONSORED OPTIONS" : "TICKET PARTNERS"}</span>
									<div>
										{affiliateLinks.map((link) => (
											<a
												href={link.url}
												key={link.partner}
												target="_blank"
												rel="sponsored nofollow noreferrer noopener"
											>
												{link.partner}
												<ExternalLink size={14} aria-hidden="true" />
											</a>
										))}
									</div>
									<p>
										{affiliateLinks.some((link) => link.tracked)
											? "Duke Fantasy may earn a commission. See the "
											: "Affiliate approval pending \u2014 these links go straight to our ticket partners' searches; commissions activate once partnerships are approved. See the "}
										<a href="/affiliate-disclosure">affiliate disclosure</a>.
									</p>
								</div>
							) : (
								<p className="watch-no-partner-note">
									No ticket marketplace partner is configured. This direct
									school link is not sponsored.
								</p>
							)}
						</article>
						{travelAffiliatesConfigured && selectedStadium ? (
							<div className="watch-sponsored-links watch-travel">
								<span>TRAVEL FOR THE GAME</span>
								<div>
									{travelLinksForQuery(`hotels near ${selectedStadium.name} ${selectedStadium.city}`, "hotels")
										.concat(travelLinksForQuery(`${selectedStadium.city} car rental`, "cars"))
										.map((link) => (
											<a href={link.url} key={`travel-${link.partner}`} target="_blank" rel="sponsored nofollow noreferrer noopener">
												{link.category === "hotels" ? "Hotels" : "Cars"} · {link.partner}
												<ExternalLink size={14} aria-hidden="true" />
											</a>
										))}
								</div>
							</div>
						) : null}
					</div>
				</section>
			</div>
		</div>
	);
}
