/* lloverllover — plot.js (v3.5, Phase 17): ONE language for the rain picture, spoken by
   the map page and by the page per place.  The helpers, the colour ramp, the log scale,
   the paired day series (BLACK observed bar beside its BLUE forecast bar, ten days back)
   and the station table all live here, so a number or a colour can never mean two things
   on the same site.  It loads BEFORE app.js / station.js and owns the shared globals
   (DATA, I18N, LANG) — those scripts must never re-declare them. */
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
  $$("#lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === LANG)));
  /* the player has no visible label any more (req. 8, v2.2), but its accessible
     name still follows the language */
  const vf = $("#video-frame");
  if (vf) vf.title = t("video_title");
}

/* ---------- helpers ---------- */
const t = (k, ...args) => {
  let s = (I18N[LANG] && I18N[LANG][k]) || k;
  if (args.length) s = s.replace(/\{(\d+)\}/g, (_, i) => args[+i] ?? "");
  return s;
};
const locale = () => LANG === "es" ? "es-ES" : "en-GB";
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
/* "2026-11-15" -> "15 nov" / "15 Nov", no timezone surprises: build from parts */
function fmtDay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(),
    { day: "numeric", month: "short" }).replace(/\.$/, "");
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

/* ---------- v3.5: ten days of memory beside the forecast (Phase 17) ----------
   ONE column per day carries a PAIR: the black bar is what the gauges closed the
   day with (rain_daily.csv, first differences of the official year accumulations),
   the blue bar is what was forecast for it — for a PAST day the archived own-morning
   00z (the stable word that morning gave), for today and the days ahead the LIVE
   newest cycle.  A day nobody could measure or archive is a "–" in its bar's colour:
   never a zero, never smeared across neighbours.  The thin vertical rule at today
   splits memory from forecast.  Numbers ride the live columns everywhere (that is
   the headline the site was built for) and, on the place's own page (big=true),
   every bar; the rest whisper through their title. */
const OBS_COLOR = "#1f2937";     // the black of "what fell"
const DASH = "–";                // the em-dash-ish glyph of "no data"

function histDates() { return (DATA && DATA.hist && DATA.hist.vd) || []; }

function seriesCols(st) {
  const vd = histDates(), rows = Array.isArray(st.t) ? st.t : [];
  const f = fcDays(st), dates = f ? fcDates() : [];
  const cols = vd.map((d, i) => {
    const r = rows[i] || [];
    const live = !!(f && dates[0] === d);            // today: the newest cycle wins
    return { date: d, obs: r[0] ?? null, fc: live ? f[0] : (r[1] ?? null), live, past: i < vd.length - 1 };
  });
  if (f) for (let k = 1; k < dates.length; k++)
    cols.push({ date: dates[k], obs: null, fc: f[k], live: true, past: false, ahead: k });
  return cols;
}

function barsHtml(st, big = false) {
  const cols = seriesCols(st);
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
    const when = isToday(c.date) ? t("today") : c.ahead === 1 ? t("tomorrow") : fmtDay(c.date);
    /* A day that has not happened yet has no OBSERVED side at all — not even a "–":
       nothing is missing there, the day simply has not fallen.  Memory (and today,
       still being measured) pairs the two bars. */
    const obs = c.ahead ? "" : cell(c.obs, "obs", big);
    const title = c.ahead
      ? `${when} · ${t("k_fc")} ${c.fc == null ? DASH : num(c.fc)}`
      : `${when} · ${t("k_obs")} ${c.obs == null ? DASH : num(c.obs)}` +
        ` · ${c.live ? t("k_fc") : t("k_fc00")} ${c.fc == null ? DASH : num(c.fc)}`;
    const lab = big ? `${dayInitial(c.date)} ${+c.date.slice(8)}` : dayInitial(c.date);
    return `<span class="fcday${isToday(c.date) ? " now" : ""}${c.live ? " live" : " past"}` +
      `" title="${title}">` +
      `<span class=fctrack>${obs}${cell(c.fc, "fc", big || c.live)}</span>` +
      `<span class=fcwd>${lab}</span></span>`;
  }).join("");
  return `<span class=fcbars>${html}</span>`;
}

/* The table of a place (station page): rows from TODAY backwards five days — the
   measured day beside the archived 00z forecasts ISSUED for that same valid day
   0, 1, 2, 3 and 4 days before (the lead is valid minus issue), straight from st.t,
   the very numbers the balloon's past pairs come from. */
const TABLE_DAYS = 6;
function tableHtml(st) {
  const vd = histDates(), rows = Array.isArray(st.t) ? st.t : [];
  if (!vd.length) return "";
  const body = [];
  for (let i = vd.length - 1; i >= Math.max(0, vd.length - TABLE_DAYS); i--) {
    const r = rows[i] || [];
    body.push(`<tr><th scope=row>${fmtDay(vd[i])}${i === vd.length - 1 ? " · " + t("today") : ""}</th>` +
      r.map((v, k) => `<td${k === 0 ? " class=obs" : ""}>${v == null ? DASH : num(v)}</td>`).join("") +
      "</tr>");
  }
  const heads = [t("th_obs"), t("th_lead0"), ...[1, 2, 3, 4].map(d => t("th_lead", d))];
  return `<table class=rain><thead><tr><th scope=col>${t("th_day")}</th>` +
    heads.map(h => `<th scope=col>${h}</th>`).join("") +
    `</tr></thead><tbody>${body.join("")}</tbody></table>`;
}
