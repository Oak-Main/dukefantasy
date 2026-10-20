import {
  CloudSun,
  Tv,
  Radio,
  ParkingCircle,
  Ticket,
  ExternalLink,
  ArrowRight,
  MapPin,
  CheckCircle2,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

export interface Team {
  name: string;
  abbreviation: string;
  color: string;
  logo?: string;
}

export interface Game {
  awayTeam: Team;
  homeTeam: Team;
  date: string;
  kickoffLabel: string;
  broadcast?: {
    network: string;
    kickoffTime?: string;
  };
  venue: string;
  city: string;
}

export interface Weather {
  temperature: number;
  summary: string;
  windMph: number;
}

export interface RadioInfo {
  station: string;
  frequency: string;
  market: string;
}

export interface Parking {
  summary: string;
  lastVerified: string;
}

export interface GamedayPlannerCardProps {
  game: Game;
  weather: Weather | null;
  radio: RadioInfo | null;
  parking: Parking | null;
  ticketUrl: string | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const BG_DARK = "#0A0F1A";
const GOLD = "#F5B542";
const SURFACE = "#111827";

// ── Sub-components ──────────────────────────────────────────────────────────

function TeamMark({ team, size = "md" }: { team: Team; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm";
  const fontSize = size === "lg" ? "text-base" : "text-xs";

  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt={team.name}
        className={`${dim} rounded-full object-cover ring-2`}
        style={{ boxShadow: `0 0 0 2px ${team.color}` }}
      />
    );
  }

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold ${fontSize} shrink-0`}
      style={{
        backgroundColor: team.color,
        color: "#fff",
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
      }}
    >
      {team.abbreviation}
    </div>
  );
}

function NotPublished() {
  return (
    <span className="text-sm text-slate-500 italic">Not published</span>
  );
}

function RowIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: "rgba(245,181,66,0.10)" }}
    >
      {children}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 ${
        isLast ? "" : "border-b"
      }`}
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
    >
      <RowIcon>{icon}</RowIcon>
      <div className="min-w-0 flex-1">
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1"
        >
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function GamedayPlannerCard({
  game,
  weather,
  radio,
  parking,
  ticketUrl,
}: GamedayPlannerCardProps) {
  // `game.date` and `lastVerified` are calendar days ("2026-10-11"), not
  // instants. Parsed bare they are UTC midnight, which a US viewer's zone turns
  // into the evening before ("Sat, Oct 10" for Sunday's game, and a hydration
  // mismatch with the UTC server render). Anchor at noon and format in UTC.
  const calendarDay = (dateStr: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${dateStr.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
      ...options,
      timeZone: "UTC",
    });

  const formatDate = (dateStr: string) =>
    calendarDay(dateStr, { weekday: "short", month: "short", day: "numeric" });

  const verifiedLabel = (dateStr: string) =>
    calendarDay(dateStr, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div
      className="w-full max-w-md rounded-2xl overflow-hidden"
      style={{
        backgroundColor: SURFACE,
        border: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="px-5 pt-5 pb-4"
        style={{
          background: `linear-gradient(180deg, rgba(245,181,66,0.04) 0%, transparent 100%)`,
        }}
      >
        {/* Date + venue */}
        <div className="flex items-center justify-between mb-4">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: GOLD }}
          >
            {formatDate(game.date)}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <MapPin className="h-3 w-3" />
            {game.venue}, {game.city}
          </span>
        </div>

        {/* Matchup */}
        <div className="flex items-center justify-between gap-3">
          {/* Away */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <TeamMark team={game.awayTeam} size="lg" />
            <div className="text-center">
              <div className="text-sm font-semibold text-white leading-tight">
                {game.awayTeam.name}
              </div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-0.5">
                Away
              </div>
            </div>
          </div>

          {/* AT */}
          <div className="flex flex-col items-center px-2">
            <span
              className="text-xs font-bold italic"
              style={{ color: GOLD }}
            >
              AT
            </span>
          </div>

          {/* Home */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <TeamMark team={game.homeTeam} size="lg" />
            <div className="text-center">
              <div className="text-sm font-semibold text-white leading-tight">
                {game.homeTeam.name}
              </div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-0.5">
                Home
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hairline divider */}
      <div style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

      {/* ── Info rows ──────────────────────────────────────────────────── */}

      {/* 1. Weather */}
      <InfoRow
        icon={<CloudSun className="h-4.5 w-4.5" style={{ color: GOLD }} />}
        label="Weather"
      >
        {weather ? (
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="font-bold leading-none tracking-tighter tabular-nums"
              style={{
                color: "#fff",
                fontSize: "2.25rem",
                fontVariantNumeric: "tabular-nums",
                fontStretch: "condensed",
              }}
            >
              {weather.temperature}
              <span className="text-xl align-top" style={{ color: GOLD }}>
                °
              </span>
            </span>
            <div className="flex flex-col">
              <span className="text-sm text-slate-200">{weather.summary}</span>
              <span className="text-xs text-slate-500">
                Wind {weather.windMph} mph
              </span>
            </div>
          </div>
        ) : (
          <NotPublished />
        )}
      </InfoRow>

      {/* 2. TV */}
      <InfoRow
        icon={<Tv className="h-4.5 w-4.5" style={{ color: GOLD }} />}
        label="TV"
      >
        {game.broadcast ? (
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="text-sm font-bold uppercase tracking-wider"
              style={{ color: GOLD }}
            >
              {game.broadcast.network}
            </span>
            {game.broadcast.kickoffTime && (
              <span
                className="text-sm text-slate-300 tabular-nums"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {game.broadcast.kickoffTime}
              </span>
            )}
          </div>
        ) : (
          <NotPublished />
        )}
      </InfoRow>

      {/* 3. Radio */}
      <InfoRow
        icon={<Radio className="h-4.5 w-4.5" style={{ color: GOLD }} />}
        label="Radio"
      >
        {radio ? (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">
              {radio.station}
            </span>
            <span className="text-sm text-slate-400">{radio.frequency}</span>
            <span className="text-xs text-slate-500">· {radio.market}</span>
          </div>
        ) : (
          <NotPublished />
        )}
      </InfoRow>

      {/* 4. Parking */}
      <InfoRow
        icon={<ParkingCircle className="h-4.5 w-4.5" style={{ color: GOLD }} />}
        label="Parking"
      >
        {parking ? (
          <div className="space-y-1.5">
            <p className="text-sm text-slate-200 leading-relaxed">
              {parking.summary}
            </p>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "rgba(245,181,66,0.10)",
                color: GOLD,
                border: "1px solid rgba(245,181,66,0.20)",
              }}
            >
              <CheckCircle2 className="h-3 w-3" />
              Verified {verifiedLabel(parking.lastVerified)}
            </span>
          </div>
        ) : (
          <NotPublished />
        )}
      </InfoRow>

      {/* 5. Tickets */}
      <InfoRow
        icon={<Ticket className="h-4.5 w-4.5" style={{ color: GOLD }} />}
        label="Tickets"
        isLast
      >
        {ticketUrl ? (
          <a
            href={ticketUrl}
            target="_blank"
            rel="nofollow noopener sponsored"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor: GOLD,
              color: BG_DARK,
            }}
          >
            Official athletics site
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <NotPublished />
        )}
      </InfoRow>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{
          backgroundColor: "rgba(255,255,255,0.02)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <a
          href="/stadiums"
          className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          Gameday guide
          <ArrowRight className="h-3 w-3" />
        </a>
        <a
          href="/watch"
          className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          How to watch
          <ArrowRight className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
