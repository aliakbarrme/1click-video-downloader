// 1-Click Video Downloader — background service worker
const HOST = "com.ali.videodl";
const active = new Map(); // id -> percent

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/128.png",
    title,
    message: String(message).slice(0, 250)
  });
}

function updateBadge() {
  if (active.size === 0) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const vals = [...active.values()];
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  chrome.action.setBadgeText({ text: active.size > 1 ? `${active.size}↓` : `${avg}%` });
}

function download(url) {
  if (!url || !/^https?:/i.test(url)) {
    notify("Download hobe na", "Ei page e kono web video URL nei.");
    return;
  }
  const id = crypto.randomUUID();
  active.set(id, 0);
  updateBadge();

  let port;
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (e) {
    active.delete(id);
    updateBadge();
    notify("Helper paoa jayni", "host\\install.bat run korechen? " + e.message);
    return;
  }

  let finished = false;
  port.onMessage.addListener((msg) => {
    if (msg.type === "start") {
      notify("Download shuru hoyeche", msg.title || url);
    } else if (msg.type === "progress") {
      active.set(id, msg.percent || 0);
      updateBadge();
    } else if (msg.type === "done") {
      finished = true;
      notify("Download shesh ✅", msg.file || "Downloads folder e save hoyeche");
    } else if (msg.type === "error") {
      finished = true;
      notify("Download fail ❌", msg.message || "Unknown error");
    }
  });
  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    if (!finished) {
      notify(
        "Download fail ❌",
        err ? `Helper connect hoyni: ${err.message}. host\\install.bat run korun.` : "Helper bondho hoye geche."
      );
    }
    active.delete(id);
    updateBadge();
  });
  port.postMessage({ url });
}

// 1 click: toolbar icon -> current tab er video
chrome.action.onClicked.addListener((tab) => download(tab.url));

// Right-click menu: link / video / page
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "dl-link", title: "Ei link er video download korun", contexts: ["link"] });
  chrome.contextMenus.create({ id: "dl-video", title: "Ei video download korun", contexts: ["video"] });
  chrome.contextMenus.create({ id: "dl-page", title: "Ei page er video download korun", contexts: ["page"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "dl-link") download(info.linkUrl);
  else if (info.menuItemId === "dl-video") {
    // blob: src download kora jay na, tai page URL use kori
    const src = info.srcUrl && /^https?:/i.test(info.srcUrl) ? info.srcUrl : null;
    download(src && !/blob:/.test(src) ? src : (info.pageUrl || tab.url));
  } else download(info.pageUrl || tab.url);
});
