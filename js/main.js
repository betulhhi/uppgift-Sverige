"use strict";

const API_BASE = "https://api.sr.se/api/v2";

// ---- DOM ----
const channelListEl = document.getElementById("mainnavlist");
const infoEl = document.getElementById("info");
const programSelectEl = document.getElementById("searchProgram");
const showScheduleBtn = document.getElementById("searchbutton");

let audioPlayer = document.querySelector("audio");
if (!audioPlayer) {
  audioPlayer = document.createElement("audio");
  audioPlayer.controls = true;
  audioPlayer.style.width = "100%";
}

let currentChannelId = null;

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

// ---------------- KANALER ----------------

async function getChannels() {
  return fetchJson(`${API_BASE}/channels?format=json&size=100`);
}

async function getChannel(id) {
  return fetchJson(`${API_BASE}/channels/${id}?format=json`);
}

function renderChannelList(data) {
  channelListEl.innerHTML = data.channels
    .map(c => `
      <li data-id="${c.id}" 
          style="display:flex; align-items:center; gap:10px; margin:6px 0; cursor:pointer;">
        <img src="${c.image}" alt="${escapeHtml(c.name)}"
             style="width:28px; height:28px; object-fit:contain;">
        <span>${escapeHtml(c.name)}</span>
      </li>
    `)
    .join("");
}

// ---------------- PLAYLIST ----------------

async function getPlaylist(channelId) {
  return fetchJson(`${API_BASE}/playlists/rightnow?channelid=${channelId}&format=json`);
}

function renderPlaylist(data) {
  const songs = data?.playlist?.song;
  if (!songs || !songs.length) return;

  const index = songs.findIndex(s => s.nowplaying);

  const prev = songs[index - 1];
  const now = songs[index];
  const next = songs[index + 1];

  infoEl.insertAdjacentHTML("beforeend", `
    <article>
      <h3>Nu spelas</h3>
      <p><strong>${escapeHtml(now?.artist)}</strong> – ${escapeHtml(now?.title)}</p>

      <h4>Föregående låt</h4>
      <p>${prev ? escapeHtml(prev.artist + " – " + prev.title) : "-"}</p>

      <h4>Nästa låt</h4>
      <p>${next ? escapeHtml(next.artist + " – " + next.title) : "-"}</p>
    </article>
  `);
}

// ---------------- PROGRAM (selectbox) ----------------

async function getPrograms(channelId) {
  return fetchJson(`${API_BASE}/programs?channelid=${channelId}&format=json&size=100`);
}

function renderPrograms(data) {
  programSelectEl.innerHTML = `<option value="">Välj program...</option>`;
  data.programs.forEach(p => {
    programSelectEl.insertAdjacentHTML(
      "beforeend",
      `<option value="${p.id}">${escapeHtml(p.name)}</option>`
    );
  });

  // reset select när kanal byts
  programSelectEl.selectedIndex = 0;
}

// ---------------- TABLÅ (endast idag) ----------------

async function getSchedule(channelId) {
  return fetchJson(`${API_BASE}/scheduledepisodes?channelid=${channelId}&format=json&size=60`);
}

function renderSchedule(data) {
  const list = data.schedule;
  infoEl.innerHTML = "<h3>Dagens program</h3>";

  const today = new Date();
  const d = today.getDate();
  const m = today.getMonth();
  const y = today.getFullYear();

  let found = false;

  list.forEach(ep => {
    const start = new Date(parseInt(ep.starttimeutc.replace(/\D/g, "")));

    if (start.getDate() === d && start.getMonth() === m && start.getFullYear() === y) {

      found = true;

      const end = new Date(parseInt(ep.endtimeutc.replace(/\D/g, "")));

      infoEl.insertAdjacentHTML("beforeend", `
        <article>
          <h4>${escapeHtml(ep.title)}</h4>
          <p>${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
          -
          ${end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
          <p>${escapeHtml(ep.description || "")}</p>
        </article>
      `);
    }
  });

  if (!found) {
    infoEl.insertAdjacentHTML("beforeend", `<p>Ingen sändning hittades för idag.</p>`);
  }

  infoEl.prepend(audioPlayer);
}

// ---------------- HÄNDELSER ----------------

channelListEl.addEventListener("click", async e => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;

  const id = li.dataset.id;
  currentChannelId = id;

  infoEl.innerHTML = "<p>Laddar kanal...</p>";

  const channelData = await getChannel(id);
  const channel = channelData.channel;

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

  if (channel.liveaudio?.url) {
    audioPlayer.src = channel.liveaudio.url;
    audioPlayer.load();
  }

  infoEl.prepend(audioPlayer);

  // playlist
  try {
    const playlist = await getPlaylist(id);
    renderPlaylist(playlist);
  } catch {}

  // programs till selectbox
  const programs = await getPrograms(id);
  renderPrograms(programs);
});

// visa tablå
showScheduleBtn.addEventListener("click", async () => {
  if (!currentChannelId) {
    infoEl.innerHTML = "<p>Välj en kanal först.</p>";
    return;
  }

  infoEl.innerHTML = "<p>Laddar tablån...</p>";
  const data = await getSchedule(currentChannelId);
  renderSchedule(data);
});

// ---------------- START ----------------

(async function init() {
  infoEl.innerHTML = "<p>Laddar kanaler...</p>";
  const channels = await getChannels();
  renderChannelList(channels);
  infoEl.innerHTML = "<p>Välj en kanal till vänster.</p>";
})();
