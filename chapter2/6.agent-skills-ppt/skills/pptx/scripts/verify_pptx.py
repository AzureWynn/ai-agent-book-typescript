"""
pptx Skill 校验脚本：用 python-pptx 重新打开生成的 .pptx，读回页数与每页标题。

用法:
    python verify_pptx.py <deck.pptx>
"""

import json
import sys
from pathlib import Path

from pptx import Presentation


def verify(path):
    prs = Presentation(path)
    titles = []
    for slide in prs.slides:
        first_text = ""
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame.text.strip():
                first_text = shape.text_frame.text.strip().split("\n")[0]
                break
        titles.append(first_text)
    return {"path": str(path), "num_slides": len(list(prs.slides)), "titles": titles}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python verify_pptx.py <deck.pptx>", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(verify(sys.argv[1]), ensure_ascii=False, indent=2))