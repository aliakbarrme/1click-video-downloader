// 1-Click Video Downloader — background service worker
const HOST = "com.ali.videodl";
const active = new Map(); // id -> percent

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/128.png",
    title,
    message: String(message || "").slice(0, 250)
  });
}

function updateBadge() {
  if (active.size === 0) return chrome.action.setBadgeText({ text: "" });
  const vals = [...active.values()];
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  chrome.action.setBadgeText({ text: active.size > 1 ? `${active.size}↓` : `${avg}%` });
}

// Native helper e download chalay; onMsg diye progress page e pathay
function runDownload(job, onMsg = () => {}) {
  if (!job.url || !/^https?:/i.test(job.url)) {
    const m = { type: "error", message: "Ei page e kono web video URL nei." };
    notify("Download hobe na", m.message);
    return onMsg(m);
  }
  const id = crypto.randomUUID();
  active.set(id, 0);
  updateBadge();

  let finished = false;
  const port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener((msg) => {
    onMsg(msg);
    if (msg.type === "start") notify("Download shuru hoyeche", msg.title);
    else if (msg.type === "progress") { active.set(id, msg.percent || 0); updateBadge(); }
    else if (msg.type === "done") { finished = true; notify("Download shesh ✅", msg.file); }
    else if (msg.type === "error") { finished = true; notify("Download fail ❌", msg.message); }
    else if (msg.type === "cancelled") finished = true;
  });
  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    if (!finished) {
      const m = err ? `Helper connect hoyni: ${err.message}. host\\install.bat run korun.` : "Helper bondho hoye geche.";
      notify("Download fail ❌", m);
      onMsg({ type: "error", message: m });
    }
    active.delete(id);
    updateBadge();
  });
  port.postMessage({ action: "download", ...job });
}

function native(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(HOST, msg, (res) => {
      const err = chrome.runtime.lastError;
      resolve(err ? { type: "error", message: `Helper connect hoyni: ${err.message}` } : res);
    });
  });
}

// Page er button theke: quality list / folder picker
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "info") native({ action: "info", url: msg.url }).then(reply);
  else if (msg.type === "pick") native({ action: "pick", folder: msg.folder }).then(reply);
  else return false;
  return true;
});

// Page er button theke: download + progress
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "download") return;
  let alive = true;
  port.onDisconnect.addListener(() => { alive = false; });
  port.onMessage.addListener((job) => {
    runDownload(job, (m) => { if (alive) port.postMessage(m); });
  });
});

async function quick(url) {
  const { folder } = await chrome.storage.local.get("folder");
  runDownload({ url, height: null, audio: false, folder: folder || null, ask: false });
}

// Toolbar icon: 1 click e best quality, last folder e
chrome.action.onClicked.addListener((tab) => quick(tab.url));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "dl-link", title: "Ei link er video download korun", contexts: ["link"] });
    chrome.contextMenus.create({ id: "dl-video", title: "Ei video download korun", contexts: ["video"] });
    chrome.contextMenus.create({ id: "dl-page", title: "Ei page er video download korun", contexts: ["page"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "dl-link") quick(info.linkUrl);
  else if (info.menuItemId === "dl-video") {
    const src = info.srcUrl && /^https?:/i.test(info.srcUrl) ? info.srcUrl : null;
    quick(src || info.pageUrl || tab.url);
  } else quick(info.pageUrl || tab.url);
});
