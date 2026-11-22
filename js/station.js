/* lloverllover — station.js (v3.5→v4.0, Phases 17-23): the page per place.
   One file for all 294 places: station.html?e=<name> (or the old ?n=ID) renders
   the ten-day pair series
   (five closed days measured beside their 00z, five live forecast days — the
   balloon's picture grown up, with a number on every bar), the day-by-day table
   from table.json (what fell beside EVERY cycle that covered the whole of that
   day: five groups — own day, then 1…4 days before — each reading 18z 12z 06z
   00z, the own-day fractions built across cycles by the backfill), the two
   hydrological-year accumulations, and a zoomed map that answers "where,
   exactly?".  No new numbers are computed here: plot.js owns the colours and
   the bars, and a place that reads "–" on the map reads "–" here, because it is
   the same cell of the same archive. */
"use strict";

let ST = null, TBL = null, smini = null;

function renderPlace() {
  const st = ST;
  document.title = `${st.name} · lloverllover`;
  /* 7th prompt: municipio, provincia, altura and the ficha all LEFT, right after the
     name; only Volver al mapa keeps the right.  Since the 9th prompt the rule lives
     in plot.js (whereLine), because the card on the map page wears the same line. */
  const where = whereLine(st);
  const link = st.url
    ? `<a href="${st.url}" target=_blank rel="noopener" class=hidro>${t("station_link")}</a>` : "";
  /* 9th prompt (correction to the 8th): the two hydrological-year accumulations sit
     ABOVE the box — the page reads name, where, litros, and only then the picture. */
  $("#place").innerHTML = `
    <div class=sthead>
      <h2 style="border-color:${fcColor(rainSum(st))}">${st.name}</h2>
      <p class=stmeta><span class=stwhere>${where}${link}</span>
        <a href="index.html">← ${t("home_link")}</a></p>
    </div>
    <div id=stacc>${accRows(st)}</div>`;
  /* 8th prompt: the hint says exactly what black and blue are — observed at THIS
     place's SAIH network (linked), forecast by the CEPPM's model (linked). */
  const NET = { hidrosur: ["net_hidrosur", "https://www.redhidrosurmedioambiente.es/saih/"],
                chg:      ["net_chg", "https://www.chguadalquivir.es/saih/"] };
  const net = NET[st.net] || NET.hidrosur;
  const netlink = `<a href="${net[1]}" target=_blank rel=noopener>${t(net[0])}</a>`;
  const ceppmlink = `<a href="https://www.ecmwf.int/${LANG === "es" ? "es/" : ""}" ` +
    `target=_blank rel=noopener>${t("ceppm")}</a>`;
  $("#stseries").innerHTML = `<p class=hl>${barsHtml(st, true)}</p>
    <p class="hint pairh">${t("pair_hint", netlink, ceppmlink)}</p>`;
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
  const q = new URLSearchParams(window.location.search);
  /* 8th prompt: the doors now carry the place's NAME (?e=charco-redondo-embalse);
     the old numeric ?n=ID keeps working, so nothing ever written 404s. */
  const want = (q.get("e") || "").trim().toLowerCase();
  ST = DATA.stations.find(s => q.has("n") ? s.n === +q.get("n") : s.slug === want) || null;
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
