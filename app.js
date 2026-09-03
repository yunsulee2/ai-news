(() => {
  const state = { range: 'day', sort: 'importance', source: 'all', q: '', items: [] };
  const $ = (s) => document.querySelector(s);
  const RANGE_H = { day: 24, week: 24 * 7, month: 24 * 30, all: Infinity };
  const SOURCE_LABEL = { youtube: '유튜브', threads: 'Threads', news: '뉴스', official: '공식' };
  const KST = 'Asia/Seoul';

  const fmtTime = (iso) => {
    const d = new Date(iso); const diff = (Date.now() - d) / 36e5;
    if (diff < 1) return `${Math.max(1, Math.round(diff * 60))}분 전`;
    if (diff < 24) return `${Math.round(diff)}시간 전`;
    if (diff < 24 * 7) return `${Math.round(diff / 24)}일 전`;
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: KST });
  };
  const fmtDay = (iso) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: KST });
  const dayKey = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: KST });
  const fmtDur = (s) => s ? `${Math.round(s / 60)}분` : '';

  function filtered() {
    const cutoff = Date.now() - RANGE_H[state.range] * 36e5;
    const q = state.q.trim().toLowerCase();
    let list = state.items.filter(i => new Date(i.publishedAt).getTime() >= cutoff);
    if (state.source !== 'all') list = list.filter(i => i.source === state.source);
    if (q) list = list.filter(i => [i.title, i.summary, ...(i.tags || []), i.sourceName].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => state.sort === 'importance'
      ? (b.importance - a.importance) || (new Date(b.publishedAt) - new Date(a.publishedAt))
      : (new Date(b.publishedAt) - new Date(a.publishedAt)) || (b.importance - a.importance));
    return list;
  }

  function card(i, big = false) {
    const t = $('#cardTpl').content.firstElementChild.cloneNode(true);
    const thumb = t.querySelector('.thumb'); const img = thumb.querySelector('img');
    thumb.href = i.url;
    if (i.image) { img.src = i.image; img.alt = i.title; img.onerror = () => { img.remove(); thumb.classList.add('noimg'); thumb.dataset.initial = i.sourceName[0]; }; }
    else { img.remove(); thumb.classList.add('noimg'); thumb.dataset.initial = i.sourceName[0]; }
    const badge = t.querySelector('.badge'); badge.textContent = SOURCE_LABEL[i.source] || i.source; badge.classList.add(i.source);
    t.querySelector('.sources').textContent = (i.sources || [i.sourceName]).join(' · ') + (i.meta?.durationSeconds ? ` · ${fmtDur(i.meta.durationSeconds)}` : '');
    t.querySelector('.time').textContent = fmtTime(i.publishedAt);
    const score = t.querySelector('.score'); score.textContent = i.importance; if (i.importance >= 9) score.classList.add('hot');
    const a = t.querySelector('h3 a'); a.href = i.url; a.textContent = i.title;
    t.querySelector('.summary').textContent = i.summary;
    t.querySelector('.tags').innerHTML = (i.tags || []).map(x => `<span class="tag">#${x}</span>`).join('');
    const rel = t.querySelector('.related');
    const links = [{ label: `원문 보기: ${i.sourceName}`, url: i.url }, ...(i.related || [])];
    rel.innerHTML = links.slice(0, big ? 6 : 4).map(r => `<a href="${r.url}" target="_blank" rel="noopener">${r.label}</a>`).join('');
    t.addEventListener('click', (e) => { if (e.target.closest('a')) return; t.classList.toggle('open'); });
    return t;
  }

  function render() {
    const list = filtered();
    const top = $('#top'); const main = $('#list'); top.innerHTML = ''; main.innerHTML = '';
    $('#empty').hidden = list.length > 0;
    if (!list.length) return;
    const showTop = state.sort === 'importance' && !state.q && list.length >= 4;
    const picks = showTop ? list.slice(0, 3) : [];
    const rest = showTop ? list.slice(3) : list;
    $('#topTitle').hidden = !picks.length;
    $('#listTitle').hidden = !picks.length;
    $('#listTitle').textContent = state.range === 'all' ? '전체 소식' : '그 외 소식';
    picks.forEach((i, k) => top.appendChild(card(i, k === 0)));
    if (state.range === 'all' || state.range === 'month') {
      // group by day (keeps chosen sort inside each day)
      let cur = '';
      for (const i of rest) {
        const k = dayKey(i.publishedAt);
        if (k !== cur) { cur = k; const d = document.createElement('div'); d.className = 'day'; d.textContent = fmtDay(i.publishedAt); main.appendChild(d); }
        main.appendChild(card(i));
      }
    } else rest.forEach(i => main.appendChild(card(i)));
  }

  function chips() {
    const counts = {};
    for (const i of state.items) counts[i.source] = (counts[i.source] || 0) + 1;
    const el = $('#sourceChips');
    el.innerHTML = [['all', '전체'], ...Object.entries(SOURCE_LABEL)].map(([k, v]) =>
      `<button class="chip ${state.source === k ? 'active' : ''}" data-source="${k}">${v}${k === 'all' ? '' : ` ${counts[k] || 0}`}</button>`).join('');
    el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { state.source = b.dataset.source; chips(); render(); }));
  }

  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); b.classList.add('active');
    state.range = b.dataset.range; render();
  }));
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; render(); });

  fetch('data/news.json?t=' + Date.now()).then(r => r.json()).then(data => {
    state.items = data.items || [];
    $('#updated').textContent = '마지막 업데이트 ' + new Date(data.updatedAt).toLocaleString('ko-KR', { timeZone: KST, month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    $('#count').textContent = `누적 ${state.items.length}건`;
    // default to the widest range that has at least a few items
    if (filtered().length < 3) { state.range = 'week'; document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.range === 'week')); }
    chips(); render();
  }).catch(() => { $('#updated').textContent = '데이터를 불러오지 못했습니다.'; });
})();
