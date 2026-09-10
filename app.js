// ---------------------------------------------------------------------------
// Grid Watch — client logic. Runs in the browser on GitHub Pages.
// Flow: postcode -> geocode via postcodes.io -> find nearby curated projects
// and nearby live planning applications -> render.
// ---------------------------------------------------------------------------

// ⚙️ SET YOUR DONATION LINK HERE (Ko-fi / Stripe / PayPal / Substack):
const DONATE_URL = "#";

// ⚙️ TIPS: paste a Google Form URL here to collect tips into a spreadsheet.
//    Leave it blank to open a pre-filled email instead (set TIP_EMAIL too).
const TIP_URL = "";
const TIP_EMAIL = "tips@example.com";

const RADIUS_KM = 45;          // how near counts as "near you"
let MAP = null, MARKERS = null; // Leaflet map + marker layer
const el = (id) => document.getElementById(id);

let CURATED = [];
let LIVE = [];
let OSM = [];

// haversine distance in km
function dist(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const gbp = (n) => (n == null ? null : "£" + Number(n).toLocaleString("en-GB"));
const gbpShort = (n) => {
  if (n == null) return null;
  if (n >= 1e9) return "£" + (n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 1) + "bn";
  if (n >= 1e6) return "£" + Math.round(n / 1e6) + "m";
  return gbp(n);
};
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function loadData() {
  try {
    const [d, p, o] = await Promise.all([
      fetch("datacentres.json").then((r) => r.json()),
      fetch("planning.json").then((r) => r.json()).catch(() => ({ items: [] })),
      fetch("datacentres-osm.json").then((r) => r.json()).catch(() => ({ items: [] })),
    ]);
    CURATED = (d.datacentres || []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
    LIVE = (p.items || []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
    OSM = (o.items || []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
  } catch (e) {
    CURATED = []; LIVE = []; OSM = [];
  }
}

function showMsg(text) { const m = el("msg"); m.textContent = text; m.classList.remove("hidden"); }
function hideMsg() { el("msg").classList.add("hidden"); }

async function run(pcRaw) {
  const pc = (pcRaw || "").trim();
  if (!pc) { showMsg("Pop a postcode in first."); return; }
  hideMsg();
  el("go").textContent = "Looking…";
  let loc;
  try {
    const res = await fetch("https://api.postcodes.io/postcodes/" + encodeURIComponent(pc));
    const j = await res.json();
    if (j.status !== 200 || !j.result) throw new Error("bad postcode");
    loc = { lat: j.result.latitude, lng: j.result.longitude, place: j.result.admin_district || j.result.parish || "your area" };
  } catch (e) {
    el("go").textContent = "Show me what's coming";
    showMsg("That postcode didn't resolve. Check it and try again — a full postcode works best.");
    return;
  }
  el("go").textContent = "Show me what's coming";

  const near = (arr) => arr
    .map((x) => ({ ...x, km: dist(loc.lat, loc.lng, x.lat, x.lng) }))
    .filter((x) => x.km <= RADIUS_KM)
    .sort((a, b) => a.km - b.km);

  const curated = near(CURATED);
  const live = near(LIVE);
  const osm = near(OSM);
  render(loc, curated, live, osm);
}

function render(loc, curated, live, osm) {
  el("home").classList.add("hidden");
  el("results").classList.remove("hidden");
  window.scrollTo(0, 0);

  const invested = curated.reduce((s, x) => s + (x.investment_gbp || 0), 0);
  const foreign = curated.filter((x) => x.ownership === "US" || (x.country && x.country !== "United Kingdom"));

  el("r-lead").textContent = `Within ${RADIUS_KM}km of ${loc.place}:`;
  if (invested > 0) {
    el("r-big").textContent = gbpShort(invested);
    el("r-say").innerHTML = `of data-centre investment is on the register near you — <b>${foreign.length} of ${curated.length}</b> ${curated.length === 1 ? "project" : "projects"} foreign-owned.`;
  } else if (curated.length + osm.length + live.length > 0) {
    const total = curated.length + osm.length + live.length;
    el("r-big").textContent = String(total);
    el("r-say").innerHTML = `data-centre ${total === 1 ? "site or application" : "sites and applications"} sit near you — existing, proposed and on the register. Dig in below.`;
  } else {
    el("r-big").textContent = "0";
    el("r-say").innerHTML = `nothing on the register within ${RADIUS_KM}km yet. That's not the same as nothing coming — the live feed and register are still filling out.`;
  }

  // curated
  const cWrap = el("r-curated");
  cWrap.innerHTML = curated.length ? curated.map(curatedRow).join("") :
    `<div class="empty">No known projects within ${RADIUS_KM}km on the register yet. If you know one, that's exactly the kind of tip this is built on.</div>`;

  // live
  const lWrap = el("r-live");
  lWrap.innerHTML = live.length ? live.slice(0, 25).map(liveRow).join("") :
    `<div class="empty">No recent "data centre" planning applications near you in the live feed. It refreshes daily.</div>`;

  // existing sites (OpenStreetMap)
  const oWrap = el("r-osm");
  if (oWrap) oWrap.innerHTML = osm.length ? osm.slice(0, 25).map(osmRow).join("") :
    `<div class="empty">No mapped existing data centres within ${RADIUS_KM}km yet — OpenStreetMap coverage grows over time.</div>`;

  drawMap(loc, curated, live, osm);
  el("donate").href = DONATE_URL;

  // share
  const shareText = invested > 0
    ? `${gbpShort(invested)} of data-centre investment is landing within ${RADIUS_KM}km of ${loc.place} — ${foreign.length} of ${curated.length} projects foreign-owned. See who's plugging into your patch 👇 #TheScouseOracle`
    : `Data centres are being built across the UK, pulling power meant for homes. See what's coming to your patch 👇 #TheScouseOracle`;
  el("share").onclick = () => {
    if (navigator.share) { navigator.share({ text: shareText }).catch(() => {}); }
    else if (navigator.clipboard) { navigator.clipboard.writeText(shareText); el("share").textContent = "Copied"; setTimeout(() => (el("share").textContent = "Share this"), 1600); }
  };
}

function flagFor(x) {
  const foreign = x.ownership === "US" || (x.country && x.country !== "United Kingdom");
  const label = x.ownership === "US" ? "US-owned" : (x.country && x.country !== "United Kingdom" ? esc(x.country) + "-owned" : "UK-owned");
  return `<span class="flag ${foreign ? "us" : "uk"}">${label}</span>`;
}

function curatedRow(x) {
  const amt = gbpShort(x.investment_gbp);
  return `<div class="row">
    <div class="top"><div class="nm">${esc(x.name)}</div>${amt ? `<div class="amt">${amt}</div>` : ""}</div>
    <div class="op">${esc(x.operator || "")} ${flagFor(x)}</div>
    <div class="meta">${esc(x.area || "")} · ${esc(x.status || "")} · <span class="dist">~${Math.round(x.km)}km away</span></div>
    ${x.note ? `<div class="note">${esc(x.note)}</div>` : ""}
    ${x.source ? `<a class="src" href="${esc(x.source)}" target="_blank" rel="noreferrer">Source ↗</a>` : ""}
  </div>`;
}

function liveRow(x) {
  return `<div class="row">
    <div class="top"><div class="nm">${esc(x.authority || "Planning application")}</div><div class="dist">~${Math.round(x.km)}km</div></div>
    <div class="note">${esc((x.description || "").slice(0, 260))}${(x.description || "").length > 260 ? "…" : ""}</div>
    <div class="meta">${esc(x.address || x.postcode || "")}${x.date ? " · " + esc(x.date) : ""}${x.status ? " · " + esc(x.status) : ""}</div>
    ${x.url ? `<a class="src" href="${esc(x.url)}" target="_blank" rel="noreferrer">Official record ↗</a>` : ""}
  </div>`;
}

function osmRow(x) {
  return `<div class="row">
    <div class="top"><div class="nm">${esc(x.name || "Data centre")}</div><div class="dist">~${Math.round(x.km)}km</div></div>
    <div class="op">${esc(x.operator || "Operator not listed")} <span class="flag osm">OpenStreetMap</span></div>
    ${x.source ? `<a class="src" href="${esc(x.source)}" target="_blank" rel="noreferrer">View on map ↗</a>` : ""}
  </div>`;
}

function drawMap(loc, curated, live, osm) {
  if (typeof L === "undefined") return; // Leaflet CDN didn't load; skip quietly
  if (!MAP) {
    MAP = L.map("map", { scrollWheelZoom: false }).setView([loc.lat, loc.lng], 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors", maxZoom: 18,
    }).addTo(MAP);
    MARKERS = L.layerGroup().addTo(MAP);
  }
  MARKERS.clearLayers();
  MAP.setView([loc.lat, loc.lng], 9);

  // you
  L.circleMarker([loc.lat, loc.lng], { radius: 7, color: "#1B1712", weight: 2, fillColor: "#1B1712", fillOpacity: 1 })
    .bindPopup("You").addTo(MARKERS);

  const bounds = [[loc.lat, loc.lng]];
  curated.forEach((x) => {
    const foreign = x.ownership === "US" || (x.country && x.country !== "United Kingdom");
    L.circleMarker([x.lat, x.lng], { radius: 9, color: "#1B1712", weight: 1.5, fillColor: foreign ? "#CC2A18" : "#33502a", fillOpacity: 0.9 })
      .bindPopup(`<b>${esc(x.name)}</b><br>${esc(x.operator || "")}`).addTo(MARKERS);
    bounds.push([x.lat, x.lng]);
  });
  live.slice(0, 40).forEach((x) => {
    L.circleMarker([x.lat, x.lng], { radius: 5, color: "#CC2A18", weight: 2, fillColor: "#ECEAE1", fillOpacity: 0.9 })
      .bindPopup(`<b>Planning application</b><br>${esc((x.description || "").slice(0, 120))}`).addTo(MARKERS);
    bounds.push([x.lat, x.lng]);
  });

  (osm || []).slice(0, 150).forEach((x) => {
    L.circleMarker([x.lat, x.lng], { radius: 5, color: "#6a6559", weight: 1.5, fillColor: "#b8b3a6", fillOpacity: 0.9 })
      .bindPopup(`<b>${esc(x.name || "Data centre")}</b><br>${esc(x.operator || "")}<br><small>OpenStreetMap</small>`).addTo(MARKERS);
    bounds.push([x.lat, x.lng]);
  });

  if (bounds.length > 1) MAP.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
  setTimeout(() => MAP.invalidateSize(), 60); // container was hidden until now
}

function sendTip() {
  if (TIP_URL) { window.open(TIP_URL, "_blank", "noopener"); return; }
  const subject = encodeURIComponent("Data centre tip — Grid Watch");
  const body = encodeURIComponent("Where (postcode or area):\n\nWho's behind it (if known):\n\nWhat you've seen or heard:\n\nAny link/source:\n");
  window.location.href = `mailto:${TIP_EMAIL}?subject=${subject}&body=${body}`;
}

// wire up
el("tip").addEventListener("click", sendTip);
el("go").addEventListener("click", () => run(el("pc").value));
el("pc").addEventListener("keydown", (e) => { if (e.key === "Enter") run(el("pc").value); });
document.querySelectorAll(".examples button").forEach((b) => b.addEventListener("click", () => { el("pc").value = b.dataset.pc; run(b.dataset.pc); }));
el("again").addEventListener("click", () => { el("results").classList.add("hidden"); el("home").classList.remove("hidden"); el("pc").value = ""; window.scrollTo(0, 0); });

loadData();
