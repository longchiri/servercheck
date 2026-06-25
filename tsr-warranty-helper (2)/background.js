// TSR Warranty Helper — Background Service Worker
// 큐 항목의 fetchWarranty / fetchSpecs 플래그 보고 적절한 페이지 모드로 진입
// 모드 전달: chrome.storage.session (URL hash 충돌 회피)

const APP_ORIGIN = "https://tsr-cloud.pages.dev";
const DELL_BASE = tag =>
  `https://www.dell.com/support/product-details/ko-kr/servicetag/${encodeURIComponent(tag)}/overview`;

// 🚫 쿠키 강제 set 제거 — Akamai WAF 가 봇으로 판단해서 Access Denied 유발
// 한국어 페이지는 URL path 의 /ko-kr/ 로만 시도 (자연스러움)

let queue = [];
let isRunning = false;
let workTabId = null;
let appTabId = null;
let results = [];

let pendingPhase = null;   // "warranty" | "specs" | null
let phaseBuffer = {};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "warranty:start") {
    if (isRunning) { sendResponse({ ok: false, error: "이미 실행 중" }); return true; }
    queue = (msg.queue || []).map(q => ({
      id: q.id, tag: q.tag, model: q.model, hostname: q.hostname,
      fetchWarranty: !!q.fetchWarranty,
      fetchSpecs:    !!q.fetchSpecs,
    }));
    results = [];
    appTabId = sender.tab?.id || null;
    isRunning = true;
    startNext();
    sendResponse({ ok: true, total: queue.length });
    return true;
  }
  if (msg?.type === "warranty:extracted") {
    handleExtracted(msg.data);
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "warranty:status") {
    sendResponse({ isRunning, queued: queue.length, processed: results.length, results });
    return true;
  }
  if (msg?.type === "warranty:stop") {
    stopAll();
    sendResponse({ ok: true });
    return true;
  }
  // 🆕 현재 서버 건너뛰기 — 강제로 finalize 후 다음 큐 진행
  if (msg?.type === "warranty:skip") {
    if (isRunning && queue.length) {
      console.log("[TSR-EXT bg] 사용자가 현재 서버 스킵 요청");
      finalizeItem({ status: "skipped", error: "사용자가 응답 없음으로 스킵" });
    }
    sendResponse({ ok: true });
    return true;
  }
  // 🆕 content script 가 시작 시 현재 모드 조회
  if (msg?.type === "warranty:getMode") {
    sendResponse({ mode: pendingPhase, tag: queue[0]?.tag || null });
    return true;
  }
});

async function startNext() {
  if (!isRunning || queue.length === 0) {
    isRunning = false;
    pendingPhase = null;
    // 🆕 작업 끝났음을 storage 에도 기록 — content script 가 다음에 페이지 들어가도 동작 X
    try { await chrome.storage.session.set({ isRunning: false, currentMode: null, currentTag: null }); } catch (_) {}
    try { await chrome.storage.local.set({ isRunning: false, currentMode: null, currentTag: null }); } catch (_) {}
    notifyApp({ type: "warranty:done", results });
    return;
  }
  const next = queue[0];

  // 단계 결정: 워런티 우선 → 사양
  if (!pendingPhase) {
    if (next.fetchWarranty) pendingPhase = "warranty";
    else if (next.fetchSpecs) pendingPhase = "specs";
    else {
      // 둘 다 false → 스킵
      queue.shift();
      setTimeout(startNext, 50);
      return;
    }
    phaseBuffer = {};
  }

  // 🆕 chrome.storage 에 현재 모드 + isRunning 저장 — session 과 local 둘 다 set
  const payload = { currentMode: pendingPhase, currentTag: next.tag, isRunning: true };
  try { await chrome.storage.session.set(payload); } catch (_) {}
  try { await chrome.storage.local.set(payload); } catch (_) {}
  console.log("[TSR-EXT bg] startNext", next.tag, "mode=", pendingPhase,
              "fetchW=", next.fetchWarranty, "fetchS=", next.fetchSpecs);

  notifyApp({
    type: "warranty:progress",
    current: { ...next, phase: pendingPhase },
    processed: results.length,
    total: results.length + queue.length,
  });

  try {
    const url = DELL_BASE(next.tag);
    if (workTabId == null) {
      const tab = await chrome.tabs.create({ url, active: false });
      workTabId = tab.id;
    } else {
      await chrome.tabs.update(workTabId, { url, active: false });
    }
  } catch (e) {
    finalizeItem({ status: "error", error: e.message });
  }
}

function handleExtracted(data) {
  const item = queue[0];
  if (!item) return;

  if (data.mode === "warranty") phaseBuffer.warrantyData = data;
  else if (data.mode === "specs") phaseBuffer.specsData = data;
  else phaseBuffer.warrantyData = data; // 구버전 호환

  // 🆕 워런티→사양 사이 랜덤 2~4초 지연 (속도 단축)
  if (pendingPhase === "warranty" && item.fetchSpecs) {
    pendingPhase = "specs";
    const phaseDelay = 2000 + Math.floor(Math.random() * 2000);   // 2~4s
    setTimeout(startNext, phaseDelay);
    return;
  }

  finalizeItem();
}

function finalizeItem(extra) {
  const item = queue.shift();
  if (!item) return;
  const merged = {
    id: item.id,
    tag: item.tag,
    hostname: item.hostname,
    dbModel: item.model,
    warranty: phaseBuffer.warrantyData || null,
    specs: phaseBuffer.specsData || null,
    ...(extra || {}),
  };
  results.push(merged);
  notifyApp({ type: "warranty:result", item, data: merged });
  pendingPhase = null;
  phaseBuffer = {};
  // 🆕 다음 서버 진입 전 랜덤 4~10초 지연 (속도 단축, 봇 우회는 유지)
  //    + 8% 확률로 추가 3~8초 "쉬는" 시간
  let nextDelay = 4000 + Math.floor(Math.random() * 6000);   // 4~10s
  if (Math.random() < 0.08) nextDelay += 3000 + Math.floor(Math.random() * 5000);   // +3~8s
  setTimeout(startNext, nextDelay);
}

async function stopAll() {
  isRunning = false;
  queue = [];
  pendingPhase = null;
  phaseBuffer = {};
  // 🆕 storage 에서 즉시 비활성화 — content script 가 다음에 페이지 들어가도 동작 X
  try { await chrome.storage.session.set({ isRunning: false, currentMode: null, currentTag: null }); } catch (_) {}
  try { await chrome.storage.local.set({ isRunning: false, currentMode: null, currentTag: null }); } catch (_) {}
  if (workTabId) {
    chrome.tabs.remove(workTabId).catch(()=>{});
    workTabId = null;
  }
  notifyApp({ type: "warranty:stopped", results });
}

function notifyApp(msg) {
  if (!appTabId) return;
  chrome.tabs.sendMessage(appTabId, msg).catch(() => {});
}
