(function () {
  "use strict";

  if (window.__PKU_THESIS_DOWNLOAD_LOADED__) return;
  window.__PKU_THESIS_DOWNLOAD_LOADED__ = true;

  const LOG_PREFIX = "[PKU-Thesis-Download]";
  const log = (...args) => console.log(LOG_PREFIX, ...args);
  const warn = (...args) => console.warn(LOG_PREFIX, ...args);
  const err = (...args) => console.error(LOG_PREFIX, ...args);

  // ========== 并行限流器 ==========
  class ParallelRateLimiter {
    constructor(maxParallel) {
      this.queue = [];
      this.running = 0;
      this.maxParallel = maxParallel;
    }

    add(fn) {
      return new Promise((resolve, reject) => {
        const wrapped = async () => {
          this.running++;
          try {
            resolve(await fn());
          } catch (e) {
            reject(e);
          } finally {
            this.running--;
            this._next();
          }
        };
        if (this.running < this.maxParallel) {
          wrapped();
        } else {
          this.queue.push(wrapped);
        }
      });
    }

    _next() {
      if (this.queue.length > 0 && this.running < this.maxParallel) {
        this.queue.shift()();
      }
    }
  }

  // ========== 重试器 ==========
  async function retry(fn, maxAttempts = 5, baseDelay = 1000) {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) {
          err(`Failed after ${maxAttempts} attempts:`, error);
          throw error;
        }
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        warn(`Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // ========== 页面检测 ==========
  function detectThesisPage() {
    const url = location.href;
    const hasPdfIndex = url.includes("pdfindex");
    const hasFid = !!document.querySelector("#fid");
    const hasTotalPages = !!document.querySelector("#totalPages");
    const hasPageBox = !!document.querySelector(".fwr_page_box");
    const hasJumpServlet = url.includes("jumpServlet");

    return hasPdfIndex || hasJumpServlet || (hasFid && hasTotalPages) || hasPageBox;
  }

  // ========== 参数提取 ==========
  function getThesisParams() {
    let fid = null;
    let totalPage = 0;

    const fidEl = document.querySelector("#fid");
    if (fidEl) {
      fid = fidEl.value;
    }
    if (!fid) {
      const match = location.href.match(/[?&]fid=([^&]+)/);
      if (match) fid = match[1];
    }

    const totalPagesEl = document.querySelector("#totalPages");
    if (totalPagesEl) {
      const text = totalPagesEl.textContent || totalPagesEl.innerText || "";
      const match = text.match(/(\d+)\s*$/);
      if (match) {
        totalPage = parseInt(match[1], 10);
      }
    }

    return { fid, totalPage };
  }

  // ========== VPN URL 处理 ==========
  function isVPN() {
    const url = location.href;
    return url.includes("wpn.pku.edu.cn") ||
           url.includes("pacvpn.pku.edu.cn") ||
           url.includes("webvpn.bjmu.edu.cn");
  }

  function processVPNUrl(imageUrl) {
    const baseVPN = location.href.split("pdfindex")[0];
    const servletPart = imageUrl.split("pdfboxServlet")[1];
    if (!servletPart) return imageUrl;

    let processed = `${baseVPN}pdfboxServlet${servletPart}`;
    if (!processed.includes("vpn=1")) {
      processed += (processed.includes("?") ? "&" : "?") + "vpn=1";
    }
    return processed;
  }

  // ========== 构建 baseUrl ==========
  function buildBaseUrl(fid) {
    const url = location.href;
    if (url.includes("wpn.pku.edu.cn") || url.includes("pacvpn.pku.edu.cn") || url.includes("webvpn.bjmu.edu.cn")) {
      const base = url.split("pdfindex")[0];
      return `${base}jumpServlet?fid=${fid}`;
    }
    return `/jumpServlet?fid=${fid}`;
  }

  // ========== 论文标题提取 ==========
  function extractThesisTitle() {
    const genericTitles = ["首页", "论文阅读", "在线阅读", "pdfindex", "index", ""];

    // 策略1: 页面中特定论文标题元素
    const titleSelectors = [
      ".thesis-title", ".doc-title", ".paper-title", ".article-title",
      "#title", "#docTitle", "#paperTitle", "#articleTitle",
      ".toolbar-title", ".header-title", ".viewer-title",
      ".fwr_title", "#fwr_title",
      "h1", "h2"
    ];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text && !genericTitles.includes(text) && text.length > 2 && text.length < 200) {
          log("标题来源: DOM 元素", sel, "->", text);
          return text;
        }
      }
    }

    // 策略2: document.title（排除通用标题）
    const docTitle = document.title.trim();
    if (docTitle && !genericTitles.includes(docTitle) && docTitle.length > 2) {
      log("标题来源: document.title ->", docTitle);
      return docTitle;
    }

    // 策略3: 尝试从父窗口/opener 获取标题
    try {
      const openerTitle = window.opener?.document?.title?.trim();
      if (openerTitle && !genericTitles.includes(openerTitle) && openerTitle.length > 2) {
        log("标题来源: opener.document.title ->", openerTitle);
        return openerTitle;
      }
    } catch (e) { /* 跨域限制 */ }

    // 策略4: URL 参数
    const urlParams = new URLSearchParams(location.search);
    for (const key of ["title", "name", "t", "docName"]) {
      const val = urlParams.get(key);
      if (val && val.length > 2) {
        log("标题来源: URL 参数", key, "->", val);
        return decodeURIComponent(val);
      }
    }

    // 策略5: 从第一页图片的 alt 属性提取
    const firstImg = document.querySelector(".fwr_page_bg_image");
    if (firstImg?.alt && firstImg.alt.length > 2 && !genericTitles.includes(firstImg.alt)) {
      log("标题来源: 首页图片 alt ->", firstImg.alt);
      return firstImg.alt;
    }

    // 策略6: 使用 fid 作为兜底
    const { fid } = getThesisParams();
    const fallback = fid ? `PKU-Thesis-${fid}` : `PKU-Thesis-${Date.now()}`;
    log("标题来源: 兜底 ->", fallback);
    return fallback;
  }

  // ========== 状态栏 UI ==========
  function createFloatingUI() {
    const existing = document.getElementById("pku-thesis-dl-panel");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "pku-thesis-dl-panel";
    panel.innerHTML = `
      <div class="pku-dl-header">
        <span class="pku-dl-title">论文下载</span>
        <button class="pku-dl-close" title="关闭">&times;</button>
      </div>
      <div class="pku-dl-body">
        <div class="pku-dl-status" id="pku-dl-status">就绪</div>
        <div class="pku-dl-progress-bar">
          <div class="pku-dl-progress-fill" id="pku-dl-progress-fill"></div>
        </div>
        <div class="pku-dl-info" id="pku-dl-info"></div>
        <button class="pku-dl-btn" id="pku-dl-start">开始下载</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(".pku-dl-close").addEventListener("click", () => {
      panel.style.display = "none";
    });

    const startBtn = panel.querySelector("#pku-dl-start");
    startBtn.addEventListener("click", () => startDownload());

    return {
      panel,
      setStatus(text) { document.getElementById("pku-dl-status").textContent = text; },
      setProgress(pct) { document.getElementById("pku-dl-progress-fill").style.width = pct + "%"; },
      setInfo(text) { document.getElementById("pku-dl-info").textContent = text; },
      setButtonEnabled(enabled) { startBtn.disabled = !enabled; startBtn.textContent = enabled ? "开始下载" : "下载中..."; },
      setButtonCompleted() {
        startBtn.disabled = true;
        startBtn.textContent = "✓ 下载完成";
        startBtn.classList.add("pku-dl-btn-done");
      }
    };
  }

  function createDownloadButton() {
    const btnList = document.querySelector("#btnList");
    const thumbtab = document.querySelector("#thumbtab");
    if (btnList && thumbtab) {
      try {
        const btn = thumbtab.cloneNode(true);
        btn.innerHTML = `
          <div class="panel-bg" style="background: url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23333%22><path d=%22M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z%22/></svg>') center center / 20px no-repeat;"></div>
          <span class="panel-name">下载</span>
        `;
        btnList.appendChild(btn);
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          showPanel();
        });
        log("侧边栏下载按钮已添加");
        return true;
      } catch (e) {
        warn("添加侧边栏按钮失败:", e);
      }
    }
    return false;
  }

  function createFloatingButton() {
    const btn = document.createElement("div");
    btn.id = "pku-thesis-dl-fab";
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28" fill="white"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    btn.title = "下载论文 PDF";
    btn.addEventListener("click", showPanel);
    document.body.appendChild(btn);
    log("悬浮下载按钮已添加");
  }

  // ========== UI 状态管理 ==========
  let ui = null;

  function showPanel() {
    if (!ui) {
      ui = createFloatingUI();
    }
    ui.panel.style.display = "block";

    const { fid, totalPage } = getThesisParams();
    if (fid && totalPage > 0) {
      ui.setInfo(`论文 ID: ${fid} | 共 ${totalPage} 页`);
      ui.setStatus("就绪，点击开始下载");
    } else {
      ui.setInfo("⚠ 未检测到论文参数，请确认当前页面是论文阅读页");
      ui.setStatus("无法识别");
    }
  }

  // ========== 下载流程 ==========
  const limiter = new ParallelRateLimiter(3);

  async function startDownload() {
    const { fid, totalPage } = getThesisParams();

    if (!fid || totalPage <= 0) {
      ui.setStatus("错误：无法获取论文参数");
      alert("无法获取论文参数 (fid 或 totalPage)。\n请确认当前页面是论文在线阅读页。");
      return;
    }

    ui.setButtonEnabled(false);
    log(`开始下载: fid=${fid}, totalPage=${totalPage}`);

    try {
      ui.setStatus("解析图片链接...");
      const urls = await fetchImageUrls(fid, totalPage);

      ui.setStatus("下载图片...");
      const images = await downloadImages(urls, totalPage);

      ui.setStatus("生成 PDF...");
      await generatePDF(images);
    } catch (error) {
      err("下载失败:", error);
      ui.setStatus("下载失败: " + error.message);
      ui.setButtonEnabled(true);
      alert("下载过程中出错：\n" + error.message);
    }
  }

  async function fetchImageUrls(fid, totalPage) {
    const baseUrl = buildBaseUrl(fid);
    let finished = 0;
    const tasks = [];

    for (let page = 0; page < totalPage; page += 2) {
      const url = `${baseUrl}&page=${page}`;
      tasks.push(() => retry(async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for page=${page}`);
        const json = await res.json();
        finished += 2;
        const pct = Math.min(100, Math.round(finished / totalPage * 50));
        ui.setProgress(pct);
        ui.setInfo(`解析链接: ${Math.min(finished, totalPage)}/${totalPage}`);
        return json.list;
      }));
    }

    const results = await Promise.all(tasks.map(t => limiter.add(t)));
    const flat = results.flat();

    const map = new Map(flat.map(item => [item.id, item.src]));

    if (map.size !== totalPage) {
      const missing = [];
      for (let i = 1; i <= totalPage; i++) {
        if (!map.has(String(i))) missing.push(i);
      }
      warn(`部分页面缺失: ${missing.join(",")}`);
    }

    const sorted = [...map.entries()]
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(entry => entry[1]);

    log(`已解析 ${sorted.length} 个图片链接`);
    return sorted;
  }

  async function downloadImages(urls, totalPage) {
    let finished = 0;
    const total = urls.length;

    const tasks = urls.map(url => () => retry(async () => {
      let fetchUrl = url;
      if (isVPN()) {
        fetchUrl = processVPNUrl(url);
      }

      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
      const blob = await res.blob();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result;
          const img = new Image();
          img.onload = () => {
            finished++;
            const pct = 50 + Math.round(finished / total * 40);
            ui.setProgress(pct);
            ui.setInfo(`下载图片: ${finished}/${total}`);
            resolve({
              base64,
              orientation: img.width > img.height ? "landscape" : "portrait"
            });
          };
          img.onerror = () => reject(new Error("图片解码失败"));
          img.src = base64;
        };
        reader.onerror = () => reject(new Error("Blob 读取失败"));
        reader.readAsDataURL(blob);
      });
    }));

    return Promise.all(tasks.map(t => limiter.add(t)));
  }

  async function generatePDF(images) {
    if (typeof jspdf === "undefined") {
      throw new Error("jsPDF 库未加载，请检查扩展是否完整安装");
    }

    ui.setInfo("正在拼接 PDF...");
    const doc = new jspdf.jsPDF({ format: "a4", orientation: "portrait" });

    for (let i = 0; i < images.length; i++) {
      const { base64, orientation } = images[i];
      if (orientation === "landscape") {
        doc.addImage(base64, "JPEG", 0, 0, 297, 210);
      } else {
        doc.addImage(base64, "JPEG", 0, 0, 210, 297);
      }
      if (i + 1 < images.length) {
        doc.addPage("a4", images[i + 1].orientation);
      }
      const pct = 90 + Math.round((i + 1) / images.length * 10);
      ui.setProgress(pct);
    }

    const title = extractThesisTitle();
    const safeFilename = title.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").trim();
    const filename = (safeFilename || "PKU-Thesis") + ".pdf";
    log("文件名:", filename);

    ui.setInfo("正在保存: " + filename);

    // 优先通过 chrome.downloads API 下载（可自动打开文件夹）
    try {
      const dataUri = doc.output("datauristring");
      const response = await chrome.runtime.sendMessage({
        action: "downloadPDF",
        dataUri,
        filename
      });
      if (response?.success) {
        ui.setStatus("下载完成！");
        ui.setProgress(100);
        ui.setInfo(filename + "  — 已在 Finder 中显示");
        ui.setButtonCompleted();
        log("PDF 已通过 chrome.downloads 保存并打开文件夹");
        return;
      }
    } catch (e) {
      warn("chrome.downloads 不可用，使用 fallback:", e.message);
    }

    // Fallback: 直接 doc.save()
    doc.save(filename);
    ui.setStatus("下载完成！");
    ui.setProgress(100);
    ui.setInfo(filename + "  — 已保存到下载文件夹");
    ui.setButtonCompleted();
    log("PDF 通过 doc.save() 保存完成");
  }

  // ========== 优化图片加载 ==========
  function optimizeImgLoading() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;
        mutation.addedNodes.forEach(node => {
          if (node.nodeName !== "IMG") return;
          if (!node.parentElement?.classList.contains("loadingBg")) return;

          node.addEventListener("load", function () {
            if (this.naturalWidth > this.naturalHeight) {
              this.style.height = "min(100%, 90vw / 1.414)";
              this.style.width = "auto";
            }
          });

          const originalSrc = node.src;
          if (originalSrc) {
            node.setAttribute("data-original-src", originalSrc);
            setTimeout(() => retryImageLoad(node), 1500);
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setupPreloading();
  }

  function retryImageLoad(img, attempt = 0) {
    const maxRetries = 8;
    if (img.complete && img.naturalWidth > 0) return;
    if (attempt >= maxRetries) {
      err(`Image load failed after ${maxRetries} retries: ${img.id}`);
      return;
    }

    const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000;
    warn(`Image retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms: ${img.id}`);

    setTimeout(() => {
      img.style.display = "";
      const parent = img.closest(".loadingBg");
      if (parent) parent.style.display = "block";
      img.style.opacity = "0";
      img.onload = () => { img.style.opacity = "1"; };

      const originalSrc = img.getAttribute("data-original-src");
      if (!originalSrc) return;
      const sep = originalSrc.includes("?") ? "&" : "?";
      img.src = `${originalSrc}${sep}_r=${Date.now()}`;

      setTimeout(() => retryImageLoad(img, attempt + 1), Math.max(delay, 2000));
    }, delay);
  }

  function setupPreloading() {
    const root = document.querySelector("#jspPane");
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const pages = document.getElementsByClassName("fwr_page_box");
          const index = Array.from(pages).indexOf(entry.target) + 1;
          obs.unobserve(entry.target);
          if (index % 3 !== 1) return;
          if (typeof omg === "function") {
            log(`Preloading pages ${index + 3}-${index + 5}`);
            omg(index + 3);
          }
        });
      },
      { root, rootMargin: "0px", threshold: 0 }
    );

    document.querySelectorAll(".fwr_page_box:nth-child(3n+1)")
      .forEach(page => observer.observe(page));
  }

  // ========== 消息监听（来自 popup / background） ==========
  chrome.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
    if (msg.action === "ping") {
      sendResponse({ alive: true, isThesisPage: detectThesisPage() });
    } else if (msg.action === "activate") {
      showPanel();
      sendResponse({ ok: true });
    } else if (msg.action === "getStatus") {
      const { fid, totalPage } = getThesisParams();
      sendResponse({
        isThesisPage: detectThesisPage(),
        fid,
        totalPage,
        url: location.href
      });
    }
    return true;
  });

  // ========== 初始化 ==========
  function init() {
    log("插件已加载，当前页面:", location.href);

    if (!detectThesisPage()) {
      log("当前页面不是论文阅读页，等待手动激活");
      return;
    }

    log("检测到论文阅读页面");
    const { fid, totalPage } = getThesisParams();
    log(`论文参数: fid=${fid}, totalPage=${totalPage}`);

    const sidebarAdded = createDownloadButton();
    createFloatingButton();

    optimizeImgLoading();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
