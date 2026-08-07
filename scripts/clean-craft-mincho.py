#!/usr/bin/env python3
"""
Craft Mincho(public/fonts/craft-mincho.woff2、font-displayトークンの実体、
サブセットしていない原本フォント)から、「cmapは持っていると主張するが実際には
輪郭データが空のグリフ」のcmapマッピングだけを取り除く一回性のクリーンアップ。

## 経緯
ユーザー報告: 体格の質問「華奢に近いですか?」で「奢」が表示されず
「華　ですか?」に見える。調査したところ、Craft Mincho原本フォント自体に
cmap上は存在する(cid04555)が輪郭データが空(RecordingPenでdrawさせても
描画コマンド0個)のグリフがあることが判明した。手描き風フォントにありがちな、
意匠が完成していない文字と思われる(比較として「華」は128個のコマンドを持ち正常)。

cmapが「持っている」と主張する限り、CSSの
`font-family: 'Craft Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif`
というフォールバック連鎖は発動せず、その文字だけ透明な空白として消えてしまう。

## 対処
グリフ自体は消さず、cmapのマッピングだけを削除する。これにより「このフォントは
この文字を持っていない」という正直な状態になり、ブラウザのフォント選択が
正しくフォールバック先(Hiragino Mincho ProN / Yu Mincho / serif)へ切り替わる。
「見えない」より「別書体で見える」方が圧倒的にましという判断。

サブセット処理ではなく原本フォント全体の是正なので、現在使われている文字集合に
限定せず全cmapエントリを走査する。これにより将来新しい文字が使われても
再実行不要になる。

## 再実行が必要になるケース
Craft Mincho原本を新しいバージョンに差し替えた場合は、このスクリプトを
再実行して同じクリーンアップをかけ直すこと。

使い方: .venv/bin/python3 scripts/clean-craft-mincho.py
"""

import sys
import unicodedata
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = ROOT / "public" / "fonts" / "craft-mincho.woff2"


def is_whitespace(cp: int) -> bool:
    ch = chr(cp)
    if ch.isspace():
        return True
    # Zsカテゴリ(スペース分離子)も念のため空白扱いにする
    return unicodedata.category(ch) == "Zs"


def is_glyph_empty(glyph_set, glyph_name: str) -> bool:
    pen = RecordingPen()
    try:
        glyph_set[glyph_name].draw(pen)
    except Exception:
        # 描画に失敗するグリフも「実質使えない」ので空扱いにする
        return True
    return len(pen.value) == 0


def main() -> None:
    font = TTFont(str(FONT_PATH))
    glyph_set = font.getGlyphSet()
    best_cmap = font.getBestCmap()

    broken_codepoints = set()
    for cp, glyph_name in best_cmap.items():
        if is_whitespace(cp):
            continue
        if is_glyph_empty(glyph_set, glyph_name):
            broken_codepoints.add(cp)

    print(f"検出: cmapにはあるが空のグリフ {len(broken_codepoints)}件(空白除く)")
    for cp in sorted(broken_codepoints):
        print(f"  U+{cp:04X} {chr(cp)!r}")

    if not broken_codepoints:
        print("対象なし。書き換えは行いません。")
        return

    removed_total = 0
    for table in font["cmap"].tables:
        removed_here = [cp for cp in broken_codepoints if cp in table.cmap]
        for cp in removed_here:
            del table.cmap[cp]
        removed_total += len(removed_here)

    print(f"\ncmapサブテーブル横断で削除したエントリ延べ数: {removed_total}")

    # woff2で読み込んだ場合font.flavorは自動的に'woff2'になっているはずだが、
    # 念のため明示しておく(save時にWOFF2圧縮されないと元の軽量さが崩れるため)。
    font.flavor = "woff2"
    font.save(str(FONT_PATH))
    print(f"\n✅ {FONT_PATH.relative_to(ROOT)} を更新しました。")


if __name__ == "__main__":
    sys.exit(main())
