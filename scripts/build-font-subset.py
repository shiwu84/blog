#!/usr/bin/env python3
"""按站内实际用字重新生成正文衬线字体子集。

正文使用 Noto Serif SC 400 的子集（只包含 src/ 里出现过的字符），
好处是几十 KB 就能让没装思源宋体的访客看到一致的排版。

依赖（只需装一次）：
    pip install fonttools brotli

用法：
    python scripts/build-font-subset.py
    # 或者指定本地字体文件，跳过下载：
    python scripts/build-font-subset.py --font /path/to/NotoSerifSC-VF.ttf

新增文章后如果出现子集里没有的字，会逐字回退到系统字体（不会报错）。
想让新字也用上自托管字体时重新运行本脚本即可。
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
OUT = SRC / "assets" / "fonts" / "noto-serif-sc-400-subset.woff2"
CACHE = ROOT / ".local" / "font-cache" / "NotoSerifSC-VF.ttf"
FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf"

EXTRA_CHARS = "，。、；：？！“”‘’（）【】《》〈〉…—·～￥「」『』〔〕×÷≤≥→←↑↓↗"
PUNCTUATION = "，。、；：？！“”‘’（）【】《》〈〉…—·～￥「」『』〔〕×÷≤≥→←↑↓↗"


def collect_chars() -> str:
    chars: set[str] = set()
    for path in SRC.rglob("*"):
        if path.suffix not in {".md", ".mdx", ".astro", ".ts", ".js"} or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for char in text:
            code = ord(char)
            if 0x20 <= code <= 0x7E:
                chars.add(char)
            elif 0x4E00 <= code <= 0x9FFF:
                chars.add(char)
            elif char in EXTRA_CHARS:
                chars.add(char)
    chars.update(EXTRA_CHARS)
    chars.update("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
    return "".join(sorted(chars))


def ensure_font(font_arg: str | None) -> Path:
    if font_arg:
        path = Path(font_arg).expanduser().resolve()
        if not path.exists():
            raise SystemExit(f"找不到字体文件：{path}")
        return path
    if CACHE.exists():
        return CACHE
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    print(f"下载 Noto Serif SC 可变字体到 {CACHE} ...")
    urllib.request.urlretrieve(FONT_URL, CACHE)
    return CACHE


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 Noto Serif SC 400 正文子集")
    parser.add_argument("--font", help="Noto Serif SC 可变字体 TTF 路径（默认自动下载）")
    args = parser.parse_args()

    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
    except ImportError:
        raise SystemExit("缺少 fonttools / brotli，请先运行：pip install fonttools brotli")

    text = collect_chars()
    han_count = sum(1 for char in text if 0x4E00 <= ord(char) <= 0x9FFF)
    print(f"从 src/ 收集到 {len(text)} 个字符（其中汉字 {han_count} 个）")

    source = ensure_font(args.font)
    static_path = source.with_name("NotoSerifSC-400.ttf")
    if not static_path.exists():
        print("把可变字体实例化为 wght=400 ...")
        variable = TTFont(source)
        static = instantiateVariableFont(variable, {"wght": 400}, inplace=False, updateFontNames=True)
        static.save(static_path)

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.hinting = True

    font = subset.load_font(str(static_path), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(OUT), options)

    check = TTFont(str(OUT))
    missing = [char for char in text if ord(char) not in check.getBestCmap()]
    print(f"已生成 {OUT.relative_to(ROOT)}（{OUT.stat().st_size / 1024:.1f} KB）")
    if missing:
        print(f"警告：有 {len(missing)} 个字符未进入子集：{''.join(missing[:40])}")


if __name__ == "__main__":
    main()
