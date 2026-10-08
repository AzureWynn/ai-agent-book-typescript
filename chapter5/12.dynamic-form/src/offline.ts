// 离线臂：官方 FLIGHT_FORM_SCHEMA + 确定性渲染器的 TS 版。
// 同样的两类级联（show_when 显示隐藏 + options_when 动态可选项），不调模型。
interface Field {
  name: string;
  label: string;
  type: 'text' | 'date' | 'radio' | 'select';
  placeholder?: string;
  required?: boolean;
  default?: string;
  options?: { value: string; label: string }[];
  container_id?: string;
  show_when?: { field: string; equals: string };
  options_when?: { field: string; map: Record<string, { value: string; label: string }[]> };
}

const SCHEMA: { title: string; fields: Field[] } = {
  title: '机票预订 · 意图澄清表单',
  fields: [
    { name: 'departure_city', label: '出发城市', type: 'text', placeholder: '如：上海', required: true },
    { name: 'departure_date', label: '出发日期', type: 'date', required: true },
    {
      name: 'trip_type', label: '旅行类型', type: 'radio', default: 'one_way',
      options: [{ value: 'one_way', label: '单程' }, { value: 'round_trip', label: '往返' }],
    },
    { name: 'return_date', label: '返程日期', type: 'date', container_id: 'return_date_field', show_when: { field: 'trip_type', equals: 'round_trip' } },
    {
      name: 'cabin_class', label: '舱位', type: 'select', default: 'economy',
      options: [{ value: 'economy', label: '经济舱' }, { value: 'business', label: '公务舱' }, { value: 'first', label: '头等舱' }],
    },
    {
      name: 'baggage_count', label: '免费托运行李额度', type: 'select',
      options_when: {
        field: 'cabin_class',
        map: {
          economy: [{ value: '0', label: '仅手提行李' }, { value: '1', label: '1 件（≤23kg）' }],
          business: [{ value: '0', label: '仅手提行李' }, { value: '1', label: '1 件（≤32kg）' }, { value: '2', label: '2 件（≤32kg）' }],
          first: [{ value: '1', label: '1 件（≤32kg）' }, { value: '2', label: '2 件（≤32kg）' }, { value: '3', label: '3 件（≤32kg）' }],
        },
      },
    },
  ],
};

const RUNTIME_JS = `
const FORM_CONFIG = __CONFIG__;
const form = document.getElementById('clarify-form');
function valueOf(name) {
  const el = form.elements[name];
  if (!el) return '';
  return el.value || '';
}
function applyCascade() {
  FORM_CONFIG.fields.forEach(function (f) {
    if (f.show_when) {
      const box = document.getElementById(f.container_id);
      if (box) box.style.display = valueOf(f.show_when.field) === f.show_when.equals ? '' : 'none';
    }
    if (f.options_when) {
      const sel = form.elements[f.name];
      if (sel) {
        const opts = f.options_when.map[valueOf(f.options_when.field)] || [];
        const prev = sel.value;
        sel.innerHTML = '';
        opts.forEach(function (o) {
          const opt = document.createElement('option');
          opt.value = o.value; opt.textContent = o.label;
          sel.appendChild(opt);
        });
        if (opts.some(function (o) { return o.value === prev; })) sel.value = prev;
      }
    }
  });
}
form.addEventListener('change', applyCascade);
applyCascade();
form.addEventListener('submit', function (e) {
  e.preventDefault();
  const data = {};
  FORM_CONFIG.fields.forEach(function (f) {
    if (f.container_id) {
      const box = document.getElementById(f.container_id);
      if (box && box.style.display === 'none') return;
    }
    const v = valueOf(f.name);
    if (v !== '') data[f.name] = v;
  });
  Object.assign(data, FORM_CONFIG.constants || {});
  document.getElementById('result').textContent = JSON.stringify(data, null, 2);
});
`;

function renderField(f: Field): string {
  let inner: string;
  if (f.type === 'text' || f.type === 'date') {
    const ph = f.placeholder ? ` placeholder="${f.placeholder}"` : '';
    const req = f.required ? ' required' : '';
    inner = `<label for="${f.name}">${f.label}</label><input type="${f.type}" id="${f.name}" name="${f.name}"${ph}${req}>`;
  } else if (f.type === 'radio') {
    const opts = (f.options ?? []).map((o) =>
      `<label><input type="radio" name="${f.name}" value="${o.value}"${f.default === o.value ? ' checked' : ''}> ${o.label}</label>`).join('');
    inner = `<span>${f.label}</span><div>${opts}</div>`;
  } else {
    const opts = (f.options ?? []).map((o) =>
      `<option value="${o.value}"${f.default === o.value ? ' selected' : ''}>${o.label}</option>`).join('');
    inner = `<label for="${f.name}">${f.label}</label><select id="${f.name}" name="${f.name}">${opts}</select>`;
  }
  const cid = f.container_id ? ` id="${f.container_id}"` : '';
  const hidden = f.show_when ? ' style="display:none"' : '';
  return `<div${cid}${hidden}>${inner}</div>`;
}

export function extractDestination(request: string): string | null {
  const m = request.match(/去(.+?)(?:的?(?:单程|往返))?的?(?:机票|航班|票)/);
  return m?.[1]?.trim() || null;
}

export function renderOfflineForm(userRequest: string): string {
  const fieldsHtml = SCHEMA.fields.map(renderField).join('\n');
  const jsFields = SCHEMA.fields.map((f) => {
    const e: Record<string, unknown> = { name: f.name };
    if (f.container_id) e.container_id = f.container_id;
    if (f.show_when) e.show_when = f.show_when;
    if (f.options_when) e.options_when = f.options_when;
    return e;
  });
  const constants: Record<string, string> = {};
  const dest = extractDestination(userRequest);
  if (dest) constants.destination_city = dest;
  const script = RUNTIME_JS.replace('__CONFIG__', JSON.stringify({ fields: jsFields, constants }));
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${SCHEMA.title}</title></head>
<body>
<h1>${SCHEMA.title}</h1>
<p>原始请求：${userRequest}</p>
<form id="clarify-form">
${fieldsHtml}
<button type="submit">提交</button>
</form>
<pre id="result"></pre>
<script>
${script}
</script>
</body>
</html>`;
}
