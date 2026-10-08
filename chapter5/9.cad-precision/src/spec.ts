// flange_spec.py 对应：M5 规格 + M6 变更 + 不许漂移的键。
export const SPEC_M5 = {
  outer_diameter_mm: 80.0,
  thickness_mm: 10.0,
  hole_count: 4,
  hole_diameter_mm: 5.5,
  hole_circle_diameter_mm: 60.0,
};
export const SPEC_M6 = { ...SPEC_M5, hole_diameter_mm: 6.5 };
export const UNCHANGED_KEYS = ['outer_diameter_mm', 'thickness_mm', 'hole_count', 'hole_circle_diameter_mm'] as const;
export const FLANGE_SPEC_TEXT = '法兰盘，外径 80mm，厚度 10mm，4 个均布 M5 安装孔（孔径 5.5mm），孔位圆直径 60mm';
export const CHANGE_REQUEST_TEXT = '安装孔从 M5 改为 M6（孔径 6.5mm）';

export const CODEGEN_PROMPT = `你是机械 CAD 工程师。请用 Python CadQuery 库编写代码，构造如下零件：

规格：${FLANGE_SPEC_TEXT}

硬性要求：
1. 文件顶部用一个名为 PARAMS 的 dict 集中全部尺寸参数（单位 mm），键名固定为：
   outer_diameter、thickness、hole_count、hole_diameter、hole_circle_diameter。
   值分别为 80.0、10.0、4、5.5、60.0。
2. 零件轴线为 Z 轴且过原点，底面在 z=0 平面。
3. 安装孔为通孔，绕 Z 轴在孔位圆上均布。
4. 最终实体赋值给变量 result（cq.Workplane 或 cq.Shape 均可）。
5. 只做建模：不要读写文件、不要导出、不要打印，只 import cadquery 及标准库。
6. 照抄以下骨架，只填 PARAMS 的值，不改建模语句（hole 必须打在 base 的顶面上）：
import cadquery as cq
import math
PARAMS = {"outer_diameter": 80.0, "thickness": 10.0, "hole_count": 4, "hole_diameter": 5.5, "hole_circle_diameter": 60.0}
base = cq.Workplane("XY").circle(PARAMS["outer_diameter"] / 2).extrude(PARAMS["thickness"])
R = PARAMS["hole_circle_diameter"] / 2
pts = [(R * math.cos(i * 2 * math.pi / PARAMS["hole_count"]), R * math.sin(i * 2 * math.pi / PARAMS["hole_count"])) for i in range(PARAMS["hole_count"])]
result = base.faces(">Z").workplane().pushPoints(pts).hole(PARAMS["hole_diameter"])

只输出一个 \`\`\`python 代码块（第一行就是 \`\`\`python），不要任何其他解释。`;
