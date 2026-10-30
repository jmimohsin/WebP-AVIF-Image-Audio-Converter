const SITE = "https://coders-hub.com";
const TOOLS = {
  compress: "/tools/images/image-compressor",
  webp: "/tools/images/webp-to-jpg-png",
  avif: "/tools/images/avif-converter",
  ocr: "/tools/images/image-to-text",
  svg: "/tools/images/svg-optimizer",
  watermark: "/tools/images/watermark-remover",
  trim: "/tools/video/audio-trimmer-cutter",
  aconvert: "/tools/video/audio-converter",
  support: "/support",
};

const MENUS = [
  ["img-png", "Save image as PNG", ["image"]],
  ["img-jpg", "Save image as JPG", ["image"]],
  ["img-webp", "Save image as WebP", ["image"]],
  ["img-sep", null, ["image"]],
  ["img-compress", "Compress in Coders Hub", ["image"]],
  ["img-ocr", "Extract text (OCR) in Coders Hub", ["image"]],
  ["img-watermark", "Remove watermark in Coders Hub", ["image"]],
  ["aud-save", "Download audio", ["audio"]],
  ["aud-trim", "Trim audio in Coders Hub", ["audio"]],
  ["aud-convert", "Convert audio in Coders Hub", ["audio"]],
  ["support-sep", null, ["image", "audio"]],
  ["support", "Help & support", ["image", "audio"]],
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "root", title: "WebP/AVIF Image & Audio Converter", contexts: ["image", "audio"] });
    for (const [id, title, contexts] of MENUS) {
      chrome.contextMenus.create(
        title ? { id, parentId: "root", title, contexts } : { id, parentId: "root", type: "separator", contexts },
      );
    }
  });
});

function baseName(url) {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "image";
    return decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 80) || "image";
  } catch {
    return "image";
  }
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function convertAndSave(url, format) {
  const mime = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[format];
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch image (" + res.status + ")");
  const bitmap = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (format === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  const out = await canvas.convertToBlob({ type: mime, quality: 0.92 });
  const dataUrl = "data:" + mime + ";base64," + toBase64(await out.arrayBuffer());
  await chrome.downloads.download({ url: dataUrl, filename: baseName(url) + "." + format, saveAs: false });
}

// Passing the media URL lets the website tool download it and open it ready to edit.
function openTool(path, mediaUrl) {
  const q = mediaUrl && /^(https?:|data:)/i.test(mediaUrl) && mediaUrl.length < 60000 ? "?url=" + encodeURIComponent(mediaUrl) : "";
  chrome.tabs.create({ url: SITE + path + q });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  const src = info.srcUrl;
  try {
    switch (info.menuItemId) {
      case "img-png": return await convertAndSave(src, "png");
      case "img-jpg": return await convertAndSave(src, "jpg");
      case "img-webp": return await convertAndSave(src, "webp");
      case "img-compress": return openTool(TOOLS.compress, src);
      case "img-ocr": return openTool(TOOLS.ocr, src);
      case "img-watermark": return openTool(TOOLS.watermark, src);
      case "aud-save": return await chrome.downloads.download({ url: src });
      case "aud-trim": return openTool(TOOLS.trim, src);
      case "aud-convert": return openTool(TOOLS.aconvert, src);
      case "support": return openTool(TOOLS.support);
    }
  } catch (err) {
    console.warn("[WebP/AVIF Converter]", err);
    // Fall back to saving the original file so the click is never lost.
    if (src && String(info.menuItemId).startsWith("img-")) chrome.downloads.download({ url: src });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "convert") {
    convertAndSave(msg.url, msg.format).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg?.type === "download") {
    chrome.downloads.download({ url: msg.url }).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "open") {
    openTool(TOOLS[msg.tool] || "/tools/images", msg.url);
    sendResponse({ ok: true });
  }
});
