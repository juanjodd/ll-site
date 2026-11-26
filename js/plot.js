/* lloverllover — plot.js (v3.5/v3.6, Phases 17-18): ONE language for the rain picture,
   spoken by the map page and by the page per place.  The helpers, the colour ramp, the
   log scale, the paired day series (five closed days of BLACK observed beside their BLUE
   00z, then five live forecast days) and the all-cycles station table all live here, so
   a number or a colour can never mean two things on the same site.  It loads BEFORE
   app.js / station.js and owns the shared globals (DATA, I18N, LANG, ADV) — those
   scripts must never re-declare them. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const MODEL_ACTIVE = "ecmwf_ifs_0p25";
/* Cache-busting (plan §2.5): the HTML pages load these assets as `?v=SOMETHING`, and we
   reuse that own version for the i18n fetch, so bumping the tags is enough — otherwise a
   returning visitor keeps whatever the browser cached and never sees the new site.
   data.json is never cached at all: it changes with every pipeline run. */
const VER = (document.currentScript &&
  (document.currentScript.src.match(/[?&]v=([^&]+)/) || [])[1]) || "dev";

let DATA = null, I18N = null, LANG = localStorage.getItem("llo_lang") || "es";
/* v5.1: the site speaks two DEPTHS.  BASIC (the default) answers only "how much rain
   fell / will fall": the closed days show the measurement alone, today and the next
   four the word of the LATEST run — exactly what the balloon has always drawn, no
   forecast-against-observation comparison anywhere.  ADVANCED adds the verification
   layer for the curious: the archived forecast of EVERY cycle beside each measurement
   (the picture of v3.6…v5.0).  Like the language, the choice lives in localStorage
   ("llo_adv"), shared by the map page and the place pages.  Nothing about it is
   server-side: build.py bakes both layers into the JSONs and this flag only chooses
   what the bars and the table draw. */
let ADV = localStorage.getItem("llo_adv") === "1";

/* The two files every page needs: i18n travels with the code (?v=), the numbers never do. */
async function loadCommon() {
  [I18N, DATA] = await Promise.all([
    fetch(`js/i18n.json?v=${VER}`).then(r => r.json()),
    fetch("data.json", { cache: "no-store" }).then(r => r.json())]);
}

/* The static i18n sweep, shared by both pages: every [data-i18n*] text the
   dictionary owns.  The video-frame title only exists on the map page; the
   guard keeps the station page quiet about it. */
function applyStatic() {
  document.documentElement.lang = LANG;
  document.title = t("site_title");
  $$("[data-i18n]").forEach(e => { e.textContent = t(e.dataset.i18n); });
  $$("[data-i18n-ph]").forEach(e => { e.placeholder = t(e.dataset.i18nPh); });
  $$("[data-i18n-title]").forEach(e => { e.title = t(e.dataset.i18nTitle); });
  $$("[data-i18n-aria]").forEach(e => { e.setAttribute("aria-label", t(e.dataset.i18nAria)); });
  /* v5.1: the depth toggle shares the nav but is NOT a language — [data-lang] keeps
     the ES/EN pressed-state sweep to its own two buttons; #adv answers only to ADV */
  $$("#lang button[data-lang]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === LANG)));
  $$("#lang button[data-adv]").forEach(b => b.setAttribute("aria-pressed", String(ADV)));
  /* the player has no visible label any more (req. 8, v2.2), but its accessible
     name still follows the language */
  const vf = $("#video-frame");
  if (vf) vf.title = t("video_title");
}

/* v5.1: ONE binder for the depth toggle, used by both data pages.  The rerender
   callback redraws whatever the mode changes on that page (the card's series; the
   place page's series and table); applyStatic first, so the button's own label,
   title and pressed state speak again. */
function bindAdv(rerender) {
  $$("#lang button[data-adv]").forEach(b => b.addEventListener("click", () => {
    ADV = !ADV; localStorage.setItem("llo_adv", ADV ? "1" : "0");
    applyStatic(); rerender();
  }));
}

/* ---------- helpers ---------- */
const t = (k, ...args) => {
  let s = (I18N[LANG] && I18N[LANG][k]) || k;
  if (args.length) s = s.replace(/\{(\d+)\}/g, (_, i) => args[+i] ?? "");
  return s;
};
const locale = () => LANG === "es" ? "es-ES" : "en-GB";
/* v4.3 stamp formatters: the footer's three clocks, one voice.  No seconds, no ISO
   tails; the month name follows the page language ("22 nov" / "22 Nov"). */
const fmtStamp = (iso) => iso.slice(0, 16).replace("T", " ") + " UTC";
const fmtDayMon = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${new Date(y, m - 1, 15).toLocaleDateString(locale(), { month: "short" }).replace(/\.$/, "")}`; };
const num = (v, d = 1) => v == null ? "—"
  : v.toLocaleString(locale(), { maximumFractionDigits: d });
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/* A forecast is ONE thing everywhere on the site: an ordered array of calendar-day
   accumulations, index 0 = today (data.json contract, Phase 8).  Marker colour,
   directory amount, ranking and the bar plot all read these numbers through
   rainSum()/fcDays(), so they can never disagree. */
const fcDays = (st) => { const a = st.fc ? st.fc[MODEL_ACTIVE] : null; return Array.isArray(a) ? a : null; };
/* "MÁLAGA" -> "Málaga" — nothing on this site is ALL CAPS (req. 4) */
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
/* The where-line, one rule for the whole site (9th prompt): municipio, provincia and
   altitude — used by the card, the directory-free balloon head and the page per place.
   The municipio is left out when it would say something the name already says ("La Palma
   del Condado" is its own municipio) and when it is the provincia ("Málaga · 45 m", not
   "Málaga, Málaga"): the grey line names a place, it does not fill a form.  norm() folds
   accents and case, so none of those comparisons needs a table of exceptions. */
function whereLine(st) {
  const mun = st.mun && norm(st.mun) !== norm(st.name) && norm(st.mun) !== norm(st.prov)
    ? st.mun : "";
  const prov = titleCase(st.prov);
  return (mun ? `${mun}, ${prov}` : prov) +
    (st.alt != null ? ` · ${num(st.alt, 0)} m ${t("alt")}` : "");
}
const dayOfYearLong = (iso, year) => {   // ES "el 21 de noviembre de 2025", EN "21 November 2025"
  const [y, m, d] = iso.split("-").map(Number);
  const mon = new Date(y, m - 1, d).toLocaleDateString(locale(), { month: "long" });
  return t("day_of_year", d, LANG === "en" ? mon.charAt(0).toUpperCase() + mon.slice(1) : mon, year);
};

/* "2026-11-15" -> "15 nov" / "15 Nov", no timezone surprises: build from parts */
function fmtDay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(),
    { day: "numeric", month: "short" }).replace(/\.$/, "");
}
/* "Dom 22 nov" (v4.6, Juanjo; three letters since v4.7): the table's day column
   leads with the weekday.  No "hoy" mark — the series already wears that crown,
   and the raya says it.  Intl's short form is "dom." in some engines and "Mon"
   in others: strip the dot, raise the first letter. */
function fmtDayWd(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString(locale(), { weekday: "short" });
  const cap = wd.replace(/\.$/, "");
  return cap.charAt(0).toUpperCase() + cap.slice(1) + " " + fmtDay(iso);
}
const isoOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
/* The days the forecast covers, from the pipeline's own meta (never from the
   browser clock: the labels must match the numbers on disk). */
function fcDates() {
  const m = DATA.models[MODEL_ACTIVE] || {};
  if (Array.isArray(m.dates) && m.dates.length) return m.dates;
  const out = [], n = Math.max(...DATA.stations.map(s => (fcDays(s) || []).length), 1);
  for (let k = 0; k < n; k++) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + k);
    out.push(isoOf(d));
  }
  return out;
}
/* Weekday initial of an ISO date — index = getDay() (0 = Sunday), so the letters
   start wherever "today" happens to fall: L M M J V S D in Spanish. */
const dayInitial = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const set = I18N[LANG].day_initials;
  return (Array.isArray(set) && set.length === 7 ? set : ["D", "L", "M", "M", "J", "V", "S"])[new Date(y, m - 1, d).getDay()];
};
const isToday = (iso) => iso === isoOf(new Date());

/* Full-colour blue ramp (req. 2, v2.1): the map is muted instead, so the markers
   never get desaturated — pale blues would vanish against light tiles. */
function fcColor(mm) {
  if (mm == null || mm < 0.05) return "#b0b8bf";   // none — neutral slate
  if (mm < 1) return "#8ec7e6";                    // trace
  if (mm < 5) return "#4ba3d3";                    // light
  if (mm < 20) return "#1f78b4";                   // moderate
  return "#08519c";                                // heavy
}
const BANDS = [[0, "band_none"], [0.05, "band_trace"], [1, "band_light"],
               [5, "band_moderate"], [20, "band_heavy"]];

/* ---------- the numbers behind every picture ---------- */
/* The ONE total the whole site means: the sum of the forecast days (today … +4).
   Marker, card border, directory dot and bracket amount all come from it — the
   history (st.t) never touches it (req. 12 stays: live newest cycle, everywhere). */
const rainSum = (s) => (fcDays(s) || []).reduce((a, b) => a + (b || 0), 0);
const WET_MIN = 0.05;           // below this the ramp says "nada" → not listed either
/* Log height scale: a 30 l day must not be 300× the height of a 0,1 l day, yet a
   nearly dry week must still show which days were wetter.  Bar height is
   log10(v / WET_MIN) up to the wettest single day anywhere on the site — forecast
   days AND the remembered ones (v3.5: black and blue share ONE scale, so a tall
   black bar over a short blue one really means the gauges beat the morning's word) —
   rounded up to a band edge, so the picture is comparable between places and does
   not jump around on every refresh. */
let FC_MAX = 10;
function measureScale() {
  let mx = 0;
  for (const s of DATA.stations) {
    for (const v of (fcDays(s) || [])) if (v > mx) mx = v;
    for (const r of (s.t || [])) for (const v of r) if (v != null && v > mx) mx = v;
  }
  FC_MAX = [0.5, 1, 2, 5, 10, 20, 30, 50, 80, 120, 200, 300].find(x => x >= mx)
    || Math.ceil(mx);
}
const barFrac = (v) => !v || v <= 0 ? 0
  : Math.min(1, Math.max(0, Math.log10(v / WET_MIN) / Math.log10(FC_MAX / WET_MIN)));

/* ---------- v3.5/v3.6: the ten-day picture — five remembered, five ahead ----------
   ONE column per day; a PAST day (the five closed ones) carries a PAIR: the black
   bar is what the gauges closed it with (rain_daily.csv, first differences of the
   official year accumulations), the blue bar is the STABLE word that morning gave —
   the day's own archived 00z.  Today joins the five FORECAST columns: they come
   from the LIVE newest cycle and have no black side at all — a day that has not
   closed is not a missing measurement.  A day nobody could measure or archive is a
   "–" in its bar's colour: never a zero, never smeared.  The thin vertical rule at
   today splits memory from forecast (ten columns in total, five each side).
   Numbers ride the live columns everywhere (that is the headline the site was
   built for) and, on the place's own page (big=true), every bar; the rest whisper
   through their title.  v5.1: the blue half of a remembered PAIR is a comparison,
   so BASIC mode keeps the black bar alone; ADVANCED is what draws the pair. */
const OBS_COLOR = "#1f2937";     // the black of "what fell"
const DASH = "–";                // the em-dash-ish glyph of "no data"

function histDates() { return (DATA && DATA.hist && DATA.hist.vd) || []; }

function seriesCols(st) {
  const vd = histDates(), rows = Array.isArray(st.t) ? st.t : [];
  const f = fcDays(st), dates = f ? fcDates() : [];
  const cols = vd.map((d, i) => {
    const r = rows[i] || [];
    return { date: d, obs: r[0] ?? null, fc: r[1] ?? null, past: true };
  });
  if (f) for (let k = 0; k < dates.length; k++)
    cols.push({ date: dates[k], obs: null, fc: f[k], live: true, ahead: k });
  return cols;
}

function barsHtml(st, big = false) {
  const cols = seriesCols(st);   // v5.2: the balloon too — five remembered, five ahead
  if (!cols.length) return `<p class=hl>${t("fc_none")}</p>`;
  /* A paired bar is a THIN bar: its number never fits inside, so numbered bars carry
     it above (the old white-in-blue treatment died with the wide single bar). */
  const cell = (v, kind, numbered) => {
    if (v == null) return `<i class="fdash ${kind}" aria-hidden="true">${DASH}</i>`;
    const fr = barFrac(v);
    return `<i class="${kind === "obs" ? "obar" : "fbar"}${numbered ? " out" : " plain"}"` +
      ` style="height:${(fr * 100).toFixed(1)}%;background:${kind === "obs" ? OBS_COLOR : fcColor(v)}"` +
      (numbered ? `><b>${num(v)}</b></i>` : "></i>");
  };
  const html = cols.map(c => {
    const when = isToday(c.date) ? t("today") : c.live && c.ahead === 1 ? t("tomorrow") : fmtDay(c.date);
    const title = c.live
      ? `${when} · ${t("k_fc")} ${c.fc == null ? DASH : num(c.fc)}`
      : `${when} · ${t("k_obs")} ${c.obs == null ? DASH : num(c.obs)}` +
        (ADV ? ` · ${t("k_fc00")} ${c.fc == null ? DASH : num(c.fc)}` : "");
    const lab = dayInitial(c.date);   // 8th prompt: initials only, same as inicio — even big
    /* v5.1: in BASIC a remembered day is JUST the black bar — no morning word to
       compare it against (that is what the balloon has always shown for the live
       days; here the same restraint speaks for the past).  ADVANCED brings the
       pair back: black beside blue, gauge against the archived 00z. */
    /* v5.2: a track with ONE bar (a live day, or any past day in BASIC) wears .sgl
       and the bar fills the whole track — the pair's half-width slot is only
       reserved when the pair is actually drawn. */
    const pair = !c.live && ADV;
    return `<span class="fcday${isToday(c.date) ? " now" : ""}${c.live ? " live" : " past"}` +
      `" title="${title}">` +
      `<span class="fctrack${pair ? "" : " sgl"}">${c.live ? "" : cell(c.obs, "obs", big)}` +
      `${c.live || ADV ? cell(c.fc, "fc", big || c.live) : ""}</span>` +
      `<span class=fcwd>${lab}</span></span>`;
  }).join("");
  return `<span class=fcbars>${html}</span>`;
}

/* The table of a place (station page, v3.6; v5.1 speaks both depths).
   ADVANCED — the verification picture: rows from today backwards as far as the
   measured ledger reaches, and per row the measured day beside EVERY archived cycle
   whose whole days fully included that valid date — the 00, 06, 12 and 18 UTC runs
   of each of the four days before, plus the day's own 00z.  (A late run's partial
   day 0 never enters the archive, so a column here is always a promise about a WHOLE
   day.)  Days older than the five keep only what the build still ships in full (the
   measurement and the stable own-day 00z) — the rest draw "–".
   BASIC — no comparison: ONE number per day.  Today and the next four carry the word
   of the LATEST run (the balloon's numbers, read straight from data.json); the closed
   days carry what fell, as far back as the ledger remembers.  Two columns, no sideways
   scroll: on a phone it reads like the list of days it is.
   It reads table.json, not the balloon's slimmer t-rows; null = that cycle is not
   archived — a downtime the backfill could not mend yet — drawn "-", never a zero. */
function tableHtml(T, n, st) {
  if (!T || !Array.isArray(T.vd) || !T.rows || !Array.isArray(T.rows[n])) return "";
  const vd = T.vd, rows = T.rows[n];
  if (!ADV) {
    /* v5.2: THREE columns — the day, what fell, and the day's OWN archived 00z
       (the morning's promise about itself).  Future days have no rain to report:
       their Lluvia stays "–" and Pronóstico carries the live newest cycle. */
    const live = (st && fcDays(st)) || [], fdates = fcDates();
    const own00z = (r) => r && (r.length === 2 ? r[1] : r[4]);   // thin row or full row
    const body = [];
    /* the days ahead first (newest promise on top of the pile), then the row of
       today — whose number IS the live day 0 while the day is open — then memory */
    for (let k = Math.min(fdates.length, live.length) - 1; k >= 1; k--)
      body.push(`<tr><th scope=row>${fmtDayWd(fdates[k])}</th>` +
        `<td class=obs>${DASH}</td>` +
        `<td class=fcv title="${t("k_fc")} · ${t("fc_last")}">` +
        `${live[k] == null ? DASH : num(live[k])}</td></tr>`);
    for (let i = vd.length - 1; i >= 0; i--) {
      const r0 = rows[i] || [], v = r0[0], fc = own00z(r0);
      /* today's own 00z may not be archived yet while the day is open — then the
         live day 0 speaks for it; nobody's number is ever invented */
      const promise = fc != null ? fc : (isToday(vd[i]) ? live[0] : null);
      body.push(`<tr><th scope=row>${fmtDayWd(vd[i])}</th>` +
        `<td class=obs title="${t("k_obs")}">${v == null ? DASH : num(v)}</td>` +
        `<td title="${t("k_fc00")}">${promise == null ? DASH : num(promise)}</td></tr>`);
    }
    const head = `<tr><th scope=col>${t("th_day")}</th><th scope=col>${t("th_obs")}</th>` +
      `<th scope=col>${t("th_fc")}</th></tr>`;
    return `<div class=rainwrap><table class="rain simple"><thead>${head}</thead>` +
      `<tbody>${body.join("")}</tbody></table></div>`;
  }
  /* Cell ORDER is the build's (6th + 7th prompts): the day, what fell, then FIVE
     groups — the day's OWN runs first, then 1…4 days before — and every group
     reads 18z 12z 06z 00z, newest hour first.  The own-day 06/12/18z numbers are
     BUILT across cycles by the backfill (each 6-hour piece from the freshest run
     that can speak for it); nothing is reordered here, index k is cell k. */
  const body = [];
  for (let i = vd.length - 1; i >= 0; i--) {
    const r0 = rows[i] || [];
    /* the extended memory rows arrive THIN (measured + own-day 00z only): seat the
       00z in its own group's last column and let the cycle columns it never had
       read "–" — truthfully: those runs are not in the file. */
    const r = r0.length === 2 ? [r0[0], null, null, null, r0[1]] : r0;
    body.push(`<tr><th scope=row>${fmtDayWd(vd[i])}</th>` +
      r.map((v, k) => `<td${k === 0 ? " class=obs" : ""}>${v == null ? DASH : num(v)}</td>`)
          .join("") + "</tr>");
  }
  const HOURS = "<th>18z</th><th>12z</th><th>06z</th><th>00z</th>";
  const group = (label) => `<th colspan=4>${label}</th>`;
  const head = `<tr><th scope=col rowspan=2>${t("th_day")}</th>` +
    `<th scope=col rowspan=2>${t("th_obs")}</th>` +
    group(t("th_day0")) +
    [1, 2, 3, 4].map(d => group(t(d === 1 ? "th_ago1" : "th_ago", d))).join("") +
    `</tr><tr class=hrs>${HOURS.repeat(5)}</tr>`;
  return `<div class=rainwrap><table class=rain><thead>${head}</thead>` +
    `<tbody>${body.join("")}</tbody></table></div>`;
}

function accRows(st) {
  /* The two hydrological-year accumulations (7th prompt: back on the page per
     place).  Same aligned-numbers treatment as the card — but here only the
     memory lines: the forecast total lives in the bars above. */
  const L = t("litres");
  const shown = (v) => v == null ? "—" : num(v);       // a missing value never says "— litros"
  const D0 = (fcDates()[0] || "");
  const hyYear = +D0.slice(0, 4) - (D0.slice(5, 7) < "10" ? 1 : 0);
  const lastYear = dayOfYearLong(D0, hyYear - 1);
  const qw = Math.max(...[st.acc, st.accP].map(v => shown(v).length));
  const row = (v, rest) => `<p class="qrow"><b>${shown(v)}</b>` +
    `<i> ${v == null ? "" : L + " "}${rest}</i></p>`;
  return `<div class=q style="--qw:${qw}ch">` +
    row(st.acc, t("since_1_oct")) +
    ("accP" in st ? row(st.accP, t("between_dates", t("oct1"), lastYear)) : "") +
    `</div>`;
}
