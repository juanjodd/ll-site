/* lloverllover — station.js (v3.5/v3.6, Phases 17-18): the page per place.
   One file for all 294 places: station.html?n=ID renders the ten-day pair series
   (five closed days measured beside their 00z, five live forecast days — the
   balloon's picture grown up, with a number on every bar), the day-by-day table
   from table.json (what fell beside EVERY cycle that covered the whole of that
   day: 00/06/12/18z of the four days before, plus the day's own 00z), and a
   zoomed map that answers "where, exactly?".  No new numbers are computed here:
   plot.js owns the colours and the bars, and a place that reads "–" on the map
   reads "–" here, because it is the same cell of the same archive. */
"use strict";

let ST = null, TBL = null, smini = null;

function renderPlace() {
  const st = ST;
  document.title = `${st.name} · lloverllover`;
  const where = titleCase(st.prov) +
    (st.alt != null ? " · " + num(st.alt, 0) + " m " + t("alt") : "");
  const link = st.url
    ? `<a href="${st.url}" target=_blank rel="noopener" class=hidro>${t("station_link")}</a>` : "";
  $("#place").innerHTML = `
    <h2 style="border-color:${fcColor(rainSum(st))}">${st.name}</h2>
    <p class="meta">${where}${link}</p>
    <p class=hint><a href="index.html">← ${t("home_link")}</a></p>`;
  /* the big pair series: same barsHtml the balloon draws, big=true = a number on
     every bar and the day of the month beside the weekday initial */
  $("#stseries").innerHTML = `<p class=hl>${barsHtml(st, true)}</p>
    <p class="hint pairh">${t("pair_hint")}</p>`;
  const table = tableHtml(TBL, st.n);
  $("#sttable").innerHTML = table
    ? table + `<p class=hint>${t("table_note")}</p>`
    : `<p class=hl>${t("fc_none")}</p>`;
  const foot = DATA.models[MODEL_ACTIVE];
  $("#foot").innerHTML = `
    ${t("updated")}: <b>${DATA.generated_at_utc.replace("T", " ").replace("Z", " UTC")}</b>` +
    (foot ? ` · ${t("model")}: ${foot.product}, ${t("cycle")} ${foot.cycle_utc}` : "") + `<br>
    ${t("sources")}<br>
    <a href="https://www.openstreetmap.org/copyright" rel="noopener">© OpenStreetMap</a>
     · <a href="about.html">${t("about_link")}</a>`;
}

function renderMiniMap(st) {
  smini = L.map("stmap", { scrollWheelZoom: false });
  /* the same key-free, muted basemap as the region view (req. 2, Phase 8) — here
     zoomed to the place itself, which is the whole point of this page */
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, subdomains: "abc", attribution: "" }).addTo(smini);
  smini.setView([st.lat, st.lon], 11);
  L.circleMarker([st.lat, st.lon], {
    radius: 9, fillColor: fcColor(rainSum(st)), fillOpacity: 1,
    color: "#374151", weight: 2.5 }).addTo(smini)
    .bindTooltip(st.name, { permanent: true, direction: "top", offset: [0, -8] });
}

async function bootStation() {
  await loadCommon();
  /* v3.6: the table's all-cycles matrix is its own file — the map page never
     pays for it, this page asks for it no-store like the numbers do. */
  TBL = await fetch("table.json", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
  applyStatic();
  measureScale();                          // the scale is the region's, never this page's alone
  const n = +new URLSearchParams(window.location.search).get("n");
  ST = DATA.stations.find(s => s.n === n) || null;
  if (!ST) {
    $("#place").innerHTML = `<h2>${t("not_found")}</h2>
      <p class=hint><a href="index.html">← ${t("home_link")}</a></p>`;
    $("#stseries").innerHTML = $("#sttable").innerHTML = "";
    const el = $("#stmap");
    if (el) el.remove();
    return;
  }
  renderPlace();
  renderMiniMap(ST);
  $$("#lang button").forEach(b => b.addEventListener("click", () => {
    LANG = b.dataset.lang; localStorage.setItem("llo_lang", LANG);
    applyStatic(); renderPlace();          // words, numbers and initials in the new language
    if (smini) smini.invalidateSize();
  }));
}

bootStation();
