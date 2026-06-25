// tsr-cloud 앱 페이지 콘텐츠 스크립트 — 앱 ↔ 확장 background 브릿지
const SOURCE = "tsr-warranty-helper";

// 🆕 확장 컨텍스트 살아있는지 확인 헬퍼
function isExtensionAlive() {
  try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
  catch (_) { return false; }
}

// 앱 → 확장
window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const m = e.data;
  if (!m || m.source !== SOURCE) return;
  // 🆕 확장 죽었으면 사용자에게 안내
  if (!isExtensionAlive()) {
    window.postMessage({ source: SOURCE + "/dead", reqId: m.reqId, error: "Extension context invalidated — 페이지 새로고침 필요 (Cmd+Shift+R)" }, "*");
    return;
  }
  try {
    // 🆕 type + queue 외 모든 payload 도 그대로 전달 (warranty:skip 등 미래 호환)
    const payload = { ...m };
    delete payload.source;
    delete payload.reqId;
    chrome.runtime.sendMessage(payload, (resp) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ source: SOURCE + "/dead", reqId: m.reqId, error: chrome.runtime.lastError.message }, "*");
        return;
      }
      window.postMessage({ source: SOURCE + "/reply", reqId: m.reqId, resp }, "*");
    });
  } catch (err) {
    window.postMessage({ source: SOURCE + "/dead", reqId: m.reqId, error: err.message }, "*");
  }
});

// 확장 → 앱
try {
  chrome.runtime.onMessage.addListener((msg) => {
    try { window.postMessage({ source: SOURCE + "/event", ...msg }, "*"); }
    catch (_) {}
  });
} catch (_) {}

// 페이지 로드 직후 — 확장 존재 알림
try {
  window.postMessage({ source: SOURCE + "/ready", version: chrome.runtime.getManifest().version }, "*");
} catch (_) {}
