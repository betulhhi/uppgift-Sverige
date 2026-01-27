/**
 * main.js – Sveriges Radio Multi Application
 * Passar EXAKT till din HTML (ids):
 *  - #mainnavlist (ul)   -> lista kanaler
 *  - #info (div)         -> info/tablå visas här
 *  - #searchProgram (select) -> programlista för vald kanal
 *  - #searchbutton (button)  -> visa programtablå
 *
 * API: https://api.sr.se/api/v2/
 */

"use strict";

const API_BASE = "https://api.sr.se/api/v2";

// ---- DOM ----
const channelListEl = document.getElementById("mainnavlist");
const infoEl = document.getElementById("info");
const programSelectEl = document.getElementById("searchProgram");
const showScheduleBtn = document.getElementById("searchbutton");

// Håller koll på vald kanal/program
let currentChannel = null; // { id, name, ... }
let programsById = new Map(); // programId -> programObj

// ---- Hjälpfunktioner ----
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// SR kan ibland skicka /Date(169...)/
function parseSrDate(value) {
  const s = String(value ?? "");
  const m = s.match(/Date\((\d+)\)/);
  if (m) return new Date(Number(m[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatHHMM(dateOrValue) {
  const d = dateOrValue instanceof Date ? dateOrValue : parseSrDate(dateOrValue);
  if (!d) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function setInfoHtml(html) {
  infoEl.innerHTML = html;
}

function addInfoHtml(html) {
  infoEl.insertAdjacentHTML("beforeend", html);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${res.statusText})`);
  return res.json();
}

/**
 * Hämtar alla sidor från en endpoint som returnerar { pagination, <key>: [] }
 */
async function fetchAllPages(url, arrayKey) {
  const all = [];
  let page = 1;

  while (true) {
    const u = new URL(url);
    u.searchParams.set("format", "json");
    u.searchParams.set("size", "100");
    u.searchParams.set("page", String(page));

    const data = await fetchJson(u.toString());
    const part = Array.isArray(data?.[arrayKey]) ? data[arrayKey] : [];
    all.push(...part);

    const pag = data?.pagination;
    const totalPages = pag?.totalpages ?? 1;
    if (page >= totalPages) break;

    page += 1;
    if (page > 50) break; // skydd
  }

  return all;
}

// ---- API wrappers ----
async function getChannels() {
  return fetchAllPages(`${API_BASE}/channels`, "channels");
}

async function getChannel(channelId) {
  return fetchJson(`${API_BASE}/channels/${encodeURIComponent(channelId)}?format=json`);
}

/**
 * Program för vald kanal:
 * SR har historiskt haft /programs/index (”alla program”), ofta med channelid-filter.
 * Om det inte funkar, fallback till /programs?channelid=...
 */
async function getProgramsForChannel(channelId) {
  // 1) Försök: programs/index (brukar ge fler träffar)
  try {
    const u = new URL(`${API_BASE}/programs/index`);
    u.searchParams.set("channelid", String(channelId));
    u.searchParams.set("format", "json");
    u.searchParams.set("size", "200");
    const data = await fetchJson(u.toString());
    if (Array.isArray(data?.programs)) return data.programs;
  } catch (_) {
    // ignore, prova fallback
  }

  // 2) Fallback: programs
  const u2 = new URL(`${API_BASE}/programs`);
  u2.searchParams.set("channelid", String(channelId));
  u2.searchParams.set("format", "json");
  u2.searchParams.set("size", "200");
  const data2 = await fetchJson(u2.toString());
  return Array.isArray(data2?.programs) ? data2.programs : [];
}

/**
 * Försök hämta “tablå” för program (planerade sändningar).
 * Om API inte stöder programid här, faller vi tillbaka till senaste avsnitt.
 */
async function getProgramSchedule(programId) {
  // 1) Försök: scheduledepisodes?programid=
  try {
    const u = new URL(`${API_BASE}/scheduledepisodes`);
    u.searchParams.set("programid", String(programId));
    u.searchParams.set("format", "json");
    u.searchParams.set("size", "100");
    const data = await fetchJson(u.toString());
    if (Array.isArray(data?.schedule) && data.schedule.length) return { type: "schedule", items: data.schedule };
  } catch (_) {
    // ignore
  }

  // 2) Fallback: senaste avsnitt (episodes?programid=)
  const u2 = new URL(`${API_BASE}/episodes`);
  u2.searchParams.set("programid", String(programId));
  u2.searchParams.set("format", "json");
  u2.searchParams.set("size", "20");
  const data2 = await fetchJson(u2.toString());
  return { type: "episodes", items: Array.isArray(data2?.episodes) ? data2.episodes : [] };
}

// ---- Render ----
function renderChannelList(channels) {
  const sorted = [...channels].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "sv")
  );

  channelListEl.innerHTML = sorted
    .map(
      (c) =>
        `<li data-channel-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</li>`
    )
    .join("");
}

function renderChannelInfo(channelObj) {
  const c = channelObj?.channel || channelObj;
  if (!c) return;

  const img = c.image || "";
  const tagline = c.tagline || "";
  const site = c.siteurl || "";

  setInfoHtml(`
    <article>
      <h3>${escapeHtml(c.name)}</h3>
      ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(c.name)}" style="max-width:260px;height:auto;">` : ""}
      ${tagline ? `<p>${escapeHtml(tagline)}</p>` : ""}
      ${site ? `<p><a href="${escapeHtml(site)}" target="_blank" rel="noopener">Besök kanalens sida</a></p>` : ""}
      <p><em>Välj ett program i listan uppe till höger och klicka “Visa programtablå”.</em></p>
    </article>
  `);
}

function renderProgramSelect(programs) {
  programsById.clear();

  const sorted = [...programs].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "sv")
  );

  programSelectEl.innerHTML = `
    <option value="">Välj program...</option>
    ${sorted
      .map((p) => {
        programsById.set(String(p.id), p);
        return `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`;
      })
      .join("")}
  `;
}

function renderScheduleItems(title, items, type) {
  // type: "schedule" eller "episodes"
  const listHtml = items.length
    ? items
        .map((it) => {
          if (type === "schedule") {
            const t = it.title || it.program?.name || "Sändning";
            const start = it.starttimeutc || it.starttime || "";
            const end = it.endtimeutc || it.endtime || "";
            const desc = it.description || "";
            return `
              <article>
                <h4>${escapeHtml(t)}</h4>
                <div><strong>${escapeHtml(formatHHMM(start))}${end ? `–${escapeHtml(formatHHMM(end))}` : ""}</strong></div>
                ${desc ? `<p>${escapeHtml(desc)}</p>` : ""}
              </article>
            `;
          } else {
            // episodes
            const t = it.title || it.name || "Avsnitt";
            const pub = it.publishdateutc || it.publishdate || "";
            const desc = it.description || "";
            const listenUrl =
              it.listenpodfile?.url ||
              it.broadcast?.broadcastfiles?.[0]?.url ||
              "";
            return `
              <article>
                <h4>${escapeHtml(t)}</h4>
                ${pub ? `<div><strong>Publicerad:</strong> ${escapeHtml(formatHHMM(pub))}</div>` : ""}
                ${desc ? `<p>${escapeHtml(desc)}</p>` : ""}
                ${listenUrl ? `<p><a href="${escapeHtml(listenUrl)}" target="_blank" rel="noopener">Lyssna</a></p>` : ""}
              </article>
            `;
          }
        })
        .join("")
    : `<article><p>Inget hittades.</p></article>`;

  addInfoHtml(`
    <article>
      <h3>${escapeHtml(title)}</h3>
      ${type === "schedule"
        ? `<p><em>Planerade sändningar (tablå)</em></p>`
        : `<p><em>Tablå hittades inte – visar senaste avsnitt istället</em></p>`}
    </article>
    ${listHtml}
  `);
}

// ---- Händelser ----
channelListEl.addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-channel-id]");
  if (!li) return;

  const channelId = li.getAttribute("data-channel-id");
  if (!channelId) return;

  try {
    setInfoHtml(`<article><p>Laddar kanal...</p></article>`);

    // Kanalinfo
    const channelData = await getChannel(channelId);
    const c = channelData?.channel || channelData;
    currentChannel = c;

    renderChannelInfo(channelData);

    // Programlista för kanalen
    addInfoHtml(`<article><p>Laddar program för ${escapeHtml(c?.name || "kanal")}...</p></article>`);
    const programs = await getProgramsForChannel(channelId);
    renderProgramSelect(programs);

    // Städa bort “laddar program...” raden (enkel variant: renderChannelInfo skrev om allt först,
    // så vi kan bara lägga en liten bekräftelse)
    addInfoHtml(`<article><p><strong>Klar!</strong> Programlistan är uppdaterad.</p></article>`);
  } catch (err) {
    setInfoHtml(`<article><p>Något gick fel: ${escapeHtml(err.message)}</p></article>`);
  }
});

showScheduleBtn.addEventListener("click", async () => {
  const programId = programSelectEl.value;

  if (!programId) {
    setInfoHtml(`<article><p>Välj ett program först (uppe till höger).</p></article>`);
    return;
  }

  const program = programsById.get(String(programId));
  const programName = program?.name || "Program";

  try {
    setInfoHtml(`<article><p>Laddar ${escapeHtml(programName)}...</p></article>`);

    const result = await getProgramSchedule(programId);

    // Visa även vilken kanal som är vald (om någon är vald)
    if (currentChannel?.name) {
      addInfoHtml(`<article><p><strong>Kanal:</strong> ${escapeHtml(currentChannel.name)}</p></article>`);
    }

    renderScheduleItems(`Program: ${programName}`, result.items, result.type);
  } catch (err) {
    setInfoHtml(`<article><p>Kunde inte hämta tablå/avsnitt: ${escapeHtml(err.message)}</p></article>`);
  }
});

// ---- Start: ladda kanaler direkt ----
(async function init() {
  try {
    setInfoHtml(`<article><p>Laddar kanaler...</p></article>`);
    const channels = await getChannels();
    renderChannelList(channels);
    setInfoHtml(`<article><p>Välj en kanal i listan till vänster.</p></article>`);
  } catch (err) {
    setInfoHtml(`<article><p>Kunde inte ladda kanaler: ${escapeHtml(err.message)}</p></article>`);
  }
})();
