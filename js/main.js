"use strict";

const API_BASE = "https://api.sr.se/api/v2";

// ---- DOM ----
const channelListEl = document.getElementById("mainnavlist");   // vänster lista
const infoEl = document.getElementById("info");                // höger info/tablå
const channelSelectEl = document.getElementById("searchProgram"); // OBS: denna ska vara KANALER
const showScheduleBtn = document.getElementById("searchbutton");

// Audio (skapa om saknas)
let audioPlayer = document.querySelector("audio");
if (!audioPlayer) {
  audioPlayer = document.createElement("audio");
  audioPlayer.controls = true;
  audioPlayer.style.width = "100%";
}

let currentChannelId = null;
const channelsById = new Map(); // id -> channel obj (från /channels)

// ---------------- HJÄLP ----------------

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

// SR kan ha /Date(169...)/ i tider
function srUtcToDate(srUtcString) {
  const ms = parseInt(String(srUtcString || "").replace(/\D/g, ""), 10);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function isSameLocalDay(d, ref = new Date()) {
  return (
    d &&
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

// ---------------- API ----------------

async function getChannels() {
  return fetchJson(`${API_BASE}/channels?format=json&size=200`);
}

async function getChannel(id) {
  return fetchJson(`${API_BASE}/channels/${id}?format=json`);
}

async function getPlaylist(channelId) {
  return fetchJson(`${API_BASE}/playlists/rightnow?channelid=${channelId}&format=json`);
}

async function getSchedule(channelId) {
  // Hämtar en bit av schedule; vi filtrerar till "idag" i render.
  return fetchJson(`${API_BASE}/scheduledepisodes?channelid=${channelId}&format=json&size=200`);
}

// ---------------- RENDER ----------------

function renderChannelList(data) {
  // Vänster listan med loggor
  channelListEl.innerHTML = data.channels
    .map(
      (c) => `
      <li data-id="${c.id}"
          style="display:flex; align-items:center; gap:10px; margin:6px 0; cursor:pointer;">
        <img src="${c.image}" alt="${escapeHtml(c.name)}"
             style="width:28px; height:28px; object-fit:contain;">
        <span>${escapeHtml(c.name)}</span>
      </li>`
    )
    .join("");
}

function renderChannelSelect(channels) {
  // Selectbox uppe till höger = kanalväljare
  channelSelectEl.innerHTML = channels
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join("");
}

function renderChannelInfo(channel) {
  infoEl.innerHTML = `
    <div style="display:flex; align-items:center; gap:15px;">
      <img src="${channel.image}" alt="${escapeHtml(channel.name)}"
           style="width:80px; height:80px; object-fit:contain;">
      <div>
        <h2>${escapeHtml(channel.name)}</h2>
        <p>${escapeHtml(channel.tagline || "")}</p>
      </div>
    </div>
  `;

  // behåll spelaren högst upp i info
  infoEl.prepend(audioPlayer);
}

function renderPlaylist(data) {
  const songs = data?.playlist?.song;
  if (!Array.isArray(songs) || songs.length === 0) return;

  const idx = songs.findIndex((s) => s.nowplaying);
  const prev = songs[idx - 1];
  const next = songs[idx + 1];

  infoEl.insertAdjacentHTML(
    "beforeend",
    `
    <article>
      <p><strong>Previous song:</strong> ${prev ? escapeHtml(prev.artist + " - " + prev.title) : "-"}</p>
      <p><strong>Next song:</strong> ${next ? escapeHtml(next.artist + " - " + next.title) : "-"}</p>
    </article>
  `
  );
}

function renderTodaySchedule(data) {
  const list = data?.schedule || [];
  infoEl.innerHTML = "<h3>Dagens programtablå</h3>";
  infoEl.prepend(audioPlayer);

  const today = new Date();
  const todayItems = list.filter((ep) => isSameLocalDay(srUtcToDate(ep.starttimeutc), today));

  if (todayItems.length === 0) {
    infoEl.insertAdjacentHTML("beforeend", `<p>Ingen tablå hittades för idag.</p>`);
    return;
  }

  todayItems.forEach((ep) => {
    const start = srUtcToDate(ep.starttimeutc);
    const end = srUtcToDate(ep.endtimeutc);

    const startStr = start
      ? start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    const endStr = end
      ? end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

    infoEl.insertAdjacentHTML(
      "beforeend",
      `
      <article>
        <h4>${escapeHtml(ep.title)}</h4>
        <p>${startStr}${endStr ? " - " + endStr : ""}</p>
        ${ep.description ? `<p>${escapeHtml(ep.description)}</p>` : ""}
      </article>
    `
    );
  });
}

// ---------------- LOGIK ----------------

async function loadChannel(channelId) {
  currentChannelId = String(channelId);

  // sync selectboxen (lärarens krav)
  if (channelSelectEl.value !== currentChannelId) {
    channelSelectEl.value = currentChannelId;
  }

  infoEl.innerHTML = "<p>Laddar kanal...</p>";

  const channelData = await getChannel(currentChannelId);
  const channel = channelData.channel;

  renderChannelInfo(channel);

  // koppla radio (ingen autoplay – användaren trycker play)
  if (channel.liveaudio?.url) {
    audioPlayer.src = channel.liveaudio.url;
    audioPlayer.load();
  }

  // visa previous/next song
  try {
    const playlist = await getPlaylist(currentChannelId);
    renderPlaylist(playlist);
  } catch {
    // ignorera om SR API strular
  }
}

// ---------------- EVENTS ----------------

// Klick i vänsterlistan -> byter kanal + uppdaterar selectboxen
channelListEl.addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  await loadChannel(li.dataset.id);
});

// Byt kanal i selectbox (uppe till höger) -> byter kanal + uppdaterar info
channelSelectEl.addEventListener("change", async () => {
  if (!channelSelectEl.value) return;
  await loadChannel(channelSelectEl.value);
});

// Visa programtablå -> dagens schema för VALD kanal (från selectbox)
showScheduleBtn.addEventListener("click", async () => {
  const selectedId = channelSelectEl.value || currentChannelId;

  if (!selectedId) {
    infoEl.innerHTML = "<p>Välj en kanal först.</p>";
    return;
  }

  currentChannelId = String(selectedId);

  infoEl.innerHTML = "<p>Laddar tablån...</p>";
  const data = await getSchedule(currentChannelId);
  renderTodaySchedule(data);
});

// ---------------- START ----------------

(async function init() {
  infoEl.innerHTML = "<p>Laddar kanaler...</p>";

  const data = await getChannels();
  data.channels.forEach((c) => channelsById.set(String(c.id), c));

  renderChannelList(data);
  renderChannelSelect(data.channels);

  // Starta med första kanalen som default (så selectboxen har något)
  if (data.channels.length > 0) {
    await loadChannel(String(data.channels[0].id));
  } else {
    infoEl.innerHTML = "<p>Inga kanaler hittades.</p>";
  }
})();
