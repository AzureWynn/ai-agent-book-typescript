# pptx Skill · 参考细则（第三层）

## 大纲 JSON schema（run_skill_script 的 outline 参数）

```json
{
  "title": "演示文稿主标题",
  "subtitle": "副标题，通常是作者/来源（可选）",
  "slides": [
    { "title": "页标题", "bullets": ["要点1", "要点2", "要点3"] }
  ]
}
```

- `slides` 至少一页；建议 6-8 页（1 页标题 + 5-7 页内容）。
- 内容页按论文结构组织：背景/动机 → 方法/架构 → 训练/实验 → 关键结果 → 泛化 → 结论。
- 每页 bullets 3-4 条，**每条用短短语（≤15 个汉字）**，不要长句。
- **整个 outline 控制在 1000 字符以内**，避免工具参数被截断。

## 生成脚本

`scripts/generate_pptx.py`：用 python-pptx 实现，从 outline JSON 生成 `.pptx`。
运行方式（由 Agent 通过 run_skill_script 调用，无需手动执行）：

```
python scripts/generate_pptx.py <outline.json> <output.pptx>
```

输出：`{"path": "...", "num_slides": N, "titles": [...]}` 供校验。

## 设计要点

- 标题页深蓝底白字；内容页白色底 + 顶部深蓝色条标题 + 要点列表。
- 字体：标题 26-40pt 加粗，正文 18pt。
- 不需要图片/图表，文字版即可；重点是结构完整。