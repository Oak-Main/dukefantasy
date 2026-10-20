"use client";

import { useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import {
  ArrowRight,
  ChevronDown,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { BroadcastTeam } from "@/lib/homepage";
import { ApexLogo, TeamMark } from "./primitives";

const navigation = [
  { label: "Scores", href: "/scores" },
  { label: "Teams", href: "/teams" },
  { label: "Schedule", href: "/schedule" },
  { label: "Divisions", href: "/conferences" },
  { label: "Watch", href: "/watch" },
  { label: "Injuries", href: "/injuries" },
  { label: "X & Ys", href: "/x-and-ys" },
  { label: "Fantasy", href: "/fantasy-desk" },
  { label: "More Sports ↗", href: "https://sports-always.com", external: true },
];

interface HeaderProps {
  teams: readonly BroadcastTeam[];
  activePath: string;
  cleanMode: boolean;
  onCleanModeChange: (enabled: boolean) => void;
}

export function BroadcastHeader({
  teams,
  activePath,
  cleanMode,
  onCleanModeChange,
}: HeaderProps) {
  const [panel, setPanel] = useState<"teams" | "search" | "menu" | null>(null);
  const [query, setQuery] = useState("");
  const filteredTeams = useMemo(
    () =>
      teams.filter((team) =>
        `${team.name} ${team.abbreviation} ${team.conference}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [teams, query],
  );
  const conferences = [
    ...new Set(filteredTeams.map((team) => team.conference)),
  ].sort((a, b) => a.localeCompare(b));
  const triggerRef = useRef<HTMLElement | null>(null);
  const openPanel = (next: typeof panel) => {
    triggerRef.current = document.activeElement as HTMLElement;
    setQuery("");
    setPanel(next);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="apex-header">
        <div className="apex-header-inner apex-container">
          <ApexLogo />
          <nav className="apex-primary-nav" aria-label="Primary navigation">
            {navigation.map((item) =>
              item.href === "/teams" ? (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => openPanel("teams")}
                  aria-haspopup="dialog"
                  aria-expanded={panel === "teams"}
                  className={
                    activePath.startsWith("/teams") ? "is-active" : undefined
                  }
                >
                  Teams
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
              ) : "external" in item && item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--primary)" }}
                >
                  {item.label}
                </a>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={
                    activePath.startsWith(item.href) ? "page" : undefined
                  }
                  className={
                    activePath === "/" && item.href === "/scores"
                      ? "is-active"
                      : undefined
                  }
                >
                  {item.label}
                </a>
              ),
            )}
          </nav>
          <div className="apex-header-actions">
            <button
              className="apex-icon-button"
              type="button"
              aria-label="Search teams and Duke Fantasy"
              onClick={() => openPanel("search")}
            >
              <Search size={20} aria-hidden="true" />
            </button>
            <div className="apex-clean-control">
              <label htmlFor="apex-clean-mode">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>Clean Mode</span>
              </label>
              <Switch.Root
                id="apex-clean-mode"
                className="apex-switch"
                checked={cleanMode}
                onCheckedChange={onCleanModeChange}
                aria-label="Clean Mode"
                aria-describedby="clean-mode-description"
              >
                <Switch.Thumb className="apex-switch-thumb" />
              </Switch.Root>
              <span id="clean-mode-description" className="sr-only">
                Hides betting offers and DFS market context. Turning off
                opens an optional analysis disclosure.
              </span>
            </div>
            <button
              className="apex-icon-button apex-mobile-menu-button"
              type="button"
              aria-label="Open navigation menu"
              onClick={() => openPanel("menu")}
            >
              <Menu size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <Dialog.Root
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="apex-dialog-overlay" />
          <Dialog.Content
            className={`apex-menu-panel${panel === "search" ? " apex-menu-panel--search" : ""}`}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              triggerRef.current?.focus();
            }}
          >
            <div className="apex-menu-heading">
              <div>
                <Dialog.Title className="font-display">
                  {panel === "search" ? "Find your edge." : "Find your team."}
                </Dialog.Title>
                <Dialog.Description>
                  32 teams. Two conferences. Eight divisions. One place.
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="apex-icon-button"
                aria-label="Close menu"
              >
                <X size={24} aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div className="apex-search-field">
              <Search size={20} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search a team or division…"
                aria-label="Search teams or divisions"
                autoComplete="off"
              />
            </div>
            {panel === "menu" && (
              <nav className="apex-drawer-nav" aria-label="All navigation">
                {navigation.map((item) => (
                  <a
                    href={item.href}
                    key={item.href}
                    {...("external" in item && item.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {item.label}
                    <ArrowRight size={16} aria-hidden="true" />
                  </a>
                ))}
              </nav>
            )}
            <div className="apex-menu-results" aria-live="polite">
              <span className="sr-only">
                {filteredTeams.length} teams found
              </span>
              {filteredTeams.length === 0 ? (
                <p className="apex-empty">
                  No teams found for “{query}”. Try a team name, city, or division.
                </p>
              ) : (
                <div className="apex-conference-grid">
                  {conferences.map((conference) => (
                    <section key={conference}>
                      <h3 className="apex-eyebrow">{conference}</h3>
                      <div className="apex-conference-teams">
                        {filteredTeams
                          .filter((team) => team.conference === conference)
                          .map((team) => (
                            <a href={`/teams/${team.slug}`} key={team.slug}>
                              <TeamMark team={team} size="xs" />
                              <span>{team.shortName}</span>
                            </a>
                          ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
            <a
              className="apex-text-link apex-menu-all"
              href={
                panel === "search" && query.trim()
                  ? `/search?q=${encodeURIComponent(query.trim())}`
                  : panel === "search"
                    ? "/search"
                    : "/teams"
              }
            >
              {panel === "search"
                ? "Search all teams"
                : `Explore all ${teams.length} NFL teams`}
              <ArrowRight size={16} aria-hidden="true" />
            </a>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
