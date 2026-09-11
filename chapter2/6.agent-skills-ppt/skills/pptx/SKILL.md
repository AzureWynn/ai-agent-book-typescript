---
name: pptx
description: 从论文或大纲生成 PowerPoint（.pptx）演示文稿。Use when 用户要求生成 PPT / 演示文稿 / 幻灯片 / PowerPoint / .pptx。Don't use when 用户只是讨论文档内容而不要求生成幻灯片文件。
---

# pptx Skill：从结构化大纲生成 PowerPoint 演示文稿

## 目标
根据论文/大纲内容，规划一份 8-12 页的幻灯片，生成真实可打开的 `.pptx` 文件。

## 工作流程
1. **读输入**：用户消息里已包含论文/大纲正文。先理解结构（标题、背景、方法、结果、结论等）。
2. **规划大纲**：按参考文档（reference.md）的 JSON schema 组织幻灯片：1 页标题页 + 若干内容页（每页 `title` + 3-5 条 `bullets`）。
3. **执行生成**：调用 `run_skill_script` 运行捆绑脚本：
   - name = `pptx`
   - script = `generate_pptx.py`
   - outline = 上面规划好的 JSON 字符串
   - output = `output/presentation.pptx`
4. **校验**：脚本会返回页数与标题；必要时调用 `read_skill_file(name="pptx", path="scripts/verify_pptx.py")` 了解校验方式。

## 脚本约定
- outline 必须是合法 JSON，**顶层是一个对象** `{"title": ..., "slides": [...]}`（不要用数组），schema 见 reference.md。
- **outline 总长度务必控制在 1000 字符以内**（工具参数有长度限制，超长会被截断导致生成失败）：每页 bullets 用极短短语（每条不超过 15 个汉字），页数控制在 8 页以内。
- `generate_pptx.py` 用 python-pptx 生成，PowerPoint / Keynote 可直接打开。
- 如生成失败，读取返回的错误信息修正 outline 后重试。