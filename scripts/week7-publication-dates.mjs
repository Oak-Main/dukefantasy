// Date.parse alone normalizes impossible days (for example, February 30).
// Require an exact UTC round trip before comparing date-only metadata.
export function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Evidence timestamps require an explicit timezone and a real calendar day. */
export function isEvidenceTimestamp(value) {
  return typeof value === "string" && /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) && isCalendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

export function validateDesignationPhase(row) {
  if (row.designation_phase == null) return;
  if (!["injury_report", "in_game"].includes(row.designation_phase) || row.published_status == null || (row.designation_phase === "in_game" && row.published_status === "NO_DESIGNATION")) {
    throw new Error("Invalid injury status phase; in-game status must be distinct from an injury-report designation");
  }
  if (row.designation_phase === "in_game" && (typeof row.game_id !== "string" || !row.game_id || row.status_scope !== "remainder_of_game")) {
    throw new Error("In-game injury status requires game identity and remainder-of-game scope");
  }
}

export function validatePublicationDates(after, manifest, now = new Date()) {
  const reportWeek = after.injury.week ?? after.editorial.week ?? 7;
  const todayEastern = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  if (!isCalendarDate(manifest.sourceAsOf) || manifest.sourceAsOf > todayEastern) {
    throw new Error("Invalid or future release source date");
  }
  for (const row of after.editorial.reserveStatuses ?? []) {
    if (row.asOf != null && (!isCalendarDate(row.asOf) || row.asOf > todayEastern || row.asOf > manifest.sourceAsOf || !isEvidenceTimestamp(row.checkedAt) || Date.parse(row.checkedAt) > now.getTime())) {
      throw new Error("Dated reserve status needs a real nonfuture verification date and retrieval timestamp");
    }
  }
  for (const row of after.injury.watch) {
    validateDesignationPhase(row);
    if (row.published_status != null && (!["OUT", "DOUBTFUL", "QUESTIONABLE", "NO_DESIGNATION"].includes(row.published_status) || row.designation_week !== reportWeek || !isCalendarDate(row.designation_date) || row.designation_date > todayEastern || row.designation_date > manifest.sourceAsOf)) {
      throw new Error("Official designations need the correct dated report week");
    }
  }
  for (const [module, source] of Object.entries(after.editorial.moduleSources)) {
    // null/absent means no completed review, as with the untouched inactives module.
    if (source.sourceAsOf != null && (!isCalendarDate(source.sourceAsOf) || source.sourceAsOf > todayEastern)) {
      throw new Error(`${module}: invalid or future source date`);
    }
  }
}
