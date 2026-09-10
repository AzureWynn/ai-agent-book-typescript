#!/usr/bin/env python3
"""
注意力矩阵提取器（对应官方 attention_cli.py 的模型部分）。

用 transformers 加载因果语言模型，捕获指定层/头的自注意力矩阵，
输出 JSON（tokens + 矩阵 + 元信息）。TS 侧负责统计与热力图渲染，
因此这里不需要 matplotlib。

用法：
  python py/extract_attention.py \
      --model Qwen/Qwen3-0.6B --prompt "北京 的 天气 怎么样" \
      --layer -1 --head -1 --output-json /tmp/attn.json

    --layer -1       最后一层
    --head  -1       对所有头取平均；否则指定头索引
    --max-new-tokens 先续写 N 个 token，再对完整序列取注意力
    --no-chat-template  直接用原始提示词（不加 <|im_start|> 等模板标记）
"""

import argparse
import json
import sys

import torch
import numpy as np

from load import load_model_and_tokenizer


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Extract self-attention matrix to JSON")
    p.add_argument("--model", default="Qwen/Qwen3-0.6B")
    p.add_argument("--prompt", default="北京 的 天气 怎么样")
    p.add_argument("--device", choices=["cuda", "mps", "cpu"], default=None)
    p.add_argument("--layer", type=int, default=-1)
    p.add_argument("--head", type=int, default=-1)
    p.add_argument("--max-new-tokens", type=int, default=0)
    p.add_argument("--temperature", type=float, default=0.7)
    p.add_argument("--no-chat-template", action="store_true")
    p.add_argument("--output-json", required=True, help="输出 JSON 路径")
    return p


def pick_device(choice: str | None) -> str:
    if choice:
        return choice
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main() -> int:
    args = build_parser().parse_args()
    device = pick_device(args.device)
    print(f"[extract] loading {args.model} on {device} (eager attention)...", file=sys.stderr)

    from transformers import AutoModelForCausalLM, AutoTokenizer

    model, tokenizer = load_model_and_tokenizer(args.model, device)
    model.eval()

    # 构造输入：chat template 包裹（或原始提示词）
    if args.no_chat_template:
        text = args.prompt
    else:
        messages = [
            {"role": "system", "content": "You are a helpful AI assistant."},
            {"role": "user", "content": args.prompt},
        ]
        text = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
    inputs = tokenizer(text, return_tensors="pt", truncation=False)
    inputs = {k: v.to(device) for k, v in inputs.items()}
    context_length = inputs["input_ids"].shape[1]

    # 可选：先续写一段，再可视化整段序列
    if args.max_new_tokens > 0:
        print(f"[extract] generating up to {args.max_new_tokens} tokens...", file=sys.stderr)
        with torch.no_grad():
            gen = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=args.temperature > 0,
                temperature=max(args.temperature, 1e-5),
                top_p=0.9,
                repetition_penalty=1.1,
                pad_token_id=tokenizer.pad_token_id,
            )
        full_ids = gen
    else:
        full_ids = inputs["input_ids"]

    token_ids = full_ids[0].tolist()
    tokens = [tokenizer.decode([tid], skip_special_tokens=False) for tid in token_ids]
    seq_len = len(tokens)

    # 单次前向拿到注意力
    with torch.no_grad():
        outputs = model(
            input_ids=full_ids,
            output_attentions=True,
            return_dict=True,
        )
    attentions = outputs.attentions
    if not attentions:
        print("ERROR: model returned no attention weights (need eager attention).", file=sys.stderr)
        return 1

    num_layers = len(attentions)
    layer = args.layer if -num_layers <= args.layer < num_layers else -1
    layer_attn = attentions[layer][0]  # [heads, seq, seq]
    num_heads = layer_attn.shape[0]

    if args.head < 0:
        matrix = layer_attn.mean(dim=0)
        head_desc = "avg"
    else:
        head = args.head if 0 <= args.head < num_heads else 0
        matrix = layer_attn[head]
        head_desc = head

    matrix_np = matrix.float().cpu().numpy()  # [seq, seq]
    print(f"[extract] seq_len={seq_len} (prompt={context_length}, gen={seq_len - context_length}), "
          f"layers={num_layers}, heads={num_heads}, layer={layer}, head={head_desc}", file=sys.stderr)

    payload = {
        "prompt": args.prompt,
        "model": args.model,
        "device": device,
        "layer": layer,
        "head": head_desc,
        "num_layers": num_layers,
        "num_heads": num_heads,
        "context_length": context_length,
        "seq_len": seq_len,
        "tokens": tokens,
        "attention_matrix": matrix_np.tolist(),
    }
    with open(args.output_json, "w") as f:
        json.dump(payload, f)
    print(f"[extract] wrote {args.output_json}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())