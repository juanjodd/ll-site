/* lloverllover — app.js  (vanilla JS + Leaflet only; plan.md Phase 7 / reqs 2-9)
   v3.5: everything about numbers, colours and the paired day series lives in plot.js,
   loaded BEFORE this file — the map page adds the legend, the card, the directory,
   the search, the balloons and the video on top of that one shared language. */
"use strict";

/* The intro video lives in index.html (official embed markup): it is on the page
   with its src already set, so it shows without waiting for any script. */

let map = null, markers = {}, selected = null;

/* The static i18n sweep, applyStatic(), lives in plot.js — both pages run it. */

function haversine(a, b, c, d) {
  const R = 6371, r = Math.PI / 180;
  const h = Math.sin((c - a) * r / 2) ** 2 +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const nearest = (lat, lon) => DATA.stations.reduce(
  (best, s) => { const d = haversine(lat, lon, s.lat, s.lon);
    return d < best.d ? { s, d } : best; },
  { s: DATA.stations[0], d: 1e18 });

/* ---------- which place the page opens with (req. 10, v2.3 / v2.4) ----------
   Nearest to the visitor when the browser ALREADY has their position **and that
   place is within 100 km of it** — a "nearest" 300 km away says more about the
   map than about the visitor's weather, so we keep the default instead.  The
   default is the wettest place of the forecast, ties broken by what has actually
   fallen this hydrological year, then by station number so the answer is the
   same in every browser.  (v2.4 dropped the last-year tie-break: the Guadalquivir
   report has no last-year figure, and a chain both networks can answer is the
   only honest one.) */
const NEAR_MAX_KM = 100;
function wettestPlace() {
  return [...DATA.stations].sort((a, b) =>
    rainSum(b) - rainSum(a) ||
    (b.acc ?? -1) - (a.acc ?? -1) ||
    a.n - b.n)[0];
}
/* No surprise permission dialog: with the locate button gone (v2.3.1) the page NEVER asks
   for the location — it only quietly uses one the visitor has already granted to this site,
   to open on their nearest place. */
async function positionIfAlreadyAllowed() {
  if (!navigator.geolocation) return null;
  try {
    const p = navigator.permissions && await navigator.permissions.query({ name: "geolocation" });
    if (!p || p.state !== "granted") return null;
  } catch (e) { return null; }
  return await new Promise(res => navigator.geolocation.getCurrentPosition(
    pos => res({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => res(null), { timeout: 5000, maximumAge: 600000, enableHighAccuracy: false }));
}
async function selectByLocation() {
  const here = await positionIfAlreadyAllowed();
  if (!here) return;
  const near = nearest(here.lat, here.lon);
  /* v2.4: only upgrade when that nearest place is genuinely close by; at 300 km
     the wettest-place default carries more useful weather than a distant "near" */
  /* v3.2: the same rule as the arrival — CHOOSE it (card + emphasised marker), but open
     nothing and pan nowhere.  A visitor landing on their own place is not owed a popup. */
  if (near.d <= NEAR_MAX_KM) select(near.s, false, false);
}

/* ---------- rendering ---------- */
/* The video popup must cover everything EXCEPT the page header, so the
   "lloverllover" title is never hidden: measure the header and hand it to CSS. */
function headerGap() {
  const h = $("header");
  const px = h ? Math.round(h.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty("--head", (px || 74) + "px");
}

/* The legend, and the RANGE behind each word (v3.1): hover a chip and a balloon says
   "5 – 20 l previstos en 5 días".  Two rules keep this honest:
   (a) the numbers are read back out of BANDS — the very table fcColor() paints from — so a
       label can never promise a band the map does not actually draw;
   (b) the text always says 5 DÍAS, because these bands are a FIVE-DAY total.  They are NOT
       AEMET's 24-hour categories, and a reader who knows AEMET will look for them here. */
const bandNum = (v) => num(v, v < 1 ? 2 : 1);      // 0,05 must not round to 0,1
function bandRange(i) {
  const u = t("litre_short");
  const hi = i + 1 < BANDS.length ? BANDS[i + 1][0] : null;
  if (hi === null) return t("range_over", bandNum(BANDS[i][0]), u);
  if (i === 0) return t("range_under", bandNum(hi), u);
  return `${bandNum(BANDS[i][0])} – ${bandNum(hi)} ${u}`;
}

function renderLegend() {
  const days = fcDates().length;
  $("#legend").innerHTML = `<b>${t("legend_title")}</b>` +
    BANDS.map(([lo, key], i) => {
      const range = `${bandRange(i)} ${t("in_days", days)}`;
      return `<span class=chip tabindex=0 title="${range}">` +
        `<i style="background:${fcColor(lo + 0.01)}"></i>${t(key)}` +
        `<em class=range>${range}</em></span>`;
    }).join("");
  /* A native title tooltip is a MOUSE thing, and this page is read on phones (req. 9), so
     v3.2 adds the same range as a bubble that a TAP (or Enter/Space, or keyboard focus)
     reveals — one open at a time, closed by tapping again or moving away.  No `:hover` rule
     shows it: on a desktop the title already speaks, and two tooltips for one word is noise. */
  $$("#legend .chip").forEach(chip => {
    const toggle = () => {
      const was = chip.classList.contains("open");
      $$("#legend .chip.open").forEach(o => o.classList.remove("open"));
      if (!was) chip.classList.add("open");
    };
    chip.addEventListener("click", toggle);
    chip.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      else if (e.key === "Escape" && chip.classList.contains("open")) {
        chip.classList.remove("open");
        e.stopPropagation();          // the bubble was the topmost thing: don't also shut the video
      }
    });
    chip.addEventListener("blur", () => chip.classList.remove("open"));
  });
}

/* The detail lines (req. 3, v2.3 / v2.4 / v2.4.1): as few words as possible, no station
   numbers, no headings.  First the 5-day picture, then what it adds up to, then the
   observed accumulation of the hydrological year — and v2.4.1 adds the third line back:
   the same period LAST year, drawn only where a source publishes it (Hidrosur's
   comparada does; the Guadalquivir bulletin does not).  A CHG card simply has one line
   less — the asymmetry is the sources', not the site's.  The quantities share one
   column, so the numbers line up BY THEIR LAST DIGIT and every line of words
   starts at the same x (see .q in style.css):
      ▮▮▁▂▃   L M M J V
       28,8   litros previstos en 5 días
      185,6   litros desde 1 oct
      139,2   litros entre 1 oct y 19 nov de 2025                      */
function detailLines(st, balloon = false) {
  const dates = fcDates(), n = dates.length;
  const L = t("litres");
  /* v2.4.1: presence of the accP KEY in the data is the contract — build.py ships it
     for exactly the stations whose source carries last year, never for the others. */
  const hasP = "accP" in st;
  const D0 = dates[0] || "";
  const hyYear = +D0.slice(0, 4) - (D0.slice(5, 7) < "10" ? 1 : 0);
  const lastYear = t("day_of_year", fmtDay(D0), hyYear - 1);
  const shown = (v) => v == null ? "—" : num(v);        // a missing value never says "— litros"
  /* the number column is as wide as the widest number of THIS place (in digits: `ch`
     is one tabular digit, so the box can never clip what goes in it) */
  const qw = Math.max(...[rainSum(st), st.acc, st.accP].map(v => shown(v).length));
  const row = (v, rest, cls = "") => `<p class="qrow${cls}"><b>${shown(v)}</b>` +
    `<i> ${v == null ? "" : L + " "}${rest}</i></p>`;   // the space is for text, CSS drops it
  /* ES reads "28,8 litros previstos en 5 días" (v2.3): the number is a forecast, and
     Juanjo asked that the word say so.  v3.7: the balloon's series shows the five live
     days only (no scrollbars in a balloon); the card keeps the whole 5+5. */
  return `<p class=hl>${barsHtml(st, false, balloon)}</p><div class=q style="--qw:${qw}ch">` +
    row(rainSum(st), t("in_days", n), " tot") +
    row(st.acc, t("since_1_oct")) +
    (hasP ? row(st.accP, t("between_dates", t("oct1"), lastYear)) : "") + `</div>`;
}

function popupHtml(st) {
  /* the name is a link to the place's page (6th prompt) */
  return `<b><a href="station.html?n=${st.n}" title="${t("goto_hint")}">${st.name}</a></b>` +
    detailLines(st, true);
}

/* The card (v2.3): the percentages are GONE — Juanjo found them confusing, and the two
   accumulation numbers already tell the story.  The Hidrosur link moved from its own
   paragraph to the end of the province · altitude line, where it belongs: that line is
   about WHERE this place is, and the ficha is the full version of the same information.
   v3.5: the NAME is now a door, not a gesture — it opens the place's own page (the ten
   days, the table, the zoomed map), exactly like a directory row; "ver en el mapa" was
   the old answer to a question this page now answers better. */
function renderCard(st) {
  if (!st) { $("#card").innerHTML = `<p class=hint>${t("select_hint")}</p>`; return; }
  const col = fcColor(rainSum(st));          // same 5-day total as the marker and the list
  const where = titleCase(st.prov) + (st.alt != null ? " · " + num(st.alt, 0) + " m " + t("alt") : "");
  const link = st.url
    ? `<a href="${st.url}" target=_blank rel="noopener" class=hidro>${t("station_link")}</a>` : "";
  $("#card").innerHTML = `
     <h2 class=goto style="border-color:${col}"><a href="station.html?n=${st.n}"
        title="${t("goto_hint")}">${st.name}</a></h2>
    ${detailLines(st)}
    <p class="meta">${where}${link}</p>`;
}

/* Directory (req. 5, v2.2): a live list of the places where rain IS forecast —
   rebuilt from the current numbers on every render, so it shrinks and reorders
   itself with each forecast.  Two levels only: provinces, ranked by their
   heaviest place, and inside each province its places from wettest to driest.
   A place is listed when its 5-day total reaches WET_MIN — the same cut the colour
   ramp calls "nada", so a row never shows a grey dot or "(0 l)".  Provinces are
   OPEN by default: the point of this list is to be read without hunting. */
function renderDirectory() {
  const dot = (mm) => `<span class=dot style="background:${fcColor(mm)}"></span>`;
  /* the amount in brackets: compact, and it reads as one line per place */
  const val = (x) => `<span class=val>(${num(x)} ${t("litre_short")})</span>`;
  /* v3.5 (Juanjo): a row's NAME is a door — it opens the place's own page. */
  const row = (s) => `<li data-n="${s.n}"><a href="station.html?n=${s.n}" title="${t("goto_hint")}">` +
    `${dot(rainSum(s))}<span class=nm>${s.name}</span>${val(rainSum(s))}</a></li>`;

  const wet = DATA.stations.filter(s => rainSum(s) >= WET_MIN);
  if (!wet.length) {
    $("#directory").innerHTML = `<p class=hint>${t("dir_none")}</p>`;
    return;
  }
  const byProv = {};
  for (const s of wet) (byProv[s.prov] ||= []).push(s);

  const provHtml = Object.keys(byProv)
    .map(p => ({ name: p,
      list: byProv[p].sort((x, y) => rainSum(y) - rainSum(x) || x.name.localeCompare(y.name, "es")) }))
    /* a province ranks by the rain of its wettest place */
    .sort((a, b) => rainSum(b.list[0]) - rainSum(a.list[0]) || a.name.localeCompare(b.name, "es"))
    .map(({ name: p, list }) =>
      `<details class=prov open><summary>${titleCase(p)} <span class=val>(${list.length} · ${num(rainSum(list[0]))} ${t("litre_short")})</span></summary>
        <ul>${list.map(row).join("")}</ul></details>`);

  $("#directory").innerHTML = provHtml.join("");
  /* v3.5: the rows are plain links now (station.html?n=…) — no click listener, and
     middle-click / "open in new tab" work because they always did what they look like. */
}

/* ---------- search: every place of the network, rain or none (req. 9, v2.3) ----------
   A single search box, shown directly (v2.3.1: no reveal button) on the TITLE line, top
   right beside the ES|EN toggle (v2.3.2).  It looks through ALL the places - including the
   ones with no forecast rain, which the directory does not list - by name, municipality or
   province, and picking a result selects that place.  The results DROP DOWN over the page
   (`position:absolute` above the video), so nothing below ever shifts; headerGap() still
   measures the header because the video popup has to keep it in the clear. */
const Q_MAX = 8;
let qSel = -1;

/* The field is always visible (no button); these two only manage the RESULTS dropdown
   under it, and reset the query.  clearSearch() empties everything; it is what running a
   pick or pressing Escape does.  headerGap() is re-measured because the dropdown changes
   the header's height, and the video popup must keep the title in the clear. */
function clearSearch() {
  $("#qhits").innerHTML = "";
  $("#q").value = "";
  qSel = -1;
  headerGap();
}

/* Relevance order: exactly this name, then a name or municipio that starts with it, then
   anywhere in name / municipio / province — alphabetically inside each group, and dry
   places are in it just as much as wet ones. */
function searchPlaces(raw) {
  const q = norm((raw || "").trim());
  if (!q) return [];
  const rank = (s) => {
    const n = norm(s.name), m = norm(s.mun || ""), p = norm(titleCase(s.prov));
    if (n === q || m === q) return 0;
    if (n.startsWith(q) || m.startsWith(q)) return 1;
    if (n.includes(q) || m.includes(q) || p.includes(q)) return 2;
    return -1;
  };
  return DATA.stations.map(s => ({ s, r: rank(s) })).filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.s.name.localeCompare(b.s.name, "es"))
    .slice(0, Q_MAX).map(x => x.s);
}

function renderHits(hits, raw) {
  const ul = $("#qhits");
  if (!(raw || "").trim()) { ul.innerHTML = ""; qSel = -1; return hits; }
  if (!hits.length) {
    ul.innerHTML = `<li class=qnone>${t("search_none")}</li>`;
    headerGap(); return hits;
  }
  const dot = (mm) => `<span class=dot style="background:${fcColor(mm)}"></span>`;
  ul.innerHTML = hits.map((s, i) => `<li data-n="${s.n}"${i === qSel ? ' aria-selected="true"' : ""}>` +
    `${dot(rainSum(s))}<span class=nm>${s.name}</span>` +
    `<span class=pr>${titleCase(s.prov)}</span>` +
    `<span class=val>(${num(rainSum(s))} ${t("litre_short")})</span></li>`).join("");
  $$("#qhits li[data-n]").forEach(li =>
    li.addEventListener("click", () => choosePlace(stOf(+li.dataset.n))));
  headerGap();                       // the results have just made the header taller
  return hits;
}
const stOf = (n) => DATA.stations.find(s => s.n === n);

function choosePlace(st) {
  if (!st) return;
  clearSearch();                   // close the dropdown; the box is ready for the next look
  /* v3.1 (Juanjo): a search pick marks the place and fills the card — which sits right
     under this header — but it never scrolls the page and never opens a balloon. */
  focusPlace(st, { scroll: null, balloon: false });
}

function wireSearch() {
  const input = $("#q");
  input.addEventListener("input", () => { qSel = -1; renderHits(searchPlaces(input.value), input.value); });
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { clearSearch(); input.blur(); return; }
    const hits = searchPlaces(input.value);
    if (!hits.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      qSel = e.key === "ArrowDown" ? Math.min(qSel + 1, hits.length - 1) : Math.max(qSel - 1, 0);
      renderHits(hits, input.value);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choosePlace(hits[Math.max(qSel, 0)]);
    }
  });
  $("#qform").addEventListener("submit", e => {
    e.preventDefault();
    choosePlace(searchPlaces(input.value)[Math.max(qSel, 0)]);
  });
}

/* The forecast window in the footer: terse, and one month name when the five
   days fall inside one ("16–20 nov"), two when they don't ("30 oct–3 nov"). */
function fcWindowLabel() {
  const d = fcDates();
  if (!d.length) return "";
  const part = (iso) => { const [y, m, day] = iso.split("-").map(Number);
    return { day, mon: new Date(y, m - 1, 15).toLocaleDateString(locale(), { month: "short" }).replace(/\.$/, ""), y }; };
  const a = part(d[0]), b = part(d[d.length - 1]);
  return a.mon === b.mon ? `${a.day}–${b.day} ${b.mon}` : `${a.day} ${a.mon}–${b.day} ${b.mon}`;
}

function renderFooter() {
  const m = DATA.models[MODEL_ACTIVE];
  const span = fcWindowLabel() ? ` · ${fcWindowLabel()}` : "";
  const [hyA, hyB] = DATA.hydro_year.split("/");
  $("#hy").textContent = `${hyA}/${hyB}`;        // v3.1: the header says 2026/2027, not 2026/27
  $("#foot").innerHTML = `
    ${t("updated")}: <b>${DATA.generated_at_utc.replace("T", " ").replace("Z", " UTC")}</b>
    ${m ? ` · ${t("model")}: ${m.product}, ${t("cycle")} ${m.cycle_utc}${span}` : ""}
    ${m ? ` · ${t("fc_note")}` : ""}
    ${DATA.observed_updated_at ? ` · ${t("obs_stamp")} ${DATA.observed_updated_at}` : ""}<br>
    ${t("sources")}<br>
    <a href="https://www.openstreetmap.org/copyright" rel="noopener">© OpenStreetMap</a>
     · <a href="about.html">${t("about_link")}</a>`;
}

function select(st, pan = false, scroll = pan) {
  if (selected && markers[selected.n]) markers[selected.n].setStyle({ weight: 1, radius: 6 });
  selected = st;
  const mk = markers[st.n];
  if (mk) {
    mk.setStyle({ weight: 2.5, color: "#374151", radius: 8 });
    /* v2.4: tapping a MARKER no longer zooms — the balloon answers "what is this
       dot", and yanking the view closer only hides the neighbours around it.  A
       place picked in the directory or the search box still gets a zoom (that is
       an explicit "take me there"), which focusPlace() does on top of this. */
    if (pan) map.setView([st.lat, st.lon], Math.max(map.getZoom(), 10));
  }
  renderCard(st);
  /* the card sits ABOVE the map (v2.3), so picking a place in the list at the bottom
     brings the reader back up to it — but only when they asked for it (scroll). */
  if (scroll) $("#card").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Chosen from the SEARCH box (v3.1 gesture, kept).  v3.5 splits the two things that used
   to travel together — moving the page, and opening the balloon:
     scroll: "map"  → bring the MAP to the middle (the default: a tap on a balloon's
                      neighbour that turned into a chosen place)
     scroll: null   → leave the page exactly where the reader put it (a search pick, arrival)
     balloon: open the popup.  A place you PICKED is already spelled out in the card, so
              the search never throws a balloon over the map for the same numbers.
   The card's name and the directory rows are NOT here any more — since v3.5 they are
   links to station.html, the page that answers "tell me about this place" in full.
   Either way the marker is emphasised and the map CENTRES on it inside its own box (`select`
   pans), so the dot is sitting there waiting whenever the reader scrolls down. */
function focusPlace(st, { scroll = "map", balloon = true } = {}) {
  if (!st) return;
  select(st, true, false);
  if (balloon && markers[st.n]) markers[st.n].openPopup();
  if (!scroll) return;
  const el = $(scroll === "card" ? "#card" : "#map");
  el.scrollIntoView({ behavior: "smooth", block: scroll === "map" ? "center" : "start" });
}

/* ---------- init ---------- */
async function boot() {
  await loadCommon();                // i18n + numbers, the same way station.js gets them

  applyStatic(); renderLegend(); renderFooter();
  measureScale();                        // log scale for the bar plot (req. 3)

  map = L.map("map", { scrollWheelZoom: false });
  /* The whole region, once — the default view.  The opening fits to it (v2.4:
     closing a balloon no longer returns here: the reader's view is their own). */
  const HOME = L.latLngBounds(DATA.stations.map(s => [s.lat, s.lon]));
  /* Quiet basemap (req. 2): plain OpenStreetMap tiles — no API key, ever — muted
     with a CSS filter on the tile pane. CARTO Positron was tried in v2 and began
     demanding a key, which blanked the map (Phase 8). */
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, subdomains: "abc",
    attribution: "" }).addTo(map);

  for (const st of DATA.stations) {
    markers[st.n] = L.circleMarker([st.lat, st.lon], {
      radius: 7, fillColor: fcColor(rainSum(st)), fillOpacity: 1,   // 100 % colour,
      // and the SAME number the balloon and the directory show: the 5-day total
      color: "#ffffff", weight: 1.5 }).addTo(map)
      .bindTooltip(st.name)
      .bindPopup(popupHtml(st), { maxWidth: 360 })   // v3.5: the 10-day pair series needs room
      /* v2.4: a marker tap opens the balloon and selects, but the view stays
         exactly where the reader left it — no zoom on marker select. */
      .on("click", () => select(st, false, false));
  }

  map.fitBounds(HOME, { padding: [12, 12] });

  /* v2.4: closing a balloon NO LONGER retreats the map to the whole region (the
     v2.3.1 reset).  The view the reader chose is theirs; only the "whole region"
     opening above moves it on load. */

  renderDirectory();
  wireSearch();
  /* The page never opens on an empty card (req. 7): the default is the wettest place —
     upgraded to the nearest one if the reader already granted location.
     v3.2 (Juanjo: "revert the functionality that opens the wettest bubble the first time"):
     arriving only CHOOSES the place.  The card up top is filled, its marker is the
     emphasised one, and NOTHING opens or moves over the map — the region view the page
     fitted stays exactly as it is.  The balloon is now something the reader asks for:
     a tap on a marker, or a tap on the card's own name. */
  select(wettestPlace(), false, false);
  selectByLocation();                    // upgrades to the nearest place, if already allowed

  /* v3.5: the card's NAME is a link to the place's page (renderCard) — the v2.4.2
     click-to-zoom listeners died with it: an anchor needs no delegation, no
     keydown handler and no tabindex; it has always done all three by itself. */

  $$("#lang button").forEach(b => b.addEventListener("click", () => {
    LANG = b.dataset.lang; localStorage.setItem("llo_lang", LANG);
    applyStatic(); renderLegend(); renderFooter(); renderCard(selected);
    renderDirectory();                       // bar numbers, initials and copy in EN
    if ($("#q").value.trim())                // a live search re-renders in the new language
      renderHits(searchPlaces($("#q").value), $("#q").value);
    for (const st of DATA.stations)          // open balloons translate too
      if (markers[st.n]) markers[st.n].setPopupContent(popupHtml(st));
  }));
}

/* ---------- the intro video (req. 8, v2.2) ----------
   It must AUTOPLAY AT MIDDLE VOLUME.  No browser allows a first visit to start a
   video with sound, so the player asks for sound and only falls back to muted if
   the browser refuses — and the refusal is temporary: the very first click or
   keypress on the page (a real user gesture, which is all the policy needs) puts
   the sound back at VOL.  Where audible autoplay is allowed (Firefox/Chrome give
   a site that permission as soon as you have visited it before), it simply starts
   with sound.  The volume itself can only be set through YouTube's own IFrame API,
   so that script is loaded as an enhancement; if it never arrives (offline, blocked
   by tracking protection, no JavaScript at all) the plain <iframe> in index.html is
   what plays, exactly as before. */
const VIDEO_ID = "7plhOz-4UfQ", VIDEO_START = 4344, VIDEO_END = 4404, VOL = 50;
let yt = null, ytMutedByPolicy = false;

function loadPlayerApi() {
  if (window.YT && window.YT.Player) { buildPlayer(); return; }
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { if (prev) prev(); buildPlayer(); };
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  s.onerror = () => {};                     // no API -> the plain iframe keeps playing
  document.head.appendChild(s);
}

function buildPlayer() {
  const el = document.getElementById("video-frame");
  if (!el || yt || !window.YT || !window.YT.Player) return;
  try {
    yt = new window.YT.Player(el, {
      videoId: VIDEO_ID,
      playerVars: { autoplay: 1, controls: 1, start: VIDEO_START, end: VIDEO_END,
                    loop: 1, playlist: VIDEO_ID, playsinline: 1, mute: 0 },
      events: { onReady: p => { try { p.setVolume(VOL); restore(p); } catch (e) { /* noop */ } } },
    });
  } catch (e) { yt = null; }                 // API refused (blocked, sandboxed): iframe works
}

/* -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued: anything but
   playing/buffering/ended after a moment means the browser blocked the sound. */
function restore(p) {
  setTimeout(() => {
    let st = -1;
    try { st = p.getPlayerState(); } catch (e) { return; }
    if (st === 1 || st === 3 || st === 0) return;
    try { p.mute(); p.playVideo(); } catch (e) { return; }
    ytMutedByPolicy = true;
    const unmute = () => {
      if (!ytMutedByPolicy || !yt) return;
      ytMutedByPolicy = false;
      try { yt.unMute(); yt.setVolume(VOL); } catch (e) { /* noop */ }
    };
    addEventListener("pointerdown", unmute, { once: true });
    addEventListener("keydown", unmute, { once: true });
  }, 1400);
}

/* The embed sits in index.html, so a browser without JavaScript still shows it (see
   the noscript rule).  With scripts on, the FIRST thing that happens is that the
   block is lifted into a centred popup — no inline player, no flash.  There is no
   label line above the player. */
function popIntro() {
  const pop = $("#intro-pop"), intro = $("#intro");
  if (pop.hidden && intro.parentElement.id === "intro-holder") {
    $("#intro-slot").appendChild(intro);
    pop.hidden = false;
    document.body.classList.add("pop-open");     // the page waits behind the player
    loadPlayerApi();                             // volume control, and autoplay with sound
  }
}

function closeIntro() {
  const pop = $("#intro-pop");
  if (pop.hidden) return;
  if (yt) { try { yt.stopVideo(); } catch (e) { /* noop */ } }
  else {
    const f = $("#video-frame");
    if (f && f.getAttribute("src")) f.removeAttribute("src");   // stops playback + tracking
  }
  $("#intro-holder").appendChild($("#intro"));
  $("#intro-holder").hidden = true;                      /* gone from the page */
  pop.hidden = true;
  document.body.classList.remove("pop-open");
}

document.addEventListener("DOMContentLoaded", () => {
  headerGap();                 /* the popup leaves the page title in the clear */
  addEventListener("resize", headerGap);
  popIntro();                    /* before anything is fetched: the video is a popup */
  boot().catch(e => { console.error(e); $("#card").textContent = "error: " + e; });
  $("#pop-close").addEventListener("click", closeIntro);
  $("#intro-pop").addEventListener("click", e => { if (e.target.id === "intro-pop") closeIntro(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeIntro(); });
});
