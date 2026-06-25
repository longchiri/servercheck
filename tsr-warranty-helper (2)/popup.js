document.getElementById("v").textContent = chrome.runtime.getManifest().version;
chrome.runtime.sendMessage({ type: "warranty:status" }, (resp) => {
  if (!resp) return;
  const el = document.getElementById("status");
  if (resp.isRunning) {
    el.textContent = `진행 중 — 처리 ${resp.processed} · 남음 ${resp.queued}`;
  } else {
    el.textContent = `대기 중${resp.processed ? ` (직전 ${resp.processed}건 완료)` : ""}`;
  }
});
