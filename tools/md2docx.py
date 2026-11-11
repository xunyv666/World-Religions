#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 Markdown 清单转成 Word 文档。

只支持清单里用到的写法：标题、表格、无序列表、复选框、引用、粗体、行内代码。
目的不是通用转换器，而是让「升级清单.md」能一键生成 .docx，两边内容永远一致。

用法：
    python tools/md2docx.py 升级清单.md 升级清单.docx
"""
import io
import os
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

CJK = "微软雅黑"
LATIN = "Segoe UI"
MONO = "Consolas"

ACCENT = RGBColor(0xC9, 0xA2, 0x27)      # 项目主色（暗金）
INK = RGBColor(0x1F, 0x24, 0x2B)
MUTED = RGBColor(0x5A, 0x66, 0x74)


# ---------- 基础工具 ----------
def set_run_font(run, name_cjk=CJK, name_latin=LATIN, size=None, bold=None, color=None):
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    run.font.name = name_latin
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), name_latin)
    rfonts.set(qn("w:hAnsi"), name_latin)
    rfonts.set(qn("w:eastAsia"), name_cjk)


def shade(cell, hexcolor):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hexcolor)
    tc_pr.append(shd)


def cell_text(cell, text, bold=False, size=9.5, color=INK, align=None):
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    if align:
        p.alignment = align
    add_inline(p, text, bold=bold, size=size, color=color)


INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`)")


def add_inline(p, text, bold=False, size=10.5, color=INK):
    """把 **粗体** 与 `代码` 拆成不同样式的 run。"""
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            r = p.add_run(part[2:-2])
            set_run_font(r, size=size, bold=True, color=color)
        elif part.startswith("`") and part.endswith("`"):
            r = p.add_run(part[1:-1])
            set_run_font(r, name_cjk=MONO, name_latin=MONO, size=size - 1, color=RGBColor(0xA6, 0x3D, 0x40))
        else:
            r = p.add_run(part)
            set_run_font(r, size=size, bold=bold, color=color)


def add_page_field(paragraph):
    """页脚里插入 PAGE 域。"""
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = "PAGE"
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)
    set_run_font(run, size=9, color=MUTED)


def add_toc_field(paragraph):
    """插入 TOC 域，Word 打开后按 F9 或右键更新目录。"""
    run = paragraph.add_run()
    b = OxmlElement("w:fldChar")
    b.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = r'TOC \o "1-3" \h \z \u'
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    t = OxmlElement("w:t")
    t.text = "（在 Word 里右键此处 → 更新域，可生成目录）"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for e in (b, instr, sep, t, end):
        run._r.append(e)
    set_run_font(run, size=9.5, color=MUTED)


# ---------- Markdown 解析 ----------
def parse(md_lines):
    """把 markdown 行拆成块：('h', level, text) / ('p', text) / ('ul', [items]) / ('table', rows)"""
    blocks = []
    i = 0
    while i < len(md_lines):
        line = md_lines[i].rstrip()
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            blocks.append(("h", len(m.group(1)), m.group(2).strip()))
            i += 1
            continue

        if stripped.startswith("|"):
            rows = []
            while i < len(md_lines) and md_lines[i].strip().startswith("|"):
                cells = [c.strip() for c in md_lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c or "") for c in cells):
                    rows.append(cells)
                i += 1
            if rows:
                blocks.append(("table", rows))
            continue

        if stripped.startswith(">"):
            quote = []
            while i < len(md_lines) and md_lines[i].strip().startswith(">"):
                quote.append(md_lines[i].strip().lstrip(">").strip())
                i += 1
            blocks.append(("p", " ".join(quote)))
            continue

        if stripped.startswith("- ") or stripped.startswith("* "):
            items = []
            while i < len(md_lines) and md_lines[i].strip().startswith(("- ", "* ")):
                items.append(md_lines[i].strip()[2:].strip())
                i += 1
            blocks.append(("ul", items))
            continue

        if re.fullmatch(r"-{3,}|\*{3,}", stripped):
            i += 1
            continue

        para = []
        while i < len(md_lines):
            s = md_lines[i].strip()
            if (not s or s.startswith(("#", "|", ">", "- ", "* "))
                    or re.fullmatch(r"-{3,}", s)):
                break
            # 有序列表项单独成段，带悬挂缩进
            if re.match(r"^\d+\.\s+", s):
                if para:
                    blocks.append(("p", " ".join(para)))
                    para = []
                blocks.append(("ol", [s]))
                i += 1
                continue
            para.append(s)
            i += 1
        if para:
            blocks.append(("p", " ".join(para)))
    return blocks


# ---------- 生成文档 ----------
def build(md_path, docx_path):
    md_lines = open(md_path, encoding="utf-8").read().split("\n")
    blocks = parse(md_lines)

    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Cm(2.2)
    sec.bottom_margin = Cm(2.0)
    sec.left_margin = Cm(2.4)
    sec.right_margin = Cm(2.4)

    normal = doc.styles["Normal"]
    normal.font.size = Pt(10.5)
    normal.font.name = LATIN
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), CJK)

    # 页脚
    footer_p = sec.footer.paragraphs[0]
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_page_field(footer_p)

    title_done = False
    toc_done = False
    for block in blocks:
        kind = block[0]

        if kind == "h":
            level, text = block[1], block[2]
            if level == 1 and not title_done:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_after = Pt(6)
                r = p.add_run(text)
                set_run_font(r, size=24, bold=True, color=INK)
                title_done = True
                continue
            # 目录放在第一个章节之前
            if level == 2 and not toc_done:
                toc_done = True
                doc.add_page_break()
                # 用普通段落而不是 Heading，免得「目录」自己出现在目录里
                th = doc.add_paragraph()
                th.paragraph_format.space_after = Pt(6)
                r = th.add_run("目录")
                set_run_font(r, size=17, bold=True, color=INK)
                tp = doc.add_paragraph()
                add_toc_field(tp)
                doc.add_page_break()
            h = doc.add_heading(level=min(level - 1, 4))
            h.paragraph_format.space_before = Pt(16 if level <= 2 else 10)
            h.paragraph_format.space_after = Pt(6)
            # 标题里的复选框：单独的 run，用强调色
            m = re.match(r"^\[( |x|X)\]\s*(.*)$", text)
            if m:
                r = h.add_run("☑ " if m.group(1).lower() == "x" else "☐ ")
                set_run_font(r, size={2: 17, 3: 14, 4: 12}.get(level, 11), bold=True, color=ACCENT)
                text = m.group(2)
            r = h.add_run(text)
            set_run_font(r, size={2: 17, 3: 14, 4: 12}.get(level, 11), bold=True,
                         color=INK if level <= 3 else RGBColor(0x33, 0x3B, 0x45))

        elif kind == "p":
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.35
            if block[1].startswith("状态：") or block[1].startswith("清单用法"):
                p.paragraph_format.left_indent = Cm(0.4)
                add_inline(p, block[1], size=9.5, color=MUTED)
            else:
                add_inline(p, block[1])

        elif kind == "ul":
            for item in block[1]:
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Cm(0.85)
                p.paragraph_format.first_line_indent = Cm(-0.85)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.line_spacing = 1.3
                if item.startswith("[ ] "):
                    r = p.add_run("☐  ")
                    set_run_font(r, size=11, color=ACCENT)
                    add_inline(p, item[4:])
                elif item.startswith("[x] ") or item.startswith("[X] "):
                    r = p.add_run("☑  ")
                    set_run_font(r, size=11, color=ACCENT)
                    add_inline(p, item[4:], color=MUTED)
                else:
                    m = re.match(r"^(\d+\.)\s+(.*)$", item)
                    if m:
                        r = p.add_run(m.group(1) + "  ")
                        set_run_font(r, size=10.5, color=MUTED)
                        add_inline(p, m.group(2))
                    else:
                        r = p.add_run("·  ")
                        set_run_font(r, size=10.5, color=MUTED)
                        add_inline(p, item)

        elif kind == "ol":
            for item in block[1]:
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Cm(1.15)
                p.paragraph_format.first_line_indent = Cm(-0.75)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.line_spacing = 1.3
                m = re.match(r"^(\d+\.)\s+(.*)$", item)
                if m:
                    r = p.add_run(m.group(1) + "  ")
                    set_run_font(r, size=10.5, color=MUTED)
                    add_inline(p, m.group(2))
                else:
                    add_inline(p, item)

        elif kind == "table":
            rows = block[1]
            ncol = max(len(r) for r in rows)
            t = doc.add_table(rows=0, cols=ncol)
            t.style = "Table Grid"
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            t.autofit = True
            for ri, row in enumerate(rows):
                cells = t.add_row().cells
                # 行不跨页断开，表头每页重复
                tr_pr = t.rows[-1]._tr.get_or_add_trPr()
                cant = OxmlElement("w:cantSplit")
                tr_pr.append(cant)
                if ri == 0:
                    hdr = OxmlElement("w:tblHeader")
                    tr_pr.append(hdr)
                for ci in range(ncol):
                    text = row[ci] if ci < len(row) else ""
                    if ri == 0:
                        cell_text(cells[ci], text, bold=True, size=9.5, color=RGBColor(0x1A, 0x1A, 0x1A))
                        shade(cells[ci], "EDE4C8")
                    else:
                        cell_text(cells[ci], text, size=9)
                        if ri % 2 == 0:
                            shade(cells[ci], "F7F8FA")
            doc.add_paragraph().paragraph_format.space_after = Pt(2)

    # 目录（放在第一个章节之前，见上）
    doc.save(docx_path)
    return len(blocks)


def update_fields(docx_path):
    """用 Word 把目录域算出来（没有目录域时静默跳过）。失败不影响文档本身。"""
    try:
        import win32com.client as win32
    except ImportError:
        return False
    word = None
    try:
        word = win32.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(os.path.abspath(docx_path), False, False)
        try:
            for i in range(1, doc.TablesOfContents.Count + 1):
                doc.TablesOfContents(i).Update()
        except Exception:
            pass
        doc.Save()
        doc.Close(0)
        return True
    except Exception:
        return False
    finally:
        if word is not None:
            try:
                word.Quit()
            except Exception:
                pass


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python tools/md2docx.py <输入.md> <输出.docx>")
        sys.exit(1)
    src = sys.argv[1]
    dst = sys.argv[2]
    n = build(src, dst)
    size = os.path.getsize(dst)
    print("已生成 %s（%d 个块，%.1f KB）" % (dst, n, size / 1024))
    if update_fields(dst):
        print("目录域已在 Word 中更新")
    else:
        print("提示：目录是域，在 Word 里右键 → 更新域 可手动生成")
