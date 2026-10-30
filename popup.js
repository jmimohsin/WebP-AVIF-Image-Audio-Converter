let images = [];
let audio = [];
let filter = "all";
const $ = (id) => document.getElementById(id);
const status = (t) => { $("status").textContent = t; };
const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));

// Runs inside the page: collects images, CSS backgrounds, SVGs and audio sources.
function scanPage() {
  const imgs = new Map();
  const add = (url, w, h) => {
    if (!url || url.startsWith("data:image/gif") || imgs.has(url)) return;
    if (!/^(https?:|data:image)/.test(url)) return;
    imgs.set(url, { url, w: w || 0, h: h || 0 });
  };
  document.querySelectorAll("img").forEach((el) => add(el.currentSrc || el.src, el.naturalWidth, el.naturalHeight));
  document.querySelectorAll("picture source[srcset]").forEach((el) => {
    const first = el.srcset.split(",").pop().trim().split(" ")[0];
    try { add(new URL(first, location.href).href); } catch {}
  });
  document.querySelectorAll("*").forEach((el) => {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg !== "none" && bg.match(/url\(["']?(.*?)["']?\)/);
    if (m) { try { add(new URL(m[1], location.href).href); } catch {} }
  });
  const aud = new Set();
  document.querySelectorAll("audio, audio source, video source[type^='audio']").forEach((el) => {
    const s = el.currentSrc || el.src;
    if (s && /^https?:/.test(s)) aud.add(s);
  });
  document.querySelectorAll("a[href]").forEach((a) => {
    if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|$)/i.test(a.href)) aud.add(a.href);
  });
  return { images: [...imgs.values()].slice(0, 300), audio: [...aud].slice(0, 100) };
}

function formatOf(url) {
  if (url.startsWith("data:image/")) return url.slice(11, url.indexOf(";")).replace("svg+xml", "svg");
  const m = url.split(/[?#]/)[0].match(/\.([a-z0-9]{3,4})$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "img";
}

function shown() {
  return images.filter((i) =>
    filter === "all" ? true : filter === "large" ? Math.max(i.w, i.h) >= 1000 : i.format === filter,
  );
}

function btn(label, fn) {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", fn);
  return b;
}

async function convert(url, format) {
  status("Converting to " + format.toUpperCase() + "…");
  const r = await send({ type: "convert", url, format });
  status(r?.ok ? "Saved as " + format.toUpperCase() : "Could not convert: " + (r?.error || "unknown error"));
}

function renderImages() {
  const list = $("imgList");
  list.replaceChildren();
  const items = shown();
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No images found for this filter.";
    list.append(li);
  }
  for (const i of items) {
    const li = document.createElement("li");
    li.className = "card";
    const img = document.createElement("img");
    img.src = i.url; img.loading = "lazy"; img.alt = "";
    const meta = document.createElement("div");
    meta.className = "meta";
    const badge = document.createElement("span");
    badge.className = "badge"; badge.textContent = i.format;
    const dim = document.createElement("span");
    dim.textContent = i.w ? i.w + "×" + i.h : "";
    meta.append(badge, dim);
    const row = document.createElement("div");
    row.className = "row";
    row.append(btn("PNG", () => convert(i.url, "png")), btn("JPG", () => convert(i.url, "jpg")), btn("WebP", () => convert(i.url, "webp")));
    row.append(btn("Original", () => send({ type: "download", url: i.url })));
    const tools = document.createElement("div");
    tools.className = "row";
    tools.append(
      btn("Compress", () => send({ type: "open", tool: "compress", url: i.url })),
      btn("OCR", () => send({ type: "open", tool: "ocr", url: i.url })),
      btn("Watermark", () => send({ type: "open", tool: "watermark", url: i.url })),
    );
    li.append(img, meta, row, tools);
    list.append(li);
  }
  $("imgCount").textContent = images.length;
}

function renderAudio() {
  const list = $("audList");
  list.replaceChildren();
  if (!audio.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No audio found. Start playing the audio, then reopen this popup.";
    list.append(li);
  }
  for (const url of audio) {
    const li = document.createElement("li");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() || url);
    const row = document.createElement("div");
    row.className = "row";
    row.append(
      btn("Download", () => send({ type: "download", url })),
      btn("Trim in Coders Hub", () => send({ type: "open", tool: "trim", url })),
      btn("Convert in Coders Hub", () => send({ type: "open", tool: "aconvert", url })),
    );
    li.append(name, row);
    list.append(li);
  }
  $("audCount").textContent = audio.length;
}

async function bulk(format) {
  const items = shown().filter((i) => i.format !== "svg");
  for (let n = 0; n < items.length; n++) {
    status("Saving " + (n + 1) + " of " + items.length + "…");
    await send({ type: "convert", url: items[n].url, format });
  }
  status(items.length ? "Saved " + items.length + " images as " + format.toUpperCase() : "Nothing to save");
}

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
  $("images").hidden = b.dataset.tab !== "images";
  $("audio").hidden = b.dataset.tab !== "audio";
}));
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
  filter = c.dataset.filter;
  document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === c));
  renderImages();
}));
document.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  send({ type: "open", tool: a.dataset.open });
}));
$("allPng").addEventListener("click", () => bulk("png"));
$("allJpg").addEventListener("click", () => bulk("jpg"));

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scanPage });
    images = res.result.images.map((i) => ({ ...i, format: formatOf(i.url) }));
    audio = res.result.audio;
  } catch {
    status("This page can't be scanned (browser pages and the web store are protected).");
  }
  renderImages();
  renderAudio();
})();
