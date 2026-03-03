# PKU Thesis Download — 代码架构与逻辑详解

## 一、整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome 浏览器                             │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │  popup.html  │    │ background.js│    │   论文阅读页面      │  │
│  │  popup.js    │    │ (Service     │    │                   │  │
│  │              │    │  Worker)     │    │  ┌─────────────┐  │  │
│  │  扩展弹窗 UI  │    │              │    │  │ content.js  │  │  │
│  │              │    │  - 脚本注入    │    │  │             │  │  │
│  │  ┌────────┐  │    │  - 文件下载    │    │  │ - 页面检测   │  │  │
│  │  │状态检测 │──┼───>│  - 打开文件夹  │<───┼──│ - 图片下载   │  │  │
│  │  │手动注入 │  │    │              │    │  │ - PDF 生成   │  │  │
│  │  │激活面板 │  │    │              │    │  │ - UI 面板    │  │  │
│  │  └────────┘  │    └──────────────┘    │  └─────────────┘  │  │
│  └──────────────┘                        │                   │  │
│                                          │  ┌─────────────┐  │  │
│  ┌──────────────┐                        │  │ styles.css  │  │  │
│  │ manifest.json│                        │  └─────────────┘  │  │
│  │              │                        │                   │  │
│  │ - 权限声明    │                        │  ┌─────────────┐  │  │
│  │ - URL 匹配    │                        │  │  jspdf.js   │  │  │
│  │ - 脚本注册    │                        │  └─────────────┘  │  │
│  └──────────────┘                        └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 二、文件职责总览

```
PKU-Thesis-Download/
│
├── manifest.json ··········· 扩展声明文件，定义权限、URL 匹配、脚本注册
│
├── content.js ·············· 【核心】注入论文页面的内容脚本
│   ├── ParallelRateLimiter · 并行限流器（控制同时请求数）
│   ├── retry() ············· 指数退避重试器
│   ├── detectThesisPage() ·· 检测当前页面是否为论文阅读页
│   ├── getThesisParams() ··· 提取论文 fid 和总页数
│   ├── extractThesisTitle()  智能提取论文标题/作者名
│   ├── fetchImageUrls() ···· 批量获取每页图片的 URL
│   ├── downloadImages() ···· 并行下载所有图片并转 base64
│   ├── generatePDF() ······· 用 jsPDF 拼接图片为 PDF 并保存
│   ├── optimizeImgLoading()  优化阅读体验（预加载 + 失败重试）
│   └── init() ·············· 入口：检测页面 → 添加按钮 → 启动优化
│
├── background.js ··········· Service Worker 后台脚本
│   ├── injectScripts() ····· 手动注入脚本到任意页面
│   └── handlePDFDownload() · 通过 chrome.downloads API 保存文件并打开文件夹
│
├── popup.html / popup.js ··· 扩展弹窗界面
│   ├── 状态检测 ············· 检查 content script 是否已加载
│   ├── 激活按钮 ············· 向 content script 发送激活消息
│   └── 手动注入 ············· 通过 background 注入脚本
│
├── styles.css ·············· 悬浮按钮 + 下载面板的样式
├── lib/jspdf.umd.min.js ··· jsPDF 库（PDF 生成）
├── icons/ ·················· 扩展图标
├── ocr_convert.py ·········· OCR 转换脚本（图片 PDF → 可搜索 PDF）
└── setup_ocr.sh ············ OCR 依赖安装脚本
```

## 三、核心下载流程

```
用户点击"开始下载"
        │
        ▼
┌─────────────────┐
│ 1. 解析图片链接   │  fetchImageUrls()
│                 │
│  每 2 页一组请求   │  GET /jumpServlet?fid=xxx&page=0
│  jumpServlet     │  GET /jumpServlet?fid=xxx&page=2
│  返回 JSON:      │  GET /jumpServlet?fid=xxx&page=4
│  { list: [{     │  ...
│    id: "1",     │
│    src: "http.."│  最多 3 个并行请求（ParallelRateLimiter）
│  }] }           │  失败自动重试 5 次（指数退避）
│                 │
│  进度: 0% → 50% │
└────────┬────────┘
         │ 得到 N 个图片 URL
         ▼
┌─────────────────┐
│ 2. 下载图片      │  downloadImages()
│                 │
│  fetch(imageUrl) │  VPN 环境下自动改写 URL
│      ↓          │  processVPNUrl()
│  blob → base64  │  FileReader.readAsDataURL()
│      ↓          │
│  new Image()    │  检测图片方向
│  width > height │  → landscape / portrait
│  ? "landscape"  │
│  : "portrait"   │  最多 3 个并行（同一限流器）
│                 │
│  进度: 50% → 90%│
└────────┬────────┘
         │ 得到 N 个 { base64, orientation }
         ▼
┌─────────────────┐
│ 3. 生成 PDF     │  generatePDF()
│                 │
│  new jsPDF()    │  创建 A4 尺寸文档
│      ↓          │
│  遍历每页:       │  横版: addImage(297×210)
│  addImage()     │  竖版: addImage(210×297)
│  addPage()      │
│      ↓          │
│  doc.output()   │  生成 data URI
│      ↓          │
│  进度: 90% → 100%│
└────────┬────────┘
         │ data URI 字符串
         ▼
┌─────────────────┐
│ 4. 保存文件      │
│                 │
│  content.js     │  chrome.runtime.sendMessage
│      ↓          │  { action: "downloadPDF", dataUri, filename }
│  background.js  │
│      ↓          │  chrome.downloads.download()
│  chrome.downloads│
│      ↓          │  监听 onChanged → state: "complete"
│  downloads.show()│  在 Finder 中高亮显示文件
│                 │
│  按钮 → "✓ 下载完成" (绿色)
└─────────────────┘
```

## 四、组件间通信

```
┌────────────┐         chrome.tabs.sendMessage          ┌─────────────┐
│            │ ──────────── getStatus ──────────────────>│             │
│  popup.js  │ <─────────── {isThesisPage,fid,...} ─────│ content.js  │
│            │ ──────────── activate ───────────────────>│             │
│            │                                          │             │
│            │    chrome.runtime.sendMessage             │             │
│            │ ─── {action:"inject",tabId} ────┐        │             │
└────────────┘                                 │        │             │
                                               ▼        │             │
                                     ┌──────────────┐   │             │
                                     │background.js │   │             │
                                     │              │   │             │
                                     │ injectScripts│──>│ (注入脚本)   │
                                     │              │   │             │
                                     │              │<──│ downloadPDF │
                                     │handlePDF     │   │             │
                                     │ Download     │   │             │
                                     │   ↓          │   │             │
                                     │ chrome       │   │             │
                                     │ .downloads   │   │             │
                                     │ .download()  │   │             │
                                     │   ↓          │   │             │
                                     │ .show()      │   │             │
                                     └──────────────┘   └─────────────┘
```

## 五、各模块详解

### 5.1 manifest.json — 扩展声明

| 字段 | 作用 |
|------|------|
| `manifest_version: 3` | 使用 Chrome 最新的 Manifest V3 规范 |
| `permissions: ["activeTab", "scripting", "downloads"]` | activeTab: 用户点击时获取当前标签页权限; scripting: 手动注入脚本; downloads: 管理文件下载并打开文件夹 |
| `host_permissions` | 声明可访问的域名（drm.lib.pku.edu.cn、各种 VPN 域名等） |
| `content_scripts.matches` | URL 匹配规则，命中时自动注入 jspdf + content.js + styles.css |
| `content_scripts.run_at: "document_idle"` | 页面加载完成后再注入，确保 DOM 已就绪 |
| `background.service_worker` | 注册 background.js 为 Service Worker |
| `action.default_popup` | 点击扩展图标时显示 popup.html |

### 5.2 content.js — 核心逻辑（注入论文页面）

#### 防重复加载

```
window.__PKU_THESIS_DOWNLOAD_LOADED__
```
通过全局标记防止手动注入时重复执行。

#### ParallelRateLimiter（并行限流器）

```
构造: new ParallelRateLimiter(3)  → 最多 3 个并发

add(asyncFn):
  if 运行中 < 3 → 立即执行
  else          → 放入队列等待

_next():
  每个任务完成后，从队列取出下一个执行
```

控制对北大服务器的并发请求数，避免触发 403 限流。

#### retry（指数退避重试）

```
第 1 次失败 → 等待 ~2s  后重试  (1000 × 2¹ + random)
第 2 次失败 → 等待 ~4s  后重试  (1000 × 2² + random)
第 3 次失败 → 等待 ~8s  后重试  (1000 × 2³ + random)
第 4 次失败 → 等待 ~16s 后重试  (1000 × 2⁴ + random)
第 5 次失败 → 抛出异常，停止重试
```

随机抖动（jitter）避免所有重试同时发出。

#### detectThesisPage（页面检测）

```
URL 包含 "pdfindex"?     ──→ ✓ 是论文页
URL 包含 "jumpServlet"?   ──→ ✓ 是论文页
存在 #fid + #totalPages?  ──→ ✓ 是论文页
存在 .fwr_page_box?       ──→ ✓ 是论文页
以上都不满足              ──→ ✗ 不是，等待手动激活
```

#### extractThesisTitle（标题提取，6 级降级策略）

```
策略 1: DOM 选择器   → .thesis-title, h1, h2 等 15 个选择器
策略 2: document.title → 排除 "首页" 等通用标题
策略 3: window.opener → 从打开论文的父页面获取标题
策略 4: URL 参数     → ?title=xxx 或 ?name=xxx
策略 5: #watermark   → 提取作者名（如 "周翔_学位论文"）
策略 6: fid 兜底     → "PKU-Thesis-5efc76c..."

每级策略失败 → 尝试下一级
命中后立即返回，不继续尝试
```

#### VPN URL 处理

```
原始图片 URL (服务器返回):
  https://drm.lib.pku.edu.cn/pdfboxServlet?fid=xxx&page=1

VPN 环境下改写为:
  https://pacvpn.pku.edu.cn/.../pdfboxServlet?fid=xxx&page=1&vpn=1
                              ↑ 当前页面的 base URL     ↑ 添加 vpn 参数

判断逻辑:
  当前 URL 包含 wpn.pku.edu.cn / pacvpn.pku.edu.cn / webvpn.bjmu.edu.cn
  → 启用 VPN URL 改写
```

#### 阅读优化模块

```
optimizeImgLoading()
├── MutationObserver (监听 DOM 变化)
│   ├── 新增 IMG 元素 → 记录原始 src
│   ├── 横向图片 → 自适应宽高样式
│   └── 加载失败 → retryImageLoad() 指数退避重试 (最多 8 次)
│
└── setupPreloading() (IntersectionObserver)
    ├── 观察每第 3 个 .fwr_page_box
    ├── 用户滚动到该页面时触发
    └── 调用 omg(index+3) 提前加载后续 3 页
```

### 5.3 background.js — 后台 Service Worker

```
接收消息              处理逻辑
─────────────────────────────────────────────
"inject"         →   chrome.scripting.executeScript()
                     依次注入: jspdf.js → styles.css → content.js

"downloadPDF"    →   chrome.downloads.download(dataUri, filename)
                     监听下载状态变化
                     完成后 → chrome.downloads.show() 打开文件夹
                     中断时 → 返回错误
```

### 5.4 popup.js — 扩展弹窗

```
打开弹窗
   │
   ├── 获取当前标签页 URL
   │
   ├── 尝试 sendMessage("getStatus") 到 content script
   │   │
   │   ├── 成功 + isThesisPage
   │   │   → 🟢 "已检测到论文阅读页"
   │   │   → 启用 [打开下载面板] 按钮
   │   │
   │   ├── 成功 + 非论文页
   │   │   → 🟡 "脚本已加载，但非论文页面"
   │   │   → 启用 [尝试激活] 按钮
   │   │
   │   └── 失败 (content script 未注入)
   │       → 🔴 "脚本未加载"
   │       → 启用 [手动注入脚本] 按钮
   │
   ├── [打开下载面板] → sendMessage("activate") → 关闭弹窗
   │
   └── [手动注入脚本] → sendMessage("inject") → background 注入
                      → 等待 500ms → sendMessage("activate")
```

## 六、下载进度分配

```
 0%                    50%                   90%      100%
  ├──────────────────────┼─────────────────────┼─────────┤
  │   解析图片链接 (50%)  │   下载图片 (40%)      │ PDF(10%)│
  │                      │                     │         │
  │  jumpServlet 请求     │  fetch 图片 blob     │ jsPDF   │
  │  每完成 2 页更新一次   │  每完成 1 张更新一次   │ addImage│
  │                      │                     │ save    │
```

## 七、错误处理策略

```
                   发生错误
                      │
           ┌──────────┴──────────┐
           ▼                     ▼
     网络请求失败            其他错误
     (403/500/超时)          (解码失败等)
           │                     │
           ▼                     ▼
   retry() 自动重试         直接抛出异常
   最多 5 次                     │
   指数退避                      ▼
           │              UI 显示错误信息
           │              按钮恢复可点击
     5 次后仍失败                │
           │              alert() 弹窗提示
           ▼
     同上处理
```

## 八、OCR 后处理流程

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  图片 PDF     │     │  OCRmyPDF    │     │ 可搜索 PDF   │
│  (插件下载)   │ ──> │  + Tesseract │ ──> │  (文字可选中) │
│              │     │  + 中文语言包  │     │              │
│  周翔_论文.pdf│     │              │     │ 周翔_论文     │
│              │     │  ocrmypdf    │     │   _OCR.pdf   │
│  纯图片       │     │  -l chi_sim  │     │              │
│  不可选中文字  │     │  +eng        │     │  外观不变     │
│              │     │  --force-ocr │     │  文字层叠加   │
└──────────────┘     └──────────────┘     └──────────────┘
```
