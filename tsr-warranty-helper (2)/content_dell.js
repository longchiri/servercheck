// Dell 페이지 콘텐츠 스크립트
// 모드 결정: chrome.storage.session > runtime 메시지 > 페이지 콘텐츠 자동 감지

const LOG_PREFIX = "[TSR-EXT]";
function log(...a) { console.log(LOG_PREFIX, ...a); }

(async () => {
  // 🆕 Akamai 차단 페이지 (errors.edgesuite.net) 감지 — 즉시 보고
  if (location.host.includes("errors.edgesuite.net") ||
      (document.title || "").includes("Access Denied") ||
      /Access Denied/i.test(document.body?.innerText || "")) {
    // 차단 페이지로 redirect 됐음 — URL 에서 service tag 추출 시도
    const tagMatch = (location.href + " " + (document.body?.innerText || "")).match(/servicetag\/([A-Z0-9]+)/i);
    const tag = tagMatch ? tagMatch[1].toUpperCase() : "BLOCKED";
    log("🚫 Akamai 차단 감지 — 즉시 보고:", tag);
    try {
      chrome.runtime.sendMessage({ type: "warranty:extracted", data: { tag, status: "blocked", mode: "warranty", error: "Akamai 차단 (Access Denied) — Dell 측에서 IP 차단" } });
    } catch (_) {}
    return;
  }

  // 🆕 무효 태그 감지 — 여러 패턴으로 즉시 보고 (홈 리다이렉트, 본문 경고문 등)
  //   ① URL 파라미터: IsInvalidSelection=true
  //   ② URL 경로:    /support/home/ 로 튕긴 경우 (보통 IsTag=true&Selection=… 동반)
  //   ③ 본문 경고문: "해당 서비스 태그 또는 제품 ID와 일치하는 항목이 없습니다" / "no match"
  //   ④ 페이지 제목: "Dell 지원에 오신 것을 환영합니다" + 제품 식별 폼
  const _isInvalidByUrl =
    /IsInvalidSelection=true/i.test(location.search) ||
    (/\/support\/home\b/i.test(location.pathname) && /(IsTag=|Selection=)/i.test(location.search));
  const _detectInvalidByText = () => {
    const t = document.body?.innerText || "";
    return /해당 서비스 태그.*일치하는 항목이 없습니다/i.test(t) ||
           /서비스 태그.*일치하는.*항목.*없/i.test(t) ||
           /no match(?:es|ing).*service tag/i.test(t) ||
           /we could[n']?t find.*product/i.test(t) ||
           (/제품 식별 또는 지원 요청/i.test(t) && /지원에 오신 것을 환영/i.test(t));
  };
  // 본문 텍스트는 늦게 렌더링될 수 있어서 — URL이 아예 home 이면 짧게 기다린 후 본문도 검사
  let _isInvalid = _isInvalidByUrl || _detectInvalidByText();
  if (!_isInvalid && /\/support\/home\b/i.test(location.pathname)) {
    for (let i = 0; i < 5; i++) {   // 최대 약 2.5초 대기 (500ms × 5)
      await sleep(500);
      if (_detectInvalidByText()) { _isInvalid = true; break; }
    }
  }
  if (_isInvalid) {
    const sp = new URLSearchParams(location.search);
    const selTag = (sp.get("Selection") || sp.get("selection") || "").toUpperCase();
    let activeTag = selTag;
    try {
      const s = await chrome.storage.session.get(["currentTag"]).catch(()=>({}));
      if (!activeTag && s?.currentTag) activeTag = String(s.currentTag).toUpperCase();
    } catch (_) {}
    const tag = activeTag || "INVALID";
    log("⚠ Dell 측 무효 태그 감지 — 즉시 다음으로:", tag, "(by", _isInvalidByUrl?"URL":"본문", ")");
    try {
      chrome.runtime.sendMessage({
        type: "warranty:extracted",
        data: { tag, status: "invalid-tag", mode: "warranty", error: "Dell 측에서 무효 태그로 판정 — DB 에 없음" }
      });
    } catch (_) {}
    return;
  }

  const PATH_MATCH = /\/support\/product-details\/([^/]+)\/servicetag\/([^/]+)/;
  const m = location.pathname.match(PATH_MATCH);
  if (!m) return;
  const locale = m[1];
  const tag = m[2];

  // 🆕 작업 활성 상태 확인 — 큐 진행 중이 아니면 절대 동작 안 함
  const active = await isJobActive();
  if (!active) {
    log("⏸ 활성 작업 없음 — 자동 실행 안 함");
    return;
  }

  // 🚫 한국어 강제 redirect 제거 — Akamai 가 비정상적 navigation 으로 감지함
  //    URL은 background 가 이미 /ko-kr/ 로 만듦. Dell 이 영문으로 강제하면 영문으로 진행.
  if (locale !== "ko-kr") {
    log(`ℹ Dell 이 ${locale} 로 표시 — 그대로 진행 (한·영 후보 모두 시도)`);
  }

  // 🆕 mode 결정 — 다중 폴백
  let mode = await resolveMode();
  log("결정된 mode:", mode, "/ tag:", tag, "/ locale:", locale);

  // 🆕 페이지 콘텐츠 안정화 대기 — 랜덤 2~4초 (속도 우선)
  await humanSleep(2000, 4000);
  // 🆕 페이지 스크롤 살짝 (인간처럼)
  await humanScroll();

  if (mode === "specs") {
    await handleSpecsPage(tag);
  } else {
    await handleWarrantyPage(tag);
  }
})();

// 🆕 현재 큐가 활성 상태인지 background 에 확인
async function isJobActive() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "warranty:status" });
    if (resp?.isRunning) return true;
    // storage 에 현재 모드가 있고 그게 이 탭의 tag 와 매치되면 활성
    const s = await chrome.storage.session.get(["currentMode", "currentTag", "isRunning"]).catch(()=>({}));
    if (s.isRunning) return true;
    return false;
  } catch (e) {
    log("isJobActive 실패 — 안전하게 비활성으로 처리:", e?.message);
    return false;
  }
}

async function resolveMode() {
  // 1) chrome.storage 직접 조회 (service worker 잠들어도 storage 는 살아있음)
  try {
    const r = await chrome.storage.session.get(["currentMode", "currentTag"]);
    if (r?.currentMode) { log("storage.session 에서 mode:", r.currentMode); return r.currentMode; }
  } catch (_) {}
  try {
    const r = await chrome.storage.local.get(["currentMode", "currentTag"]);
    if (r?.currentMode) { log("storage.local 에서 mode:", r.currentMode); return r.currentMode; }
  } catch (_) {}
  // 2) background 메시지 조회
  try {
    const resp = await chrome.runtime.sendMessage({ type: "warranty:getMode" });
    if (resp && resp.mode) { log("runtime 메시지에서 mode:", resp.mode); return resp.mode; }
  } catch (_) {}
  log("⚠ mode 조회 실패 — 기본 warranty 로 폴백");
  return "warranty";
}

// ─── 워런티 ─────────────────────────────────────
async function handleWarrantyPage(tag) {
  // ESC 한번만 — 보수적
  closeFlyouts();
  await sleep(300);
  // 🆕 lazy-load 대응 — 스크롤 + 재시도로 버튼 찾기
  const serviceLink = await scrollAndFindButton([
    "서비스 관리", "Manage Service", "Manage service", "서비스 계약 관리"
  ], ["서비스 관리", "Manage Service", "Manage service"]);
  if (!serviceLink) {
    report(tag, { mode: "warranty", status: "no-button", error: "서비스 관리 버튼 없음" });
    return;
  }
  log("워런티 버튼 발견 → (마우스 이동 + 클릭)");
  serviceLink.scrollIntoView({ block: "center", behavior: "smooth" });
  await humanSleep(400, 900);
  // 🆕 인간처럼 마우스를 버튼으로 이동 + 살짝 호버 후 클릭
  await humanMouseMoveTo(serviceLink);
  await humanSleep(120, 380);
  safeClick(serviceLink);
  const got = await waitFor(() => {
    const t = document.body.innerText;
    return (t.includes("시작 날짜") && /시작 날짜\s*\n\s*\d+/.test(t)) ||
           (t.includes("Start Date") && /Start Date\s*\n/.test(t));
  }, 15000);   // 🆕 25→15초 (속도 우선)
  if (!got) {
    report(tag, { mode: "warranty", status: "timeout", error: "패널 로드 시간 초과" });
    return;
  }
  const t = document.body.innerText;
  const sL = sliceAfter(t, "시작 날짜") || sliceAfter(t, "Start Date");
  const eL = sliceAfter(t, "종료 날짜") || sliceAfter(t, "End Date");
  const pL = sliceAfter(t, "계획")     || sliceAfter(t, "Plan");
  // 🆕 서버/스토리지/네트워크 (엔터프라이즈) 모델 인식 — 화이트리스트
  //   ① PowerEdge / OEMR (서버 본체)
  //   ② PowerVault MD/ME/NX/DL (스토리지 — JBOD/SAN/NAS)
  //   ③ VxRail / PowerStore / PowerScale / Compellent / EqualLogic / Unity / Isilon / DataDomain
  //   ④ PowerSwitch / Force10 (네트워크)
  const SERVER_RE = /(OEMR[^\n]+|PowerEdge[^\n]+|PowerVault\s*(?:MD|ME|NX|DL)\d+\s*[^\n]*|MD\d{4}[^\n]*|ME\d{3,4}[^\n]*|VxRail[^\n]*|PowerStore[^\n]*|PowerScale[^\n]*|Compellent[^\n]*|EqualLogic[^\n]*|Unity\s*\d+[^\n]*|Isilon[^\n]*|Data\s*Domain[^\n]*|PowerSwitch[^\n]*|Force10[^\n]*)/i;
  const mm = t.match(SERVER_RE);
  // 🆕 비서버 제품 감지 (소비자/데스크탑/노트북/모니터/태블릿) — 서버 매칭 안 됐을 때만
  const NON_SERVER_RE = /(OptiPlex\s*[^\n]*|Latitude\s*[^\n]*|Precision\s*[^\n]*|XPS\s*[^\n]*|Vostro\s*[^\n]*|Inspiron\s*[^\n]*|Alienware\s*[^\n]*|Wyse\s*[^\n]*|ChromeBook[^\n]*|UltraSharp[^\n]*|Dell\s*Pro\b[^\n]*|모니터|Monitor\b|Display\b)/i;
  const isNonServer = !mm && NON_SERVER_RE.test(t);
  if (isNonServer) {
    const ntm = t.match(NON_SERVER_RE);
    const productType = ntm?.[1]?.trim().slice(0, 60) || "비서버 제품";
    log("⚠ 비서버 감지 — Service Tag 정리 대상:", tag, "/", productType);
    report(tag, {
      mode: "warranty",
      status: "not-server",
      productType,
      start: parseDate(sL),
      end: parseDate(eL),
      plan: pL?.trim() || null,
      dellModel: productType,
    });
    return;
  }
  report(tag, {
    mode: "warranty",
    status: "ok",
    start: parseDate(sL),
    end: parseDate(eL),
    plan: pL?.trim() || null,
    dellModel: mm?.[1]?.trim() || null,
  });
}

// 🆕 카트·플라이아웃·백드롭 닫기 — 보수적 버전 (다른 페이지 요소 건드리지 않음)
function closeFlyouts() {
  // 1) ESC 키 — 가장 안전. 대부분 모달이 자체적으로 닫음
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true }));

  // 2) 카트만 정밀 hide — "cart" 키워드 단독 매치
  const cartSels = [
    '.flyout', '[class*="dds__cart"]', '[class*="mh-cart"]', '[id*="cart"][role="dialog"]'
  ];
  for (const sel of cartSels) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        const cls = (el.className || "").toString().toLowerCase();
        // 우리가 열려는 사양 드로어는 절대 건드리지 않음
        if (/drawer-w-1064|product-spec|original-config|dynamic-drawer/.test(cls)) return;
        // visible 한 카트 본체만
        if (el.offsetWidth > 0 || el.offsetHeight > 0) {
          el.style.display = "none";
          el.setAttribute("aria-hidden", "true");
        }
      });
    } catch (_) {}
  }

  // 3) body 스크롤 잠금만 풀기 (overlay·backdrop 은 건드리지 않음 — Dell 정상 동작 보존)
  try {
    document.body.classList.remove("modal-open", "no-scroll", "overflow-hidden");
    if (document.body.style.overflow === "hidden") document.body.style.overflow = "";
  } catch (_) {}

  // 🚫 body.click() / 임의 클릭 절대 X — 다른 요소 잘못 클릭 방지
}

// 🆕 Dell 로그인 안 된 상태인지 — 더 엄격하게: 로그인 사용자가 있으면 false 강제
function isLoggedOut() {
  const text = document.body.innerText || "";
  // 🆕 먼저 로그인된 상태 신호 확인 — 있으면 즉시 false (로그인 됨)
  const loggedInSignals = [
    "My Account", "내 계정", "Sign Out", "로그아웃", "Log Out",
    "Account Settings", "프로파일", "Profile Settings",
  ];
  for (const s of loggedInSignals) {
    if (text.includes(s)) return false;
  }
  // user-name 같은 요소 확인
  const userEl = document.querySelector('[class*="user-name"], [class*="username"], [class*="account-name"], [class*="signed-in"]');
  if (userEl && isVisible(userEl)) return false;

  // 비로그인 신호
  const signals = [
    "전체 액세스 권한을 얻으십시오",
    "Get full access",
    "로그인하여 별칭 추가",
    "Log In to Add Alias",
  ];
  let hits = 0;
  for (const s of signals) {
    if (text.includes(s)) hits++;
  }
  const hasSignInBtn = !![...document.querySelectorAll('a, button')].find(el => {
    const t = (el.textContent || "").trim();
    return (t === "로그인" || t === "Sign In" || t === "Sign in") && isVisible(el);
  });
  return hits >= 1 && hasSignInBtn;
}

// 🆕 Quick links 박스 안의 "Product Specifications" 정확히 찾기 — 셀렉터 더 광범위
function findInQuickLinks() {
  // 1) 클래스 기반 박스 (다양한 패턴)
  const boxSels = [
    '[class*="quick-link"]', '[class*="QuickLink"]', '[class*="quicklink"]',
    '[class*="quick_link"]', '[data-testid*="quick-link"]',
    '[class*="sidebar"]', '[class*="side-link"]', 'aside'
  ];
  for (const sel of boxSels) {
    const boxes = document.querySelectorAll(sel);
    for (const box of boxes) {
      if (!isVisible(box)) continue;
      const links = box.querySelectorAll("a, button");
      for (const a of links) {
        const t = (a.textContent || "").trim();
        if (/Product\s*Specifications|제품 사양/i.test(t) && isVisible(a)) {
          log("Quick links 박스 안에서 발견:", t);
          return a;
        }
      }
    }
  }
  // 2) "Quick links" / "빠른 링크" 텍스트 근처
  const all = document.querySelectorAll("section, div, aside");
  for (const sec of all) {
    const inner = sec.innerText || "";
    if (!/^(Quick links|빠른 링크)\b/m.test(inner.split("\n")[0] || "")) continue;
    const links = sec.querySelectorAll("a, button");
    for (const a of links) {
      const t = (a.textContent || "").trim();
      if (/^(Product Specifications|제품 사양)$/i.test(t) && isVisible(a)) {
        log("Quick links 섹션에서 발견:", t);
        return a;
      }
    }
  }
  // 3) 페이지 어디든 정확한 텍스트 매치 (마지막 폴백)
  const els = [...document.querySelectorAll("a, button")];
  for (const a of els) {
    const t = (a.textContent || "").trim();
    if (/^(Product Specifications|제품 사양)$/i.test(t) && isVisible(a)) {
      log("페이지 전체 정확 매치:", t);
      return a;
    }
  }
  return null;
}

// ─── 제품 사양 (Original Configuration / Original 구성) ──────
async function handleSpecsPage(tag) {
  // 0) ESC 한번만 — 카트 hover 가 떠있으면 닫음 (보수적)
  closeFlyouts();
  await sleep(300);

  // 1) 이미 사양 페이지인지 — 한·영 모두 인식
  const isSpec = () => {
    const t = document.body.innerText;
    return /Review Product Specifications|Original Configuration|제품 사양 검토|원래 구성|구성 검토|Product Specifications/i.test(t);
  };

  if (!isSpec()) {
    // 🆕 정확 매칭만 — 단일 단어 ("Specifications", "Configuration") 제거 (카트·메뉴 매치 회피)
    const exactCandidates = [
      "제품 사양", "제품 사양 보기", "제품 사양 검토", "사양 보기", "구성 보기", "원래 구성",
      "Product Specifications", "Product specifications", "View Product Specifications",
      "Review Product Specifications", "Review product specifications",
      "Original Configuration", "View Original Configuration",
    ];
    // partial 도 너무 짧은 거 제거
    const partialCandidates = [
      "Product Specifications", "Product specifications",
      "제품 사양", "Original Configuration", "원래 구성", "Review Product"
    ];

    // 🆕 Quick links 박스 안에서 먼저 정확히 찾기 (가장 안전)
    let btn = findInQuickLinks();
    if (!btn) {
      btn = await scrollAndFindButton(exactCandidates, partialCandidates);
    }
    // 🆕 못 찾으면 즉시 보고 — 새로고침 폴백 X (Dell 트래픽 줄임)
    if (!btn) {
      const loggedOut = isLoggedOut();
      report(tag, {
        mode: "specs",
        status: loggedOut ? "auth-required" : "no-spec-button",
        error: loggedOut
          ? "Dell 로그인 필요 — 빠른 링크에 '제품 사양' 메뉴 자체가 표시 안 됨"
          : "제품 사양 버튼 없음 — OEM 모델 권한 부족 또는 사양 메뉴 미제공"
      });
      return;
    }
    log("사양 버튼 발견 → (마우스 이동 + 클릭):", btn.tagName, (btn.textContent || "").trim().slice(0,40), btn.getAttribute("href"));
    btn.scrollIntoView({ block: "center", behavior: "smooth" });
    await humanSleep(400, 900);
    // 🆕 인간처럼 마우스 이동 + 호버 후 클릭
    await humanMouseMoveTo(btn);
    await humanSleep(150, 400);
    safeClick(btn);

    // 🆕 사양 페이지가 떴는지 — 25초 대기, 더 광범위한 신호 인식
    const ok = await waitFor(() => {
      if (isSpec()) return true;
      // 드로어 본문에 파트번호가 보이면 OK
      const drawerText = [...document.querySelectorAll('.dds__drawer__body')]
        .map(el => el.innerText || "").join("\n");
      if (/\d{3}-[A-Z0-9]{3,5}/.test(drawerText)) return true;
      return false;
    }, 15000);   // 🆕 25→15초 (속도 우선)

    if (!ok) {
      report(tag, { mode: "specs", status: "spec-timeout", error: "제품 사양 페이지 로드 15초 초과 — 페이지가 느리거나 클릭이 안 됨" });
      return;
    }
  }

  // 🆕 3) 로딩 스피너 / "콘텐츠를 로드 중입니다" 사라질 때까지 대기 (최대 15초)
  log("⏳ 드로어 로딩 메시지 사라지길 대기");
  const loadingGone = await waitFor(() => {
    const drawerText = [...document.querySelectorAll('.dds__drawer__body, [class*="drawer"]')]
      .map(el => el.innerText || "").join("\n");
    return !/잠시 기다려|콘텐츠를 로드 중|Loading content|Please wait|Loading\.\.\./i.test(drawerText);
  }, 15000);
  log(loadingGone ? "✅ 로딩 메시지 사라짐" : "⚠ 15초 후에도 로딩 메시지 남음");

  // 🆕 4) 추가 10초 안정화 (스크롤·재시도 X) — Dell 콘텐츠 lazy load 시간 줌
  log("⏳ 10초 안정화 대기 (스크롤 안 함)");
  await sleep(10000);

  // 🆕 5) "Expand all" 클릭 — 필요하면 한 번만, 스크롤 X
  const expand = findByPartial(["Expand all", "Expand All", "모두 확장", "모두 펼치기", "전체 확장"]);
  if (expand) {
    log("'Expand all' 클릭 (1회)");
    safeClick(expand);
    await sleep(2000);
  }

  // 6) 파트 리스트 추출 — 스크롤 없이 1회 (DOM 에 이미 다 있어야 함)
  const parts = extractParts();
  log(`파트 추출: ${parts.length}개`);

  if (parts.length === 0) {
    report(tag, { mode: "specs", status: "no-parts", error: "파트 리스트 추출 실패 — 드로어 콘텐츠가 비어있거나 권한 부족" });
    return;
  }
  log("✅ 최종 파트 수:", parts.length);
  const specs = classifyParts(parts);
  report(tag, { mode: "specs", status: "ok", specs, partsCount: parts.length });
}

// 🆕 페이지 끝까지 점진적으로 스크롤 — lazy-load 트리거
async function scrollToBottom() {
  const step = window.innerHeight * 0.8;
  let prevY = -1;
  let safety = 30;  // 최대 30 스텝 = 약 30 화면 분
  while (safety-- > 0) {
    window.scrollBy(0, step);
    await sleep(400);
    const y = window.scrollY;
    if (y === prevY) break;  // 더 이상 스크롤 안 됨 = 페이지 끝
    prevY = y;
  }
  // 다시 위로 — 다음 작업 위해
  window.scrollTo(0, 0);
  await sleep(300);
}

// 🆕 lazy-load 페이지 대응: 스크롤하면서 버튼 탐색 + 정확 매치 → 부분 매치 폴백
async function scrollAndFindButton(exactCandidates, partialCandidates) {
  // 일단 그대로 찾아봄
  let btn = findByText(exactCandidates);
  if (btn) return btn;
  if (partialCandidates?.length) {
    btn = findByPartial(partialCandidates);
    if (btn) return btn;
  }

  // 스크롤하며 단계별 탐색
  const step = window.innerHeight * 0.7;
  let prevY = -1;
  let safety = 25;
  while (safety-- > 0) {
    window.scrollBy(0, step);
    await sleep(450);
    btn = findByText(exactCandidates);
    if (btn) { log("스크롤 후 정확 매치 발견"); return btn; }
    if (partialCandidates?.length) {
      btn = findByPartial(partialCandidates);
      if (btn) { log("스크롤 후 부분 매치 발견"); return btn; }
    }
    const y = window.scrollY;
    if (y === prevY) break;
    prevY = y;
  }
  // 위로 복귀
  window.scrollTo(0, 0);
  await sleep(300);
  return null;
}

function extractParts() {
  const text = document.body.innerText || "";
  const lines = text.split("\n").map(l => l.trim());
  const parts = [];
  const PART_RE = /^(\d{3}-[A-Z0-9]{3,5})\s*[:.\-]?\s*(.+?)\s*$/;
  const PART_INLINE_RE = /(\d{3}-[A-Z0-9]{3,5})/;
  const QTY_LABEL_ONLY = /^(수량|Qty|Quantity)$/i;
  const QTY_INLINE = /(?:수량|Qty|Quantity)\s*[:：]?\s*(\d+)/i;
  // 🆕 desc 자체에 박힌 수량 패턴
  //   곱셈 기호:
  //     - Unicode "×" "✕" "*" : 앞뒤 어디 붙어 있어도 OK (모델명에 안 쓰이는 글자)
  //     - ASCII "x" : 모델명(X550, XL710 등)과 충돌하므로 반드시 앞뒤 공백 있어야 함
  //   한글 어미 "개" : 단어 경계가 안 먹어서 구분자로 처리
  const QTY_IN_DESC = new RegExp(
    "(?:" +
      "[×✕*]\\s*(\\d{1,4})(?!\\d)" +                                 // ×14 / ✕ 14 / *14
      "|(?:^|\\s)x\\s+(\\d{1,4})(?!\\d)" +                            // " x 14" (앞뒤 공백 필수)
      "|\\((\\d{1,4})\\s*개\\)" +                                      // (14개)
      "|(?:^|[\\s,;:.\\-(])(\\d{1,4})\\s*개(?:$|[\\s,;:.)])" +         // 14개 (구분자 사이)
      "|\\b(\\d{1,4})\\s*EA\\b" +                                      // 14 EA
      "|qty(?:\\.|:)?\\s*(\\d{1,4})" +                                 // qty 14
      "|quantity(?:\\.|:)?\\s*(\\d{1,4})" +                            // quantity 14
    ")", "i"
  );
  const NUM_ONLY = /^\d+$/;
  const extractDescQty = (s) => {
    const m = String(s||"").match(QTY_IN_DESC);
    if (!m) return null;
    const n = Number(m[1] || m[2] || m[3] || m[4] || m[5] || m[6] || m[7]);
    return (n && n > 0 && n < 1000) ? n : null;
  };

  // ── Pass 1: 텍스트 기반 ──────────────────
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i];
    if (!t) continue;

    // 1) 인라인 파트 라인 ("540-BBUZ : 설명...")
    const mm = t.match(PART_RE);
    if (mm) {
      let qty = 1;
      // 같은 라인에 "수량: N" 있는지
      const inline = t.match(QTY_INLINE);
      if (inline) qty = Number(inline[1]) || 1;
      // 아니면 다음 50줄까지 다양한 패턴 검색 (룩어헤드 확대)
      else {
        for (let j = i+1; j < Math.min(i+50, lines.length); j++) {
          // "수량" 라벨 단독 → 다음 줄 숫자
          if (QTY_LABEL_ONLY.test(lines[j])) {
            const n = Number(lines[j+1]?.trim());
            if (n && n > 0 && n < 1000) { qty = n; break; }
          }
          // 인라인 "수량: N"
          const inl = lines[j].match(QTY_INLINE);
          if (inl) { qty = Number(inl[1]) || 1; break; }
          // 다음 파트 만나면 중단
          if (PART_RE.test(lines[j])) break;
        }
      }
      // 🆕 desc 안에 직접 박힌 수량 패턴이 있으면 우선 적용
      const desc = mm[2].trim();
      const descQty = extractDescQty(desc);
      if (descQty && descQty > qty) qty = descQty;
      parts.push({ code: mm[1], desc, qty });
      continue;
    }

    // 2) 카드 형식: "부품 번호" → 코드 → "설명" → desc → "수량" → 숫자
    if (/^부품\s*번호$|^Part\s*Number$/i.test(t)) {
      const code = lines[i+1]?.trim() || "";
      if (!code) continue;
      let desc = "";
      let qty = 1;
      for (let j = i+2; j < Math.min(i+30, lines.length); j++) {
        if (/^설명$|^Description$/i.test(lines[j])) {
          const dlines = [];
          for (let k = j+1; k < Math.min(j+15, lines.length); k++) {
            if (QTY_LABEL_ONLY.test(lines[k]) || /^부품\s*번호$|^Part\s*Number$/i.test(lines[k])) break;
            dlines.push(lines[k]);
          }
          desc = dlines.join(" ").trim();
        }
        if (QTY_LABEL_ONLY.test(lines[j])) {
          const n = Number(lines[j+1]?.trim());
          if (n && n > 0 && n < 1000) qty = n;
        }
        if (/^부품\s*번호$|^Part\s*Number$/i.test(lines[j]) && j > i+1) break;
      }
      // 🆕 desc 자체에 박힌 수량도 확인
      const descQty2 = extractDescQty(desc);
      if (descQty2 && descQty2 > qty) qty = descQty2;
      if (code && desc) parts.push({ code, desc, qty });
    }
  }

  // ── 🆕 Pass 2: DOM 기반 보완 — row/table 안의 수량 찾기 ────
  // 각 파트번호 element 의 같은 row 안에서 단독 숫자 element 검색
  const partElements = [...document.querySelectorAll('td, span, div, p, li, dt, dd')]
    .filter(el => {
      const t = (el.textContent || "").trim();
      return PART_INLINE_RE.test(t) && t.length < 200 && el.children.length <= 3;
    });

  for (const node of partElements) {
    const codeMatch = (node.textContent || "").match(PART_INLINE_RE);
    if (!codeMatch) continue;
    const code = codeMatch[1];

    // 같은 row/parent 컨테이너 찾기
    const row = node.closest('tr, [role=row], .row, [class*="part-row"], [class*="config-row"], [class*="item"], li, dl, [class*="line"]');
    if (!row) continue;

    // row 안의 단독 숫자 element (수량일 가능성)
    const qtyCandidates = [...row.querySelectorAll('td, span, div, dd')]
      .map(el => {
        const t = (el.textContent || "").trim();
        return { el, t, n: Number(t) };
      })
      .filter(x => NUM_ONLY.test(x.t) && x.n > 0 && x.n < 1000 && x.el.children.length === 0);   // 🆕 100→999 (고밀도 서버 지원)

    if (qtyCandidates.length === 1) {
      // row 안에 단독 숫자가 정확히 하나 → 수량 확정
      const existing = parts.find(p => p.code === code);
      if (existing && existing.qty === 1 && qtyCandidates[0].n > 1) {
        existing.qty = qtyCandidates[0].n;
      } else if (!existing) {
        parts.push({ code, desc: (node.textContent || '').replace(code, '').replace(/^[:\-.\s]+/, '').trim().slice(0, 200), qty: qtyCandidates[0].n });
      }
    } else if (qtyCandidates.length >= 2) {
      // 여러 개 → 라벨 옆 숫자 우선
      for (const c of qtyCandidates) {
        const prev = c.el.previousElementSibling;
        if (prev && /수량|Qty|Quantity/i.test((prev.textContent || "").trim())) {
          const existing = parts.find(p => p.code === code);
          if (existing && existing.qty === 1 && c.n > 1) existing.qty = c.n;
          break;
        }
      }
    }
  }

  // 중복 제거 — 같은 코드는 수량 큰 것 유지
  const seen = new Map();
  for (const p of parts) {
    const prev = seen.get(p.code);
    if (!prev || p.qty > prev.qty) seen.set(p.code, p);
  }
  return [...seen.values()];
}

// 🆕 Dell NIC 화이트리스트 — 알려진 파트번호 패턴 + 모델·칩셋명
//    파트번호 패턴: 540-Bxxx (대부분의 NIC), 555-Bxxx (추가 NIC), 528-Bxxx (일부), 384-Bxxx (Mellanox 일부)
//    모델/칩셋: 주요 Broadcom·Intel·Mellanox·QLogic·Chelsio·Solarflare·Emulex 시리즈
const NIC_PART_CODE_RE = /^(?:540|555|528|384|403|407|409|470|492|511|521|556)-[A-Z0-9]{3,4}$/i;
const NIC_MODEL_RE = new RegExp([
  // Broadcom
  "broadcom","브로드컴","netxtreme","57(?:09|14|16|18|19|20|21|22)\\b","5710","5719","5720","5721","5722","57810","57840",
  "57402","57404","57406","57408","57412","57414","57416","57417","57500","57504","57508",
  "(?<![a-z])bcm\\d{2,5}",
  // Intel
  "intel.*ethernet","x520","x540","x550","x556","x560","x710","xl710","xxv710","x722","x710-da[24]","e810",
  "e823","e822","e825","i350","i340","i210","i225","i226","i219","i40e","i40",
  // NVIDIA/Mellanox
  "mellanox","nvidia.*connectx","connectx[\\-_]?[34567]","bluefield","mt2[78]\\d{3}",
  // QLogic/Marvell
  "qlogic","fastlinq","41(?:000|112|122|132|142|152|162)","45(?:000|712)","57810","57840","cavium",
  // Chelsio
  "chelsio","t5[02][0-9]","t6[02][0-9]","t540","t580","t620","t6225",
  // Solarflare / Emulex / Marvell Aquantia
  "solarflare","sfn\\d","sfc\\d","emulex","oneconnect","oce\\d{2}","aquantia","atlantic",
  // 일반 키워드
  "이더넷","ethernet","sfp\\+?","qsfp(?:28|56)?\\+?","\\bnic\\b","네트워크\\s*(?:카드|어댑터|인터페이스|컨트롤러)","랜\\s*카드","lan\\s*card",
  "rndc","\\bocp\\b","daughter\\s*card","mezzanine","어댑터.*포트","adapter.*port","dual\\s*port","quad\\s*port"
].join("|"), "i");
// 속도 기반 보조 검출 (1G/10G/25G/40G/50G/100G/200G/400G + base/sfp/port/nic)
const NIC_SPEED_RE = /(?:^|\s)(?:1|10|25|40|50|100|200|400)\s*g(?:b)?e?\b/i;
const NIC_SPEED2_RE = /\b(?:1|10|25|40|50|100|200|400)g\s*(?:base|sfp|port|nic|tcp|네트워크|이더)/i;

function isNicLike(part) {
  const code = (part?.code || "").toUpperCase();
  const desc = part?.desc || "";
  if (code && NIC_PART_CODE_RE.test(code)) return true;       // 파트번호로 강력 매칭
  if (NIC_MODEL_RE.test(desc)) return true;                    // 모델/칩셋명
  if (NIC_SPEED_RE.test(desc)) return true;                    // 속도 키워드
  if (NIC_SPEED2_RE.test(desc)) return true;
  return false;
}

// 🆕 Dell 디스크 화이트리스트 — 파트번호 패턴 + 제조사·모델 시리즈
//    파트번호: 400-Axxx (가장 흔함), 400-Bxxx (신형 SSD), 400-Cxxx (NVMe 일부), 401-Axxx, 401-Bxxx
//    제조사/모델: Samsung·Intel·Micron·Toshiba/Kioxia·Seagate·WD·Hitachi·SK Hynix·Lite-On 등
const DISK_PART_CODE_RE = /^(?:400|401|470)-[A-Z0-9]{3,4}$/i;   // 405-는 PERC RAID 라 제외
const DISK_MODEL_RE = new RegExp([
  // 기본 키워드
  "\\bssd\\b","\\bhdd\\b","nvme","sas\\s*hdd","sata\\s*ssd","sata\\s*hdd","m\\.2","mSATA","u\\.2","u\\.3",
  "boss[-_]?s\\d?","boot[\\s-]?optimized","internal\\s*dual\\s*sd",
  "하드\\s*드라이브","하드드라이브","솔리드\\s*스테이트","드라이브\\s*캐디",
  // 용량 + 속도 패턴
  "\\d+\\s*tb\\s+\\d+k","\\d+\\s*gb\\s+\\d+k","\\d+\\s*[kr]?rpm",
  "\\d+\\s*gb\\s+ssd","\\d+\\s*tb\\s+ssd","\\d+\\s*gb\\s+hdd","\\d+\\s*tb\\s+hdd",
  // Samsung
  "samsung","\\bpm\\d{3,4}[a-z]?\\b","mz[\\-_][a-z0-9]+","\\bsm\\d{3,4}\\b","970\\s*evo","980\\s*pro","990\\s*pro",
  // Intel / Solidigm
  "intel.*ssd","solidigm","\\bdc\\s*[ps]\\d{4}","p[345]\\d{3}","s[345]\\d{3}","d3[\\-_]?s\\d{4}","d5[\\-_]?p\\d{4}","optane",
  // Micron
  "micron","crucial","mt[a-z0-9]+","\\b[57]\\d{3}\\s*max","\\b\\d{4}\\s*pro\\b","9100\\s*max","7400\\s*pro","7300\\s*max","5210","5300","5400",
  // Toshiba / Kioxia
  "toshiba","kioxia","kxg\\d","kcm\\d","kcd\\d","kpm\\d","cd[567]","cm[567]","px0[45]","px0\\d","mg0\\d","al1[45]",
  // Seagate
  "seagate","exos","ironwolf","savvio","cheetah","\\bst\\d{4}","st\\d+nx","st\\d+lx","st\\d+nm","st\\d+lm",
  // Western Digital / HGST / Hitachi
  "western\\s*digital","wdc?\\b","hgst","ultrastar","hus[a-z0-9]+","huc\\d","huh\\d","hdwf\\d","wd\\s*gold","wd\\s*red","wd\\s*black","wd[0-9]+","wus[a-z0-9]+",
  // SK Hynix / Liteon / Phison / 기타
  "sk\\s*hynix","hynix","liteon","lite[\\-_]?on","phison","goldenfir","sandisk","fusionio",
].join("|"), "i");

function isDiskLike(part) {
  const code = (part?.code || "").toUpperCase();
  const desc = part?.desc || "";
  if (code && DISK_PART_CODE_RE.test(code)) return true;
  return DISK_MODEL_RE.test(desc);
}

function classifyParts(parts) {
  const buckets = { cpu: [], memory: [], gpus: [], raid: [], nics: [], psus: [], idrac: [], os: [], disks: [], chassis: [], bios: [], rails: [], other: [] };

  // 🆕 CPU 를 가장 강력하게 매칭 — 메모리 키워드와 겹치면 CPU 우선
  const isCPU = (d) =>
    /(인텔\s*제온|Intel\s*Xeon|AMD\s*EPYC|AMD\s*Ryzen)/i.test(d) ||
    /(?:^|\s)(?:추가\s*)?프로세서/i.test(d) ||
    /(GHz|GT\/s|코어|cores?|threads?)/i.test(d) && /CPU|프로세서|processor/i.test(d) ||
    /\d+C\/\d+T/i.test(d);
  const isMemory = (d) =>
    /\d+\s*GB\s+(RDIMM|UDIMM|LRDIMM|DIMM)/i.test(d) ||
    /DDR[345]/i.test(d) ||
    /\d+\s*x\s*\d+\s*GB/i.test(d) ||
    /(메모리|memory),?/i.test(d) && !/제온|Xeon|EPYC|GPU/i.test(d);

  for (const p of parts) {
    const d = p.desc;
    // CPU 가 메모리보다 먼저 — "인텔 제온 골드 6240 2.6G... DDR4-2933" 같이 둘 다 매칭 가능한 경우 CPU 로
    if (isCPU(d) && !/그래픽|디스플레이|히트싱크|heatsink|방열판/i.test(d)) buckets.cpu.push(p);
    else if (isMemory(d)) buckets.memory.push(p);
    else if (/nvidia|amd radeon|tesla|quadro|rtx|h100|a100|l40|t4|v100/i.test(d) && !/cpu|프로세서/i.test(d)) buckets.gpus.push(p);
    else if (/perc|raid controller|raid 컨트롤러|h355|h745|h755|h965|s140|s150|s160|hba\d{3}/i.test(d)) buckets.raid.push(p);
    // 🆕 NIC 분류 — 화이트리스트(파트번호 + 모델·칩셋명 + 속도) 기반
    else if (isNicLike(p)) buckets.nics.push(p);
    else if (/전원\s*공급|psu|hot[\s-]?plug.*전원|핫\s*플러그.*전원|핫플러그.*전원|\d+w\s*ac|\d+\s*와트|티타늄|플래티넘.*전원|gold.*ps|platinum.*ps|titanium.*ps/i.test(d)) buckets.psus.push(p);
    else if (/idrac|integrated dell remote|openmanage/i.test(d)) buckets.idrac.push(p);
    else if (/windows server|red hat|rhel|ubuntu|esxi|vmware|운영체제|운영 체제|os\s*없음|no os/i.test(d)) buckets.os.push(p);
    else if (isDiskLike(p)) buckets.disks.push(p);
    else if (/uefi|bios|boot|secure boot|tpm/i.test(d)) buckets.bios.push(p);
    else if (/readyrails|레일|rail kit|cable management|케이블 관리/i.test(d)) buckets.rails.push(p);
    else if (/섀시|chassis|2\.5\"|3\.5\"|backplane|드라이브 베이|bay/i.test(d)) buckets.chassis.push(p);
    else buckets.other.push(p);
  }

  // 🆕 qty 정보를 desc 앞에 [qty:N] 으로 인코딩 (앱이 파싱)
  const join = arr => arr.length
    ? arr.map(x => `${x.code}: [qty:${x.qty || 1}] ${x.desc}`).join(" / ")
    : null;
  return {
    cpu: join(buckets.cpu), memory: join(buckets.memory), gpus: join(buckets.gpus),
    raidController: join(buckets.raid), nics: join(buckets.nics), psus: join(buckets.psus),
    idrac: join(buckets.idrac), os: join(buckets.os), disks: join(buckets.disks),
    chassis: join(buckets.chassis), bios: join(buckets.bios), rails: join(buckets.rails),
    other: join(buckets.other),
    _raw: parts.slice(0, 50), // 너무 크면 자름
    _updatedAt: Date.now(),
  };
}

// ─── 공통 헬퍼 ────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
// 🆕 봇 우회 — 랜덤 지연 (jitter)
function jitter(min, max) { return min + Math.floor(Math.random() * (max - min)); }
async function humanSleep(min, max) { return sleep(jitter(min, max)); }

// 🆕 봇 우회 — navigator.webdriver 숨김 + 자동화 흔적 제거 (있다면)
(function hideAutomation() {
  try {
    if (navigator.webdriver) {
      Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
    }
    // chrome.runtime 객체 존재해도 일반 사용자 자연스럽게 보이도록 노이즈만 추가
    if (!window.chrome) window.chrome = { runtime: {} };
  } catch (_) {}
})();

// 🆕 봇 우회 — 인간처럼 마우스 이동 시뮬레이션 (요소까지 다단계 mousemove)
async function humanMouseMoveTo(el) {
  if (!el || !el.getBoundingClientRect) return;
  try {
    const rect = el.getBoundingClientRect();
    const tx = rect.left + rect.width  * (0.3 + Math.random() * 0.4);
    const ty = rect.top  + rect.height * (0.3 + Math.random() * 0.4);
    // 시작점: 화면 중간 어딘가
    let cx = window.innerWidth  * (0.3 + Math.random() * 0.4);
    let cy = window.innerHeight * (0.3 + Math.random() * 0.4);
    const steps = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 베지어 곡선 느낌 — 직선 아니게 살짝 흔들림
      const wobble = Math.sin(t * Math.PI) * (10 + Math.random() * 20);
      const x = cx + (tx - cx) * t + wobble;
      const y = cy + (ty - cy) * t + wobble * 0.5;
      const ev = new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
      (document.elementFromPoint(x, y) || document.body).dispatchEvent(ev);
      await sleep(jitter(15, 35));
    }
    // hover 흉내
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window, clientX: tx, clientY: ty }));
    await humanSleep(80, 200);
  } catch (_) {}
}

// 🆕 봇 우회 — 인간처럼 페이지 스크롤 살짝 (도착 후 페이지 둘러보기)
async function humanScroll() {
  try {
    const total = document.documentElement.scrollHeight;
    const view = window.innerHeight;
    if (total <= view) return;
    // 🆕 빠르게 — 1~2 틱만 (이전 2~4 틱)
    const ticks = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < ticks; i++) {
      const dy = jitter(80, 280);
      window.scrollBy({ top: dy, behavior: "smooth" });
      await humanSleep(150, 400);
    }
  } catch (_) {}
}

async function waitFor(cond, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (cond()) return true; } catch (_) {}
    await sleep(500);
  }
  return false;
}

// safeClick — bubbles:true 로 복원 (Dell SPA 핸들러가 bubble 로 처리되는 경우 대응)
function safeClick(el) {
  if (!el) return false;
  try {
    const href = el.getAttribute && el.getAttribute("href");
    const isJsHref = el.tagName === "A" && /^javascript:/i.test(href || "");
    if (isJsHref) {
      const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(evt);
      return true;
    }
    el.click();
    return true;
  } catch (e) {
    log("safeClick 실패:", e?.message);
    try {
      const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(evt);
      return true;
    } catch (_) {}
    return false;
  }
}

// 🆕 가시 요소인지 — 카트·메뉴·hidden 요소 회피
function isVisible(el) {
  if (!el) return false;
  if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
  // 카트·메뉴 영역 안인지 (자주 등장하는 클래스)
  let p = el;
  while (p && p !== document.body) {
    const cls = (p.className || "").toString().toLowerCase();
    const id = (p.id || "").toString().toLowerCase();
    if (/cart|menu|navigation|sticky-header|breadcrumb|footer|toast|flyout/i.test(cls + " " + id)) {
      return false;
    }
    p = p.parentElement;
  }
  return true;
}

function findByText(candidates) {
  const els = document.querySelectorAll("a, button, [role=button], [role=tab], [role=link]");
  for (const el of els) {
    const txt = (el.textContent || "").trim();
    for (const c of candidates) {
      if (txt === c && isVisible(el)) return el;
    }
  }
  return null;
}

function findByPartial(candidates) {
  const els = document.querySelectorAll("a, button, [role=button], [role=tab], [role=link]");
  for (const el of els) {
    const txt = (el.textContent || "").trim();
    for (const c of candidates) {
      if (txt.includes(c) && isVisible(el)) return el;
    }
  }
  return null;
}

function sliceAfter(text, label) {
  const idx = text.indexOf(label);
  if (idx < 0) return null;
  const lines = text.substring(idx).split("\n");
  return lines[1]?.trim() || null;
}

function parseDate(s) {
  if (!s) return null;
  const m = s.match(/(\d+)[^0-9]+(\d+)[^0-9]+(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${String(m[1]).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`;
}

function report(tag, data) {
  chrome.runtime.sendMessage({
    type: "warranty:extracted",
    data: { tag, ...data },
  });
}
