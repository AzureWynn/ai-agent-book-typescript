/**
 * 生图节点（工作流路线节点 2）—— 可插拔接口。
 *
 * 本实验的核心学习点是"工作流编排 + 改写节点行为"，不依赖真图。
 * 因此生图节点做成可插拔：
 * - 默认 PlaceholderGenerator：不真出图，记录 prompt 并返回模拟元数据
 * - 预留接真实现的入口：实现 ImageGenerator 接口即可（见文件底部说明）
 *
 * 官方用通义万相 wan2.2-t2i-flash（DashScope 托管）；
 * 本地可选 Z-Image-Turbo（diffusers 开源模型，M4 可跑）。
 */

export interface GeneratedImage {
  /** 生图成功与否（占位实现恒为 true） */
  ok: boolean;
  /** 图片文件保存路径（占位实现为空） */
  path: string;
  /** 实际用于生图的 prompt（服务端可能扩写，如万相的 actual_prompt） */
  actualPrompt: string;
  /** 模型名 / 说明 */
  model: string;
  /** 占位实现的说明（真实现为空） */
  note?: string;
}

/** 生图器接口：任何后端实现它即可接入工作流 */
export interface ImageGenerator {
  readonly name: string;
  generate(prompt: string, negativePrompt: string): Promise<GeneratedImage>;
}

/**
 * 占位实现（默认）：
 * 不真正生成图片，只记录改写后的 prompt 与负面提示词，返回模拟元数据。
 * 用于无本地文生图环境时学习工作流编排与改写行为。
 */
export class PlaceholderGenerator implements ImageGenerator {
  readonly name = 'placeholder';

  async generate(prompt: string, negativePrompt: string): Promise<GeneratedImage> {
    // 模拟生图耗时，让流程节奏更真实
    await new Promise((r) => setTimeout(r, 200));
    return {
      ok: true,
      path: '',
      actualPrompt: prompt,
      model: 'placeholder',
      note: '占位实现：未真正生图（改写后的 prompt 见下）',
    };
  }
}

/** 工厂：按配置选择生图器（当前只有占位，预留真实实现） */
export function createImageGenerator(kind: string = 'placeholder'): ImageGenerator {
  switch (kind) {
    case 'placeholder':
      return new PlaceholderGenerator();
    // 预留：真本地生图（Z-Image-Turbo via diffusers，需另行实现 + pip 依赖）
    // case 'zimage':
    //   return new ZImageGenerator({ modelPath: process.env.ZIMAGE_MODEL_PATH });
    default:
      throw new Error(`未知生图器: ${kind}`);
  }
}

/**
 * ── 如何接入真实本地生图（Z-Image-Turbo）──
 *
 * 参考官方用通义万相（DashScope 托管 API）；想本地真生图可用 Z-Image-Turbo：
 *
 * ```ts
 * // 需要：pip install diffusers torch transformers  + 拉权重
 * // 实现 ImageGenerator 接口即可：
 * export class ZImageGenerator implements ImageGenerator {
 *   readonly name = 'z-image-turbo';
 *   async generate(prompt, negativePrompt) {
 *     // 用 diffusers + MPS 加载 Tongyi-MAI/Z-Image-Turbo，
 *     // pipeline(prompt) → 保存图片到 outputs/<run_id>/images/xx.png
 *     // 返回 { ok: true, path, actualPrompt: prompt, model: 'Z-Image-Turbo' }
 *   }
 * }
 * // 然后在 createImageGenerator 里注册 'zimage' 分支即可
 * ```
 */