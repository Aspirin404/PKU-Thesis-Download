# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is a **Chrome Manifest V3 browser extension** (PKU Thesis Download) for downloading thesis PDFs from Peking University's library. There is no build step, no package manager, no `package.json`, and no backend server. The extension is loaded directly as an unpacked extension in Chrome.

An optional Python CLI tool (`ocr_convert.py`) converts downloaded image-based PDFs into searchable text PDFs using OCRmyPDF/Tesseract.

### Key files

| File | Role |
|---|---|
| `manifest.json` | Chrome extension manifest (V3) |
| `content.js` | Content script injected into PKU thesis pages |
| `background.js` | Service worker for downloads and script injection |
| `popup.html` / `popup.js` | Extension popup UI |
| `styles.css` | Styles for the floating download panel |
| `lib/jspdf.umd.min.js` | Vendored jsPDF library (no npm) |
| `ocr_convert.py` | Optional OCR conversion CLI tool |

### Running the extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** and select the `/workspace` directory
4. The extension appears as "PKU Thesis Download - 北大论文下载"

After loading, clicking the extension icon shows a popup with status detection. The extension activates automatically on PKU thesis reader pages (`drm.lib.pku.edu.cn`, etc.).

### Linting and testing

There is **no lint config or test suite** in this project. The codebase is plain vanilla JS/CSS/HTML with no build tooling. To validate correctness:
- Verify `manifest.json` is valid JSON and all referenced files exist
- Load the extension in Chrome and confirm no errors on `chrome://extensions/`
- Check the service worker status (should show "Inspect views: service worker")

### OCR tool (optional)

On Linux (Cloud VM), install OCR dependencies with:
```
sudo apt-get install -y ocrmypdf tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-eng
```
Then run: `python3 ocr_convert.py <file.pdf>`

Note: `setup_ocr.sh` is macOS-only (uses Homebrew). On the Cloud VM, use `apt-get` as above.

### Important caveats

- The extension's core download functionality **requires access to PKU's thesis database** (`thesis.lib.pku.edu.cn`), which is behind a campus network / VPN. End-to-end download testing is not possible without PKU network access.
- There is no hot-reload mechanism. After changing extension source files, click the refresh icon on the extension card in `chrome://extensions/` to reload.
- The `ocr_convert.py` script calls `subprocess.run(["open", str(out_dir)])` at the end, which is macOS-specific. On Linux this will fail silently but does not affect OCR output.
