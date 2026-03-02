#!/bin/bash
# PKU 学位论文 OCR 工具 - 一键安装脚本 (macOS)
# 用法: bash setup_ocr.sh

set -e

echo "======================================"
echo "  PKU 学位论文 OCR 工具 - 安装向导"
echo "======================================"
echo ""

# 检查 Homebrew
if ! command -v brew &>/dev/null; then
    echo "❌ 未检测到 Homebrew，请先安装:"
    echo '   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
fi
echo "✅ Homebrew 已就绪"

# 安装 OCRmyPDF (会自动安装 tesseract 依赖)
echo ""
echo "📦 [1/3] 安装 OCRmyPDF 和 Tesseract..."
brew install ocrmypdf 2>/dev/null || echo "   (已安装)"

# 安装中文语言包
echo ""
echo "📦 [2/3] 安装 Tesseract 中文语言包..."
brew install tesseract-lang 2>/dev/null || echo "   (已安装)"

# 验证安装
echo ""
echo "📦 [3/3] 验证安装..."

if command -v ocrmypdf &>/dev/null; then
    echo "   ✅ ocrmypdf $(ocrmypdf --version 2>&1 | head -1)"
else
    echo "   ❌ ocrmypdf 安装失败"
    exit 1
fi

if command -v tesseract &>/dev/null; then
    echo "   ✅ tesseract $(tesseract --version 2>&1 | head -1)"
    # 检查中文支持
    if tesseract --list-langs 2>&1 | grep -q "chi_sim"; then
        echo "   ✅ 简体中文 (chi_sim) 语言包已安装"
    else
        echo "   ⚠️  简体中文语言包未找到，OCR 中文可能不准确"
    fi
else
    echo "   ❌ tesseract 安装失败"
    exit 1
fi

echo ""
echo "======================================"
echo "  ✅ 安装完成！"
echo "======================================"
echo ""
echo "使用方法："
echo ""
echo "  1. 转换单个文件:"
echo "     python3 ocr_convert.py 你的论文.pdf"
echo ""
echo "  2. 批量转换:"
echo "     python3 ocr_convert.py ~/Downloads/*.pdf"
echo ""
echo "  3. 指定输出文件名:"
echo "     python3 ocr_convert.py 论文.pdf -o 论文_文字版.pdf"
echo ""
echo "  4. 快速命令 (不用脚本):"
echo "     ocrmypdf -l chi_sim+eng --force-ocr 输入.pdf 输出.pdf"
echo ""
