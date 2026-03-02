#!/usr/bin/env python3
"""
PKU 学位论文 OCR 转换工具
将图片格式的论文 PDF 转换为可搜索、可选中文字的 PDF

使用方法:
  python ocr_convert.py 论文.pdf                   # 转换单个文件
  python ocr_convert.py 论文.pdf -o 输出.pdf        # 指定输出文件名
  python ocr_convert.py ~/Downloads/*.pdf           # 批量转换
  python ocr_convert.py 论文.pdf --lang chi_tra+eng # 指定繁体中文+英文
  python ocr_convert.py 论文.pdf --markdown         # 同时输出 Markdown 文本
"""

import argparse
import subprocess
import sys
import shutil
from pathlib import Path


def check_dependencies():
    """检查必要的依赖是否已安装"""
    missing = []

    if not shutil.which("ocrmypdf"):
        missing.append(("ocrmypdf", "brew install ocrmypdf"))

    if not shutil.which("tesseract"):
        missing.append(("tesseract", "brew install tesseract"))

    # 检查中文语言包
    if shutil.which("tesseract"):
        result = subprocess.run(
            ["tesseract", "--list-langs"],
            capture_output=True, text=True
        )
        if "chi_sim" not in result.stdout:
            missing.append(("中文语言包", "brew install tesseract-lang"))

    if missing:
        print("❌ 缺少以下依赖，请先安装：\n")
        for name, cmd in missing:
            print(f"   {name}: {cmd}")
        print()
        sys.exit(1)

    print("✅ 依赖检查通过")


def convert_pdf(input_path, output_path=None, lang="chi_sim+eng", deskew=True):
    """使用 OCRmyPDF 将图片 PDF 转为可搜索 PDF"""
    input_path = Path(input_path)
    if not input_path.exists():
        print(f"❌ 文件不存在: {input_path}")
        return False

    if output_path is None:
        output_path = input_path.with_stem(input_path.stem + "_OCR")
    output_path = Path(output_path)

    print(f"\n📄 正在转换: {input_path.name}")
    print(f"   语言: {lang}")
    print(f"   输出: {output_path.name}")

    cmd = [
        "ocrmypdf",
        "--language", lang,
        "--output-type", "pdf",
        "--optimize", "1",
        "--jobs", "4",
    ]

    if deskew:
        cmd.append("--deskew")

    cmd.extend([
        "--force-ocr",
        str(input_path),
        str(output_path)
    ])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            size_mb = output_path.stat().st_size / (1024 * 1024)
            print(f"   ✅ 转换成功! ({size_mb:.1f} MB)")
            return True
        else:
            print(f"   ❌ 转换失败: {result.stderr.strip()}")
            return False
    except Exception as e:
        print(f"   ❌ 执行出错: {e}")
        return False


def convert_to_markdown(input_path, output_dir=None):
    """使用 Marker 将 PDF 转为 Markdown 文本"""
    if not shutil.which("marker_single"):
        print("❌ Marker 未安装，请运行: pip install marker-pdf")
        return False

    input_path = Path(input_path)
    if output_dir is None:
        output_dir = input_path.parent / (input_path.stem + "_markdown")

    print(f"\n📝 正在转为 Markdown: {input_path.name}")
    print(f"   输出目录: {output_dir}")

    cmd = [
        "marker_single",
        str(input_path),
        "--output_dir", str(output_dir),
        "--output_format", "markdown",
        "--force_ocr",
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"   ✅ Markdown 转换成功!")
            return True
        else:
            print(f"   ❌ 转换失败: {result.stderr.strip()}")
            return False
    except Exception as e:
        print(f"   ❌ 执行出错: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="PKU 学位论文 OCR 转换工具 - 将图片 PDF 转为可搜索文字 PDF",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python ocr_convert.py 周翔_学位论文.pdf
  python ocr_convert.py *.pdf
  python ocr_convert.py 论文.pdf -o 论文_文字版.pdf
  python ocr_convert.py 论文.pdf --markdown
        """,
    )
    parser.add_argument("files", nargs="+", help="要转换的 PDF 文件路径")
    parser.add_argument("-o", "--output", help="输出文件路径（仅单文件时有效）")
    parser.add_argument(
        "--lang", default="chi_sim+eng",
        help="OCR 语言 (默认: chi_sim+eng 简体中文+英文)"
    )
    parser.add_argument(
        "--no-deskew", action="store_true",
        help="禁用自动纠正页面倾斜"
    )
    parser.add_argument(
        "--markdown", action="store_true",
        help="同时使用 Marker 输出 Markdown 文本"
    )

    args = parser.parse_args()

    check_dependencies()

    files = []
    for f in args.files:
        p = Path(f)
        if p.is_file() and p.suffix.lower() == ".pdf":
            files.append(p)
        else:
            print(f"⚠️  跳过非 PDF 文件: {f}")

    if not files:
        print("❌ 没有找到有效的 PDF 文件")
        sys.exit(1)

    print(f"\n共 {len(files)} 个文件待转换")
    print("=" * 50)

    success = 0
    for i, f in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}]", end="")
        output = args.output if (args.output and len(files) == 1) else None
        if convert_pdf(f, output, args.lang, not args.no_deskew):
            success += 1

        if args.markdown:
            convert_to_markdown(f)

    print("\n" + "=" * 50)
    print(f"完成! {success}/{len(files)} 个文件转换成功")

    if success > 0:
        out_dir = files[0].parent
        print(f"输出目录: {out_dir}")
        subprocess.run(["open", str(out_dir)])


if __name__ == "__main__":
    main()
