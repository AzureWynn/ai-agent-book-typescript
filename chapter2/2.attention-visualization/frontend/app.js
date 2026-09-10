/* 前端：读取轨迹 JSON，渲染注意力热力图 + 统计。零依赖。 */
(function () {
  'use strict';

  const canvas = document.getElementById('heatmap');
  const ctx = canvas.getContext('2d');
  const tabsEl = document.getElementById('tabs');
  const statsEl = document.getElementById('stats');
  const queryEl = document.getElementById('query');
  let trajectories = [];

  const VIRIDIS = [
    [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
  ];
  function color(t) {
    const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
    const i = Math.floor(x), f = x - i;
    const a = VIRIDIS[i], b = VIRIDIS[Math.min(i + 1, VIRIDIS.length - 1)];
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
  }

  function sinkStats(matrix) {
    let sum = 0, max = 0;
    for (const row of matrix) { const v = row[0] || 0; sum += v; if (v > max) max = v; }
    return { mean: sum / (matrix.length || 1), max };
  }

  function rowEntropy(row) {
    let h = 0;
    for (const v of row) if (v > 1e-12) h -= v * Math.log2(v);
    return h;
  }

  function renderTrajectory(t) {
    const ad = t.attention_data;
    const tokens = ad.tokens;
    const matrix = ad.attention_matrix;
    const n = matrix.length;
    const ctxLen = ad.context_length || 0;
    const cell = 20;
    const marginL = 120, marginT = 26;
    canvas.width = marginL + n * cell + 10;
    canvas.height = marginT + n * cell + 70;
    ctx.font = '9px ui-monospace,Menlo,monospace';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let maxV = 0;
    for (const row of matrix) for (const v of row) if (v > maxV) maxV = v;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x = marginL + c * cell, y = marginT + r * cell;
        if (c > r) {
          ctx.fillStyle = '#f5f5f5';
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeStyle = '#ddd';
          ctx.beginPath(); ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y); ctx.stroke();
        } else {
          const v = matrix[r][c] || 0;
          ctx.fillStyle = color(maxV > 0 ? v / maxV : 0);
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cell, cell);
        }
      }
    }

    // token 标签（隔若干显示）
    const every = n > 40 ? Math.ceil(n / 40) : 1;
    for (let i = 0; i < n; i += every) {
      const label = (tokens[i] || '').replace(/\s+/g, '·');
      ctx.fillStyle = '#333';
      ctx.save();
      ctx.translate(marginL + (i + 0.5) * cell, marginT - 4);
      ctx.rotate(-Math.PI / 3);
      ctx.fillText(label, 0, 0);
      ctx.restore();
      ctx.textAlign = 'right';
      ctx.fillText(label, marginL - 4, marginT + (i + 0.5) * cell);
      ctx.textAlign = 'left';
    }

    // 上下文边界
    if (ctxLen > 0 && ctxLen < n) {
      const x = marginL + ctxLen * cell;
      ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(x, marginT); ctx.lineTo(x, marginT + n * cell); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff5252'; ctx.font = '10px monospace';
      ctx.fillText('prompt → 生成', x + 4, marginT + 12);
    }

    // 色标
    for (let i = 0; i < VIRIDIS.length; i++) {
      ctx.fillStyle = `rgb(${VIRIDIS[i][0]},${VIRIDIS[i][1]},${VIRIDIS[i][2]})`;
      ctx.fillRect(marginL + i * 30, marginT + n * cell + 16, 30, 8);
    }
    ctx.fillStyle = '#999'; ctx.font = '9px monospace';
    ctx.fillText('0', marginL, marginT + n * cell + 40);
    ctx.fillText('max', marginL + VIRIDIS.length * 30 - 22, marginT + n * cell + 40);
    ctx.fillText('行=Query  列=Key', marginL + VIRIDIS.length * 30 + 4, marginT + n * cell + 24);

    // 统计
    const sink = sinkStats(matrix);
    let entSum = 0;
    for (const row of matrix) entSum += rowEntropy(row);
    queryEl.textContent = `Q: ${t.test_case.query}`;
    statsEl.innerHTML =
      `category: ${t.test_case.category} · model: ${t.metadata.model} · layer: ${t.metadata.layer} · ${t.tokens.length} tokens（prompt ${ctxLen}）<br>` +
      `attention sink（首 token 占每行比例）: mean <b>${(sink.mean * 100).toFixed(1)}%</b>, max ${(sink.max * 100).toFixed(1)}%<br>` +
      `行熵均值: ${(entSum / (n || 1)).toFixed(2)} bit · 响应: ${(t.response || '').slice(0, 80)}`;
  }

  async function load() {
    try {
      const resp = await fetch('data/trajectories/manifest.json');
      const manifest = await resp.json();
      const list = [];
      for (const item of manifest) {
        const r = await fetch('data/trajectories/' + item.filename);
        list.push(await r.json());
      }
      trajectories = list;
      renderTabs();
      if (list.length) renderTrajectory(list[list.length - 1]);
      else { statsEl.textContent = '暂无轨迹。先运行: npm run trajectories'; }
    } catch (e) {
      statsEl.textContent = '加载失败：' + e.message + '（请确认已运行 npm run trajectories 且前端由 npm run frontend 提供）';
    }
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    trajectories.forEach((t, i) => {
      const b = document.createElement('button');
      b.textContent = `${t.test_case.category} #${i + 1}`;
      b.onclick = () => { renderTrajectory(t); [...tabsEl.children].forEach((x) => x.classList.remove('active')); b.classList.add('active'); };
      tabsEl.appendChild(b);
    });
  }

  document.getElementById('refresh').onclick = load;
  load();
})();