# PKU Thesis Download - 北大论文下载插件

Chrome 扩展（Manifest V3），用于下载[北京大学学位论文数据库](https://thesis.lib.pku.edu.cn/)中可查看的论文 PDF。

## 功能

- 一键下载论文所有页面，自动合并为 PDF 文件
- 支持多种访问方式：直连、Web VPN（wpn.pku.edu.cn）、PAC VPN（pacvpn.pku.edu.cn）、北医 WebVPN
- 自动提取作者名作为文件名，支持手动修改
- 下载完成后自动在 Finder 中显示文件
- 优化论文阅读体验：预加载、加载失败自动重试
- 附带 OCR 转换工具，可将图片 PDF 转为可搜索文字的 PDF

## 安装

1. 下载或 clone 本仓库
2. 打开 Chrome，访问 `chrome://extensions/`
3. 右上角开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本项目文件夹
5. 完成

## 使用

1. 在北大学位论文数据库中打开一篇论文的「查看全文」页面
2. 页面右下角会出现红色下载按钮，点击打开下载面板
3. 可修改文件名，然后点击「开始下载」
4. 下载完成后自动打开文件所在文件夹

如果自动按钮未出现，点击浏览器工具栏的扩展图标 → 「手动注入脚本」。

## OCR 文字识别（可选）

下载的 PDF 为图片格式，如需可选中/搜索的文字 PDF：

```bash
# 安装 OCR 工具（只需一次）
bash setup_ocr.sh

# 转换论文
python3 ocr_convert.py 你的论文.pdf
```

输出文件为 `论文名_OCR.pdf`，外观不变但文字可选中、可搜索。

## 技术说明

- 北大学位论文数据库接口仅提供图片渲染（DRM 保护），不提供原始 PDF 下载
- 本工具批量获取论文图片，使用 jsPDF 拼接为 PDF
- OCR 功能基于 [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) + [Tesseract](https://github.com/tesseract-ocr/tesseract)

## 项目结构

```
├── manifest.json        # Chrome 扩展配置（Manifest V3）
├── content.js           # 核心下载逻辑（内容脚本）
├── background.js        # Service Worker（下载管理）
├── popup.html/js        # 扩展弹窗 UI
├── styles.css           # 样式
├── lib/
│   └── jspdf.umd.min.js # jsPDF 库
├── icons/               # 扩展图标
├── ocr_convert.py       # OCR 转换脚本
└── setup_ocr.sh         # OCR 依赖安装脚本
```

## 重要提示

本工具仅限个人学习和研究使用。请尊重著作权，不要传播下载的论文文件。

## 致谢

基于 [xiaotianxt/PKU-Thesis-Download](https://github.com/xiaotianxt/PKU-Thesis-Download) 重构。

## License

GNU GPLv3
