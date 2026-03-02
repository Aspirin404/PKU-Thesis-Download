chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "inject") {
    injectScripts(msg.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.action === "downloadPDF") {
    handlePDFDownload(msg, sender)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

async function injectScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["lib/jspdf.umd.min.js"]
  });

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["styles.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function handlePDFDownload({ dataUri, filename }, sender) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: dataUri,
        filename: filename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        function onChanged(delta) {
          if (delta.id !== downloadId) return;

          if (delta.state?.current === "complete") {
            chrome.downloads.onChanged.removeListener(onChanged);
            chrome.downloads.show(downloadId);

            if (sender.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "downloadComplete",
                downloadId
              }).catch(() => {});
            }

            resolve({ success: true, downloadId });
          }

          if (delta.state?.current === "interrupted") {
            chrome.downloads.onChanged.removeListener(onChanged);
            reject(new Error("下载被中断"));
          }
        }

        chrome.downloads.onChanged.addListener(onChanged);
      }
    );
  });
}
