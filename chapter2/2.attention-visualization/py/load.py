"""模型加载助手：优先本地权重（local_files_only），首次运行再联网下载。"""

from typing import Tuple


def load_model_and_tokenizer(model_name: str, device: str):
    from transformers import AutoModelForCausalLM, AutoTokenizer
    import torch

    dtype = torch.float16 if device != "cpu" else torch.float32

    tokenizer_kwargs = dict(trust_remote_code=True)
    model_kwargs = dict(trust_remote_code=True, attn_implementation="eager", torch_dtype=dtype)

    try:
        # 模型已下载过：完全离线
        tokenizer = AutoTokenizer.from_pretrained(model_name, local_files_only=True, **tokenizer_kwargs)
        model = AutoModelForCausalLM.from_pretrained(model_name, local_files_only=True, **model_kwargs)
    except Exception as local_error:
        # 首次运行：允许联网下载权重
        print(f"[load] local_files_only failed ({local_error}), falling back to online download...")
        tokenizer = AutoTokenizer.from_pretrained(model_name, **tokenizer_kwargs)
        model = AutoModelForCausalLM.from_pretrained(model_name, **model_kwargs)

    model = model.to(device)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    return model, tokenizer