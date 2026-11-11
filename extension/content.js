// IDM-style floating "Download" button on top-right of videos
(() => {
  if (window.__vdlLoaded) return;
  window.__vdlLoaded = true;

  const MIN_W = 220, MIN_H = 124;
  let hostEl, root, wrap, btn, menu;
  let current = null;       // video element the button belongs to
  let menuOpen = false;
  let downloading = false;
  let infoCache = { url: null, data: null };

  const CSS = `
  :host { all: initial; }
  .wrap { position: fixed; top: 0; left: 0; display: none; flex-direction: column; align-items: flex-end;
          font: 13px/1.35 "Segoe UI", system-ui, sans-serif; }
  .btn { all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 6px 11px;
         background: #1d4ed8; color: #fff; border-radius: 6px; font-weight: 600; font-size: 12.5px;
         box-shadow: 0 2px 10px rgba(0,0,0,.35); opacity: .88; transition: opacity .15s, background .15s; white-space: nowrap; }
  .btn:hover { opacity: 1; background: #2563eb; }
  .btn svg { width: 14px; height: 14px; }
  .menu { margin-top: 6px; width: 270px; background: #111827; color: #e5e7eb; border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0,0,0,.5); overflow: hidden; border: 1px solid #374151; }
  .head { padding: 10px 12px; font-weight: 600; color: #fff; border-bottom: 1px solid #1f2937;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .list { max-height: 260px; overflow-y: auto; padding: 4px 0; }
  .item { all: unset; box-sizing: border-box; width: 100%; display: flex; justify-content: space-between; gap: 10px;
          padding: 8px 12px; cursor: pointer; }
  .item:hover { background: #1f2937; }
  .item .q { font-weight: 600; color: #fff; }
  .item .s { color: #9ca3af; font-size: 12px; }
  .tag { font-size: 10px; background: #2563eb; color: #fff; border-radius: 4px; padding: 1px 5px; margin-left: 6px; }
  .foot { border-top: 1px solid #1f2937; padding: 9px 12px; font-size: 12px; color: #9ca3af; display: flex; flex-direction: column; gap: 7px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #d1d5db; }
  .link { all: unset; cursor: pointer; color: #60a5fa; flex: none; }
  .link:hover { text-decoration: underline; }
  label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .msg { padding: 14px 12px; color: #d1d5db; }
  .err { color: #fca5a5; word-break: break-word; }
  .bar { height: 6px; background: #1f2937; border-radius: 3px; overflow: hidden; margin-top: 8px; }
  .bar > i { display: block; height: 100%; width: 0; background: #22c55e; transition: width .2s; }
  .spin { display: inline-block; width: 12px; height: 12px; border: 2px solid #4b5563; border-top-color: #60a5fa;
          border-radius: 50%; animation: r .8s linear infinite; vertical-align: -2px; margin-right: 6px; }
  @keyframes r { to { transform: rotate(360deg); } }
  `;

  const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtSize = (b) => !b ? "" : b > 1e9 ? `~${(b / 1e9).toFixed(1)} GB` : `~${Math.max(1, Math.round(b / 1e6))} MB`;

  function store(get) {
    return new Promise((res) => {
      try { chrome.storage.local.get(get, res); } catch { res({}); }
    });
  }
  function save(obj) { try { chrome.storage.local.set(obj); } catch {} }

  function build() {
    hostEl = document.createElement("vdl-overlay");
    hostEl.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
    root = hostEl.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>${CSS}</style><div class="wrap"><button class="btn">${ICON}<span>Download</span></button><div class="menu" hidden></div></div>`;
    wrap = root.querySelector(".wrap");
    btn = root.querySelector(".btn");
    menu = root.querySelector(".menu");
    // page er click handler jeno video pause/play na kore
    for (const t of ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "dblclick", "keydown", "wheel"])
      hostEl.addEventListener(t, (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => { e.preventDefault(); toggleMenu(); });
    document.addEventListener("mousedown", (e) => {
      if (menuOpen && !e.composedPath().includes(hostEl)) closeMenu();
    }, true);
  }

  function mount() {
    const fs = document.fullscreenElement;
    const parent = fs && fs.tagName !== "VIDEO" ? fs : document.documentElement;
    if (hostEl.parentNode !== parent) parent.appendChild(hostEl);
  }

  function visibleArea(r) {
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }

  function pickVideo() {
    let best = null, score = 0;
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      if (r.width < MIN_W || r.height < MIN_H) continue;
      const vis = visibleArea(r);
      if (vis < r.width * r.height * 0.35) continue;
      const s = vis + (v.paused ? 0 : 1e8);
      if (s > score) { score = s; best = v; }
    }
    return best;
  }

  function tick() {
    if (!hostEl) build();
    mount();
    if (!menuOpen && !downloading) current = pickVideo();
    if (!current || !current.isConnected) {
      if (!downloading) { wrap.style.display = "none"; closeMenu(); }
      return;
    }
    const r = current.getBoundingClientRect();
    if (!downloading && visibleArea(r) === 0) { wrap.style.display = "none"; return; }
    wrap.style.display = "flex";
    const w = wrap.offsetWidth || 110;
    const right = Math.min(r.right, innerWidth) - 10;
    wrap.style.left = Math.max(4, right - w) + "px";
    wrap.style.top = Math.max(4, r.top + 10) + "px";
  }

  // Video-r asol URL ber kora (feed e page URL bhul hote pare)
  function videoUrl(v) {
    const page = location.href;
    if (/youtube\.com\/(watch|shorts|embed|live)|youtu\.be\/|vimeo\.com\/(video\/)?\d|dailymotion\.com\/video|tiktok\.com\/@[^/]+\/video|facebook\.com\/.*\/videos\/|facebook\.com\/(reel|watch)|instagram\.com\/(p|reel|reels)\/|(x|twitter)\.com\/[^/]+\/status\//i.test(page))
      return page;
    const re = /\/(videos?|reels?|watch|status|p|clips?|shorts)\/|watch\?v=/i;
    const vr = v.getBoundingClientRect();
    let el = v.parentElement;
    for (let i = 0; i < 12 && el && el !== document.body; i++, el = el.parentElement) {
      const er = el.getBoundingClientRect();
      if (er.width * er.height > vr.width * vr.height * 6) break; // khub boro container, onno post er link hote pare
      const a = [...el.querySelectorAll("a[href]")].find((a) => re.test(a.href));
      if (a) return a.href;
    }
    const src = v.currentSrc || v.src;
    if (src && /^https?:/i.test(src) && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src)) return src;
    return page;
  }

  function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }
  function closeMenu() { menuOpen = false; if (menu && !downloading) menu.hidden = true; }

  async function openMenu() {
    menuOpen = true;
    menu.hidden = false;
    if (downloading) return;
    const url = videoUrl(current);
    if (infoCache.url === url && infoCache.data) return renderList(url, infoCache.data);
    menu.innerHTML = `<div class="msg"><span class="spin"></span>Quality khujchi…</div>`;
    let res;
    try { res = await chrome.runtime.sendMessage({ type: "info", url }); }
    catch (e) { res = { type: "error", message: e.message }; }
    if (!menuOpen) return;
    if (!res || res.type !== "info") return renderError(res && res.message);
    infoCache = { url, data: res };
    renderList(url, res);
  }

  function renderError(message) {
    menu.innerHTML = `<div class="msg err">❌ ${esc(message || "Video info pawa jayni")}</div>
      <div class="foot"><div class="row"><span>Helper chalu ache? install.bat run korun.</span></div></div>`;
  }

  async function renderList(url, info) {
    const { folder, askFolder = true } = await store(["folder", "askFolder"]);
    const dir = folder || info.default_dir;
    const rows = info.qualities.map((q, i) =>
      `<button class="item" data-h="${q.height}"><span class="q">${esc(q.label)}${i === 0 ? '<span class="tag">BEST</span>' : ""}</span><span class="s">${fmtSize(q.size)}</span></button>`
    ).join("") || `<button class="item" data-h=""><span class="q">Best quality</span><span class="s"></span></button>`;
    const audio = info.audio
      ? `<button class="item" data-audio="1"><span class="q">🎵 ${info.mp3 ? "MP3" : "Audio (M4A)"}</span><span class="s">shudhu audio</span></button>` : "";
    const warn = info.ffmpeg ? "" : `<div style="color:#fbbf24">ffmpeg nei — tai HD (720p+) list e nao thakte pare.</div>`;
    menu.innerHTML = `
      <div class="head" title="${esc(info.title)}">${esc(info.title)}</div>
      <div class="list">${rows}${audio}</div>
      <div class="foot">
        <div class="row"><span class="path" title="${esc(dir)}">📁 ${esc(dir)}</span><button class="link" data-act="change">Change</button></div>
        <label><input type="checkbox" ${askFolder ? "checked" : ""} data-act="ask"> Protibar folder jiggesh korbe</label>
        ${warn}
      </div>`;
    menu.querySelectorAll(".item").forEach((b) => b.addEventListener("click", () =>
      startDownload(url, b.dataset.h ? Number(b.dataset.h) : null, !!b.dataset.audio, dir)));
    menu.querySelector('[data-act="change"]').addEventListener("click", async () => {
      const r = await chrome.runtime.sendMessage({ type: "pick", folder: dir });
      if (r && r.type === "folder" && r.path) { save({ folder: r.path }); renderList(url, info); }
    });
    menu.querySelector('[data-act="ask"]').addEventListener("change", (e) => save({ askFolder: e.target.checked }));
  }

  async function startDownload(url, height, audio, folder) {
    const { askFolder = true } = await store(["askFolder"]);
    downloading = true;
    const label = btn.querySelector("span");
    menu.innerHTML = `<div class="msg"><span class="spin"></span><span class="t">${askFolder ? "Folder select korun…" : "Shuru hocche…"}</span><div class="bar"><i></i></div></div>`;
    const bar = () => menu.querySelector(".bar > i");
    const port = chrome.runtime.connect({ name: "download" });
    const finish = (html) => {
      downloading = false;
      label.textContent = "Download";
      menu.innerHTML = `<div class="msg">${html}</div>`;
      setTimeout(() => { if (!downloading) { menu.hidden = true; menuOpen = false; } }, 4000);
    };
    port.onMessage.addListener((m) => {
      if (m.type === "folder") save({ folder: m.path });
      else if (m.type === "start") { const t = menu.querySelector(".t"); if (t) t.textContent = "Download hocche…"; }
      else if (m.type === "progress") {
        label.textContent = `${m.percent}%`;
        if (bar()) bar().style.width = m.percent + "%";
      } else if (m.type === "done") finish(`✅ Download shesh!<br><span style="color:#9ca3af;font-size:12px;word-break:break-all">${esc(m.file)}</span>`);
      else if (m.type === "cancelled") finish("Batil kora hoyeche.");
      else if (m.type === "error") finish(`<span class="err">❌ ${esc(m.message)}</span>`);
    });
    port.onDisconnect.addListener(() => { if (downloading) finish(`<span class="err">❌ Helper bondho hoye geche.</span>`); });
    port.postMessage({ url, height, audio, folder, ask: askFolder });
  }

  setInterval(tick, 400);
  addEventListener("scroll", tick, { passive: true, capture: true });
  addEventListener("resize", tick, { passive: true });
  document.addEventListener("fullscreenchange", tick);
})();
