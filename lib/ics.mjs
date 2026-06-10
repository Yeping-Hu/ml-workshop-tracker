/**
 * Minimal iCalendar (RFC 5545) generator for deadline feeds.
 * Each deadline becomes an all-day event on its wall-clock date, with
 * 7-day and 1-day alarms, so subscribers get reminders in any calendar app.
 */

function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding: max 75 octets per line; continuation lines start with a space. */
function fold(line) {
  const out = [];
  let s = line;
  while (Buffer.byteLength(s, 'utf8') > 73) {
    // Find the largest prefix <= 73 bytes that doesn't split a UTF-8 char.
    let cut = Math.min(s.length, 73);
    while (Buffer.byteLength(s.slice(0, cut), 'utf8') > 73) cut--;
    out.push(s.slice(0, cut));
    s = ' ' + s.slice(cut);
  }
  out.push(s);
  return out.join('\r\n');
}

function ymdCompact(ymd) {
  return ymd.replaceAll('-', '');
}

function nextDayCompact(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + 86_400_000);
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${next.getUTCFullYear()}${mm}${dd}`;
}

/**
 * Build an .ics document.
 * @param {string} calendarName
 * @param {Array<{uid:string, dateYmd:string, summary:string, description?:string, url?:string}>} events
 * @param {Date} now  build timestamp (DTSTAMP)
 */
export function buildIcs(calendarName, events, now = new Date()) {
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ai-workshop-tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:UTC',
  ];
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeText(ev.uid)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${ymdCompact(ev.dateYmd)}`,
      `DTEND;VALUE=DATE:${nextDayCompact(ev.dateYmd)}`,
      `SUMMARY:${escapeText(ev.summary)}`,
    );
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    if (ev.url) lines.push(`URL:${escapeText(ev.url)}`);
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText('Deadline in 7 days: ' + ev.summary)}`,
      'TRIGGER:-P7D',
      'END:VALARM',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText('Deadline tomorrow: ' + ev.summary)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
