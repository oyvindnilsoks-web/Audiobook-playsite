const AUTH_KEY = "lydbok:token";
const POS_KEY = "lydbok:pos:";   // + bok-id -> {i, t, d}
const LAST_KEY = "lydbok:last";
const SKIP_BACK = 15, SKIP_FWD = 30;

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
let catalog = null;
let audio = null;       // aktiv <audio>, ryddes ved navigasjon
let cleanup = null;     // lagrer og rydder opp for aktiv bok
let wantPlay = false;   // true når brukeren nettopp valgte en bok -> start avspilling

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
const hue = (id) => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const srcUrl = (f) => "/api/audio/" + f.src.split("/").map(encodeURIComponent).join("/") + "?t=" + encodeURIComponent(store.get(AUTH_KEY));

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
};

/* ---------- innlogging ---------- */
async function init() {
  if (store.get(AUTH_KEY)) return start();
  $("login").classList.remove("hidden");
}
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("/api/login", { method: "POST", body: JSON.stringify({ password: $("pw").value }) }).catch(() => null);
  if (r && r.ok) {
    store.set(AUTH_KEY, (await r.json()).token);
    $("login").classList.add("hidden");
    start();
  } else {
    $("err").textContent = r ? "Feil passord" : "Ingen kontakt med serveren";
  }
});

async function start() {
  $("app").classList.remove("hidden");
  try {
    catalog = await (await fetch("books.json", { cache: "no-cache" })).json();
  } catch {
    $("app").innerHTML = "<p class='err'>Kunne ikke laste bokliste.</p>";
    return;
  }
  document.addEventListener("click", (e) => { if (e.target.closest("a.book")) wantPlay = true; });
  window.addEventListener("hashchange", route);
  route();
}

function teardown() {
  if (cleanup) { cleanup(); cleanup = null; }
  if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); audio = null; }
}
function route() {
  teardown();
  const rm = location.hash.match(/^#\/les\/(.+)$/);
  const reading = rm && (catalog.readings || []).find((r) => r.id === decodeURIComponent(rm[1]));
  if (reading) { renderReading(reading); window.scrollTo(0, 0); wantPlay = false; return; }
  const m = location.hash.match(/^#\/bok\/(.+)$/);
  const book = m && catalog.books.find((b) => b.id === decodeURIComponent(m[1]));
  book ? renderBook(book) : renderList();
  window.scrollTo(0, 0);
  wantPlay = false;
}

/* ---------- bokliste ---------- */
function percent(book) {
  const p = store.get(POS_KEY + book.id);
  if (!p) return 0;
  return Math.min(100, Math.round(((p.i + (p.d ? p.t / p.d : 0)) / book.files.length) * 100));
}
function renderList() {
  const last = store.get(LAST_KEY);
  const books = [...catalog.books];
  const li = books.findIndex((b) => b.id === last);
  if (li > 0) books.unshift(...books.splice(li, 1)); // sist spilte øverst
  $("app").innerHTML = `<h1>Lydbøker</h1><div class="books">` + books.map((b) => {
    const pct = percent(b);
    return `<a class="book" href="#/bok/${encodeURIComponent(b.id)}">
      ${b.cover ? `<img class="tile" src="${esc(b.cover)}" alt="" loading="lazy">` : `<div class="tile" style="background:hsl(${hue(b.id)} 45% 42%)">${esc(b.title.trim()[0] || "?")}</div>`}
      <div class="txt"><div class="t">${esc(b.title)}</div><div class="s">${esc(b.author)}${b.files.length > 1 ? " · " + b.files.length + " kapitler" : ""}</div>
      ${pct ? `<div class="prog"><i style="width:${pct}%"></i></div>` : ""}</div></a>`;
  }).join("") + `</div>` + readingsList();
}

function readingsList() {
  const rs = catalog.readings || [];
  if (!rs.length) return "";
  return `<h2 class="sec">Les</h2><div class="books">` + rs.map((r) =>
    `<a class="book" href="#/les/${encodeURIComponent(r.id)}"><div class="tile" style="background:hsl(${hue(r.id)} 35% 38%)">Aa</div>
     <div class="txt"><div class="t">${esc(r.title)}</div><div class="s">${r.images.length} sider</div></div></a>`).join("") + `</div>`;
}

function renderReading(r) {
  const tok = encodeURIComponent(store.get(AUTH_KEY));
  const url = (src) => "/api/audio/" + src.split("/").map(encodeURIComponent).join("/") + "?t=" + tok;
  $("app").innerHTML = `
    <a class="back" href="#/">← Alle bøker</a>
    <h1>${esc(r.heading || r.title)}</h1>
    <div class="pages">` + r.images.map((im) =>
      `<a href="${url(im.src)}" target="_blank" rel="noopener"><img src="${url(im.src)}" alt="${esc(im.alt)}" loading="lazy"></a>`).join("") +
    `</div><p class="muted hint">Trykk på et bilde for å åpne det i full størrelse.</p>`;
}

/* ---------- spiller ---------- */
function renderBook(book) {
  store.set(LAST_KEY, book.id);
  const multi = book.files.length > 1;
  const saved = store.get(POS_KEY + book.id) || { i: 0, t: 0 };
  let cur = Math.min(Math.max(saved.i || 0, 0), book.files.length - 1);

  $("app").innerHTML = `
    <a class="back" href="#/">← Alle bøker</a>
    <div class="now">
      ${book.cover ? `<img class="cover" src="${esc(book.cover)}" alt="">` : ""}
      <h1>${esc(book.title)}</h1>
      <div class="muted">${esc(book.author)}</div>
      <p class="chapter-now" id="chNow"></p>
      <input class="scrub" id="scrub" type="range" min="0" max="0" step="1" value="0" aria-label="Posisjon">
      <div class="times"><span id="tCur">0:00</span><span id="tDur">0:00</span></div>
      <div class="controls">
        ${multi ? `<button id="prev" aria-label="Forrige kapittel">${ICON.prev}</button>` : ""}
        <button id="back" aria-label="Tilbake ${SKIP_BACK} sekunder">${ICON.back}</button>
        <button class="play" id="play" aria-label="Spill av">${ICON.play}</button>
        <button id="fwd" aria-label="Frem ${SKIP_FWD} sekunder">${ICON.fwd}</button>
        ${multi ? `<button id="next" aria-label="Neste kapittel">${ICON.next}</button>` : ""}
      </div>
      <div class="extras"><button class="chip" id="speed">1×</button></div>
    </div>
    ${multi ? `<ol class="chapters" id="chapters"></ol>` : ""}`;

  const a = (audio = new Audio());
  a.preload = "metadata";
  const el = { play: $("play"), scrub: $("scrub"), tCur: $("tCur"), tDur: $("tDur"), chNow: $("chNow"), list: $("chapters") };
  let seeking = false, lastSave = 0;

  let dead = false;
  // Lagrer bare når posisjonen er ekte (metadata lastet) og boka fortsatt er aktiv.
  const save = () => {
    if (dead || !isFinite(a.duration) || !a.duration) return;
    store.set(POS_KEY + book.id, { i: cur, t: a.currentTime || 0, d: a.duration });
  };
  const onHide = () => { if (document.visibilityState === "hidden") save(); };

  function paintChapters() {
    el.chNow.textContent = multi ? book.files[cur].title : "";
    if (!el.list) return;
    el.list.innerHTML = book.files.map((f, i) =>
      `<li data-i="${i}" class="${i === cur ? "active" : i < cur ? "done" : ""}"><span class="n">${i + 1}</span><span>${esc(f.title)}</span></li>`).join("");
  }
  function load(i, t = 0, autoplay = false) {
    cur = i;
    a.src = srcUrl(book.files[i]);
    el.scrub.value = 0; el.scrub.max = 0; el.tCur.textContent = fmt(t); el.tDur.textContent = "0:00";
    if (t) a.addEventListener("loadedmetadata", () => { a.currentTime = t; }, { once: true });
    paintChapters();
    store.set(POS_KEY + book.id, { i, t, d: 0 });   // husk kapittel + ønsket posisjon med én gang
    if (autoplay) a.play().catch(() => {});
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: multi ? book.files[i].title : book.title, artist: book.author, album: book.title });
    }
  }
  const go = (i, autoplay = true) => { if (i >= 0 && i < book.files.length) load(i, 0, autoplay); };

  /* kontroller */
  el.play.onclick = () => (a.paused ? a.play().catch(() => {}) : a.pause());
  $("back").onclick = () => (a.currentTime = Math.max(0, a.currentTime - SKIP_BACK));
  $("fwd").onclick = () => (a.currentTime = Math.min(a.duration || Infinity, a.currentTime + SKIP_FWD));
  if (multi) { $("prev").onclick = () => (a.currentTime > 5 ? (a.currentTime = 0) : go(cur - 1)); $("next").onclick = () => go(cur + 1); }
  const speeds = [1, 1.25, 1.5, 1.75, 2, 0.8];
  let si = Math.max(0, speeds.indexOf(store.get("lydbok:speed") || 1));
  const applySpeed = () => { a.playbackRate = speeds[si]; $("speed").textContent = speeds[si] + "×"; };
  $("speed").onclick = () => { si = (si + 1) % speeds.length; store.set("lydbok:speed", speeds[si]); applySpeed(); };
  if (el.list) el.list.onclick = (e) => { const li = e.target.closest("li"); if (li) go(+li.dataset.i); };

  el.scrub.addEventListener("input", () => { seeking = true; el.tCur.textContent = fmt(el.scrub.value); });
  el.scrub.addEventListener("change", () => { a.currentTime = +el.scrub.value; seeking = false; });

  /* hendelser */
  a.addEventListener("loadedmetadata", () => { el.scrub.max = Math.floor(a.duration) || 0; el.tDur.textContent = fmt(a.duration); applySpeed(); });
  a.addEventListener("timeupdate", () => {
    if (!seeking) { el.scrub.value = a.currentTime; el.tCur.textContent = fmt(a.currentTime); }
    if (Date.now() - lastSave > 3000) { lastSave = Date.now(); save(); }
  });
  a.addEventListener("play", () => { el.play.innerHTML = ICON.pause; el.play.setAttribute("aria-label", "Pause"); });
  a.addEventListener("pause", () => { el.play.innerHTML = ICON.play; el.play.setAttribute("aria-label", "Spill av"); save(); });
  a.addEventListener("seeked", save);
  a.addEventListener("ended", () => {
    if (cur + 1 < book.files.length) return go(cur + 1, true);   // neste kapittel automatisk
    store.set(POS_KEY + book.id, { i: 0, t: 0, d: 0 });             // ferdig: start på nytt neste gang
  });
  a.addEventListener("error", () => {
    if (!a.src) return;
    fetch(a.src, { headers: { range: "bytes=0-0" } }).then((r) => {
      if (r.status === 401) { store.del(AUTH_KEY); location.reload(); }
    }).catch(() => {});
  });
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", onHide);
  cleanup = () => {
    save();
    dead = true;
    window.removeEventListener("pagehide", save);
    document.removeEventListener("visibilitychange", onHide);
  };

  if ("mediaSession" in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => a.play());
    ms.setActionHandler("pause", () => a.pause());
    ms.setActionHandler("seekbackward", () => $("back").click());
    ms.setActionHandler("seekforward", () => $("fwd").click());
    ms.setActionHandler("previoustrack", multi ? () => go(cur - 1) : null);
    ms.setActionHandler("nexttrack", multi ? () => go(cur + 1) : null);
  }

  load(cur, saved.t, wantPlay);
}

init();
