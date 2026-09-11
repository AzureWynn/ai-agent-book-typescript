"""
pptx Skill 捆绑的可执行脚本：用 python-pptx 从结构化大纲生成真实的 .pptx。
Agent 通过 run_skill_script 调用本脚本。

用法:
    python generate_pptx.py <outline.json> <output.pptx>
"""

import json
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Pt, Inches
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

ACCENT = RGBColor(0x1F, 0x4E, 0x79)
DARK = RGBColor(0x22, 0x22, 0x22)


def _bg(slide, rgb):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = rgb


def _title_slide(prs, title, subtitle):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, ACCENT)
    box = slide.shapes.add_textbox(Inches(0.8), Inches(2.2), Inches(8.4), Inches(2.0))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = title
    r.font.size = Pt(40)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    if subtitle:
        sbox = slide.shapes.add_textbox(Inches(0.8), Inches(4.3), Inches(8.4), Inches(1.0))
        stf = sbox.text_frame
        stf.word_wrap = True
        sp = stf.paragraphs[0]
        sp.alignment = PP_ALIGN.CENTER
        sr = sp.add_run()
        sr.text = subtitle
        sr.font.size = Pt(20)
        sr.font.color.rgb = RGBColor(0xD5, 0xDE, 0xEB)


def _content_slide(prs, title, bullets):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, RGBColor(0xFF, 0xFF, 0xFF))
    bar = slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(10), Inches(1.1))
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT
    bar.line.fill.background()
    tf = bar.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.5)
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = title
    r.font.size = Pt(26)
    r.font.bold = True
    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    body = slide.shapes.add_textbox(Inches(0.7), Inches(1.5), Inches(8.6), Inches(5.2))
    btf = body.text_frame
    btf.word_wrap = True
    for i, b in enumerate(bullets):
        para = btf.paragraphs[0] if i == 0 else btf.add_paragraph()
        para.space_after = Pt(10)
        br = para.add_run()
        br.text = "•  " + str(b)
        br.font.size = Pt(18)
        br.font.color.rgb = DARK


def build_presentation(payload, out_path):
    # 兼容两种形态：{title, subtitle, slides:[...]} 或直接 [...slides]
    if isinstance(payload, list):
        payload = {"title": "Presentation", "subtitle": "", "slides": payload}
    title = payload.get("title", "Untitled Presentation")
    subtitle = payload.get("subtitle", "")
    slides = payload.get("slides", [])
    if not slides:
        raise ValueError("payload.slides 为空，至少需要一页内容")

    prs = Presentation()
    prs.slide_width = Inches(10)
    prs.slide_height = Inches(7.5)

    titles = [title]
    _title_slide(prs, title, subtitle)
    for s in slides:
        s_title = s.get("title", "")
        bullets = s.get("bullets") or []
        _content_slide(prs, s_title, bullets)
        titles.append(s_title)

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(out))
    return {"path": str(out), "num_slides": len(list(prs.slides)), "titles": titles}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("用法: python generate_pptx.py <outline.json> <output.pptx>", file=sys.stderr)
        sys.exit(1)
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    print(json.dumps(build_presentation(payload, sys.argv[2]), ensure_ascii=False, indent=2))