// SHA-256 av passordet (selve passordet står ikke i koden).
// Lag nytt: printf 'passord' | sha256sum
const PASSWORD_HASH = "5cacc27b6dff50f0191f37f86f90139c36cbae42b893ee1430cb267272f2d406";
const AUTH_KEY = "lydbok:auth";
const POS_KEY = "lydbok:pos:";   // + bok-id -> {i, t, d, ts}
const LAST_KEY = "lydbok:last";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let catalog = null;

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}
function srcUrl(book, f) {
  return /^https?:\/\//.test(f.src) ? f.src : catalog.baseUrl.replace(/\/?$/, "/") + f.src.replace(/^\//, "");
}

async function init() {
  if (store.get(AUTH_KEY) === PASSWORD_HASH) return start();
  $("login").classList.remove("hidden");
}
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const h = await sha256($("pw").value);
  if (h === PASSWORD_HASH) {
    store.set(AUTH_KEY, h);
    $("login").classList.add("hidden");
    start();
  } else {
    $("err").textContent = "Feil passord";
  }
});

async function start() {
  $("app").classList.remove("hidden");
  try {
    catalog = await (await fetch("books.json", { cache: "no-cache" })).json();
  } catch {
    $("app").innerHTML = "<p class='err'>Kunne ikke laste books.json</p>";
    return;
  }
  window.addEventListener("hashchange", route);
  route();
}

function route() {
  const m = location.hash.match(/^#\/bok\/(.+)$/);
  const book = m && catalog.books.find((b) => b.id === decodeURIComponent(m[1]));
  book ? renderBook(book) : renderList();
}

function progressOf(book) {
  const p = store.get(POS_KEY + book.id);
  return p || null;
}

function renderList() {
  const last = store.get(LAST_KEY);
  const lastBook = last && catalog.books.find((b) => b.id === last);
  let html = "<h1>Lydbøker</h1>";
  if (lastBook) {
    const p = progressOf(lastBook);
    html += `<a class="card" href="#/bok/${encodeURIComponent(lastBook.id)}"><small>Fortsett å lytte</small><br><b>${esc(lastBook.title)}</b>` +
      (p ? `<br><small>${esc(lastBook.files[p.i]?.title || "")} · ${fmt(p.t)}</small>` : "") + "</a>";
  }
  for (const b of catalog.books) {
    const p = progressOf(b);
    const pct = p ? Math.round(((p.i + (p.d ? p.t / p.d : 0)) / b.files.length) * 100) : 0;
    html += `<a class="card" href="#/bok/${encodeURIComponent(b.id)}"><b>${esc(b.title)}</b><br><small>${esc(b.author)} · ${b.files.length} filer</small>` +
      (pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : "") + "</a>";
  }
  $("app").innerHTML = html;
}

function renderBook(book) {
  store.set(LAST_KEY, book.id);
  const saved = progressOf(book) || { i: 0, t: 0 };
  let cur = Math.min(saved.i, book.files.length - 1);
  $("app").innerHTML = `
    <p><a href="#/">← Alle bøker</a></p>
    <h1>${esc(book.title)}</h1>
    <p class="muted">${esc(book.author)}</p>
    <audio id="player" controls preload="metadata"></audio>
    <div class="row">
      <button class="ghost" id="back">−15 s</button>
      <button class="ghost" id="fwd">+30 s</button>
      <select id="speed" class="ghost"><option>0.8</option><option selected>1</option><option>1.25</option><option>1.5</option><option>1.75</option><option>2</option></select>
    </div>
    <ol class="chapters" id="chapters"></ol>`;
  const a = $("player");
  const list = $("chapters");

  function save() {
    store.set(POS_KEY + book.id, { i: cur, t: a.currentTime || 0, d: a.duration || 0, ts: Date.now() });
  }
  function paint() {
    list.innerHTML = book.files.map((f, i) => `<li data-i="${i}" class="${i === cur ? "active" : ""}"><span>${esc(f.title)}</span></li>`).join("");
  }
  function load(i, t = 0, play = false) {
    cur = i;
    a.src = srcUrl(book, book.files[i]);
    a.addEventListener("loadedmetadata", () => { if (t) a.currentTime = t; }, { once: true });
    paint();
    save();
    if (play) a.play().catch(() => {});
  }
  list.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) load(+li.dataset.i, 0, true);
  });
  $("back").onclick = () => (a.currentTime = Math.max(0, a.currentTime - 15));
  $("fwd").onclick = () => (a.currentTime += 30);
  $("speed").onchange = (e) => (a.playbackRate = +e.target.value);
  a.addEventListener("ended", () => { if (cur + 1 < book.files.length) load(cur + 1, 0, true); });
  let last = 0;
  a.addEventListener("timeupdate", () => { if (Date.now() - last > 3000) { last = Date.now(); save(); } });
  ["pause", "seeked"].forEach((ev) => a.addEventListener(ev, save));
  const flush = () => { if (document.visibilityState !== "visible") save(); };
  document.addEventListener("visibilitychange", flush);
  window.addEventListener("pagehide", save);

  load(cur, saved.t);

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: book.title, artist: book.author });
    navigator.mediaSession.setActionHandler("seekbackward", () => ($("back").click()));
    navigator.mediaSession.setActionHandler("seekforward", () => ($("fwd").click()));
  }
}

init();
