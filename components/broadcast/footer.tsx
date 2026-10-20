import { ArrowUpRight, ChevronDown, ShieldCheck } from "lucide-react";
import { ApexLogo } from "./primitives";

const columns = [
  {
    title: "Product",
    links: [
      ["Scores & schedules", "/scores"],
      ["All teams", "/teams"],
      ["Divisions", "/conferences"],
      ["X & Ys film room", "/x-and-ys"],
      ["Injury report", "/injuries"],
      ["Fantasy decision boards", "/fantasy-desk"],
      ["Published-pick ledger", "/dfs"],
      ["NFL transactions", "/transactions"],
      ["Season yardage leaders", "/stats"],
      ["Newsletter", "/newsletter"],
    ],
  },
  {
    title: "Trust",
    links: [
      ["Our methodology", "/methodology"],
      ["Data sources", "/data-sources"],
      ["Corrections", "/corrections"],
      ["Privacy & terms", "/privacy"],
      ["Responsible gaming", "/responsible-gaming"],
    ],
  },
  {
    title: "Business",
    links: [
      ["About Duke Fantasy", "/about"],
      ["Advertise", "/advertise"],
      ["Partnerships", "/partnerships"],
      ["Media kit", "/media-kit"],
      ["More Sports ↗", "https://sports-always.com"],
    ],
  },
  {
    title: "Contact",
    links: [
      ["hello@dukefantasy.com", "mailto:hello@dukefantasy.com"],
      ["admin@dukefantasy.com", "mailto:admin@dukefantasy.com"],
      ["media@dukefantasy.com", "mailto:media@dukefantasy.com"],
      ["socials@dukefantasy.com", "mailto:socials@dukefantasy.com"],
      ["privacy@dukefantasy.com", "mailto:privacy@dukefantasy.com"],
    ],
  },
];

export function BroadcastFooter() {
  return (
    <footer className="apex-footer">
      <div className="apex-container">
        <div className="apex-footer-main">
          <div className="apex-footer-brand">
            <ApexLogo />
            <p>
              For the way you follow the game.
              <br />
              Every team. Every Sunday.
            </p>
            <span>
              <ShieldCheck size={16} aria-hidden="true" />
              Independent. Source-aware. Fan-first.
            </span>
          </div>
          <div className="apex-footer-columns apex-footer-columns--desktop">
            {columns.map((column) => (
              <div key={column.title}>
                <h2>{column.title}</h2>
                {column.links.map(([label, href]) => (
                  <a key={href} href={href}>
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="apex-footer-accordion">
            {columns.map((column) => (
              <details key={column.title}>
                <summary>
                  <span>{column.title}</span>
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div>
                  {column.links.map(([label, href]) => (
                    <a key={href} href={href}>
                      {label}
                    </a>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
        <div className="apex-footer-bottom">
          <span>© 2026 Duke Fantasy. All rights reserved.</span>
          <div>
            <a href="/terms">Terms</a>
            <a href="/affiliate-disclosure">Affiliate disclosure</a>
            <a href="/data-sources">
              2026 NFL dataset
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
