document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const infoText = document.getElementById("info-text");
  const btnActivate = document.getElementById("btn-activate");
  const btnInject = document.getElementById("btn-inject");

  function setStatus(dotClass, text, info) {
    statusDot.className = "status-dot " + dotClass;
    statusText.textContent = text;
    if (info !== undefined) infoText.textContent = info;
  }

  let currentTab = null;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    infoText.textContent = tab.url || "";

    // 尝试联系已注入的 content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "getStatus" });
      if (response.isThesisPage) {
        setStatus("dot-green", "已检测到论文阅读页",
          `fid: ${response.fid || "未知"} | 共 ${response.totalPage || "?"} 页`);
        btnActivate.disabled = false;
        btnActivate.textContent = "打开下载面板";
      } else {
        setStatus("dot-yellow", "脚本已加载，但非论文页面", tab.url);
        btnActivate.disabled = false;
        btnActivate.textContent = "尝试激活";
      }
    } catch (e) {
      // content script 未加载
      setStatus("dot-red", "脚本未加载（URL 未匹配）", tab.url);
      btnInject.disabled = false;
    }
  } catch (e) {
    setStatus("dot-red", "无法获取当前标签页", e.message);
  }

  btnActivate.addEventListener("click", async () => {
    if (!currentTab) return;
    try {
      await chrome.tabs.sendMessage(currentTab.id, { action: "activate" });
      window.close();
    } catch (e) {
      setStatus("dot-red", "激活失败", e.message);
    }
  });

  btnInject.addEventListener("click", async () => {
    if (!currentTab) return;
    btnInject.disabled = true;
    btnInject.textContent = "注入中...";

    try {
      await chrome.runtime.sendMessage({
        action: "inject",
        tabId: currentTab.id
      });

      // 等待注入完成后尝试激活
      await new Promise(r => setTimeout(r, 500));
      try {
        await chrome.tabs.sendMessage(currentTab.id, { action: "activate" });
        setStatus("dot-green", "注入并激活成功", "");
        setTimeout(() => window.close(), 600);
      } catch (e) {
        setStatus("dot-yellow", "已注入，请手动操作", "脚本已注入，如未看到下载面板请刷新页面");
      }
    } catch (e) {
      setStatus("dot-red", "注入失败", e.message);
      btnInject.disabled = false;
      btnInject.textContent = "手动注入脚本";
    }
  });
});
