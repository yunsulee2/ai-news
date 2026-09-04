(() => {
  'use strict';
  const state = { range: 'day', sort: 'importance', source: 'all', q: '', items: [], latestBatch: null, page: 1 };
  const PAGE = 30;
  const $ = (s) => document.querySelector(s);
  const RANGE_H = { day: 24, week: 24 * 7, month: 24 * 30, all: Infinity };
  const SOURCE_LABEL = { youtube: '유튜브', threads: 'Threads', news: '뉴스', official: '공식' };
  const SOURCE_BADGE = { youtube: 'error', threads: 'gray', news: 'success', official: 'warning' };
  const KST = 'Asia/Seoul';
  const NON_KO = new Set(['news', 'official']);

  // All dynamic content goes through DOM APIs (no innerHTML with feed-derived strings).
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c != null) n.append(c);
    return n;
  };
  const safeUrl = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; } };

  const fmtRel = (iso) => {
    const d = new Date(iso); const diff = (Date.now() - d) / 36e5;
    if (diff < 1) return `${Math.max(1, Math.round(diff * 60))}분 전`;
    if (diff < 24) return `${Math.round(diff)}시간 전`;
    if (diff < 24 * 7) return `${Math.round(diff / 24)}일 전`;
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', timeZone: KST });
  };
  const fmtAbs = (iso) => new Date(iso).toLocaleString('ko-KR', { timeZone: KST, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDay = (iso) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: KST });
  const dayKey = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: KST });
  const fmtDur = (s) => { if (!s) return ''; const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
  const fmtViews = (n) => n ? (n >= 10000 ? `${(n / 10000).toFixed(1)}만회` : `${n.toLocaleString('ko-KR')}회`) : '';
  const level = (imp) => imp >= 9 ? ['필독', 'error'] : imp >= 7 ? ['중요', 'blue'] : imp >= 4 ? ['참고', 'gray'] : ['기타', 'gray'];

  function inRange(list) {
    const cutoff = Date.now() - RANGE_H[state.range] * 36e5;
    return list.filter(i => new Date(i.publishedAt).getTime() >= cutoff);
  }
  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = inRange(state.items);
    if (state.source !== 'all') list = list.filter(i => i.source === state.source);
    if (q) list = list.filter(i => [i.title, i.originalTitle, i.summary, i.why, ...(i.tags || []), i.sourceName, ...(i.sources || [])].filter(Boolean).join(' ').toLowerCase().includes(q));
    list.sort((a, b) => state.sort === 'importance'
      ? (b.importance - a.importance) || (new Date(b.publishedAt) - new Date(a.publishedAt))
      : (new Date(b.publishedAt) - new Date(a.publishedAt)) || (b.importance - a.importance));
    return list;
  }

  const extIcon = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M7 17 17 7M8 7h9v9'); s.append(p); return s; };

  function card(i, lead = false) {
    const t = $('#cardTpl').content.firstElementChild.cloneNode(true);
    if (lead) t.classList.add('lead');
    const url = safeUrl(i.url);
    const thumb = t.querySelector('.thumb'); const img = thumb.querySelector('img');
    thumb.href = url; thumb.setAttribute('aria-label', `${i.title} 원문 열기`);
    const fallback = () => { img.remove(); thumb.classList.add('noimg'); thumb.dataset.initial = (i.sourceName || '?')[0]; };
    if (i.image) { img.src = safeUrl(i.image); img.alt = ''; img.onerror = fallback; } else fallback();
    if (i.meta?.durationSeconds) { const d = thumb.querySelector('.dur'); d.hidden = false; d.textContent = fmtDur(i.meta.durationSeconds); }

    const src = t.querySelector('.badge.src'); src.textContent = SOURCE_LABEL[i.source] || i.source; src.classList.add(SOURCE_BADGE[i.source] || 'gray');
    const [lvlText, lvlColor] = level(i.importance);
    const lvl = t.querySelector('.badge.lvl'); lvl.classList.add(lvlColor); lvl.querySelector('.lvlText').textContent = `${lvlText} ${i.importance}`; lvl.title = `중요도 ${i.importance}/10`;
    if (state.latestBatch && i.collectedAt === state.latestBatch) t.querySelector('.badge.new').hidden = false;
    const srcs = (i.sources || [i.sourceName]).join(' · ');
    const extra = i.source === 'youtube' && i.meta?.viewCount ? ` · 조회 ${fmtViews(i.meta.viewCount)}` : '';
    t.querySelector('.sources').textContent = srcs + extra;
    const time = t.querySelector('.time'); time.textContent = fmtRel(i.publishedAt); time.dateTime = i.publishedAt; time.title = fmtAbs(i.publishedAt);

    const a = t.querySelector('h3 a'); a.href = url; a.textContent = i.title;
    if (i.originalTitle && NON_KO.has(i.source) && i.originalTitle !== i.title) { const o = t.querySelector('.orig'); o.hidden = false; o.textContent = i.originalTitle; o.lang = 'en'; }
    if (i.why) { const w = t.querySelector('.why'); w.hidden = false; w.textContent = i.why; }
    const sum = t.querySelector('.summary'); sum.textContent = i.summary;
    const more = t.querySelector('.more');
    const toggle = (open) => { t.classList.toggle('open', open); more.textContent = open ? '접기' : '더 읽기'; more.setAttribute('aria-expanded', String(open)); };
    more.addEventListener('click', () => toggle(!t.classList.contains('open')));
    requestAnimationFrame(() => { if (sum.scrollHeight <= sum.clientHeight + 2) more.hidden = true; });

    const tags = t.querySelector('.tags');
    for (const tag of (i.tags || []).slice(0, 8)) {
      const b = el('button', { class: 'tag', type: 'button', text: `#${tag}` });
      b.addEventListener('click', () => { $('#q').value = tag; state.q = tag; state.page = 1; render(); $('#q').scrollIntoView({ block: 'nearest' }); });
      tags.append(b);
    }
    const rel = t.querySelector('.related');
    const links = [{ label: `원문 보기: ${i.sourceName}`, url }, ...(i.threadsUrl ? [{ label: 'Threads에서 보기 (@ai_sosik_daily)', url: i.threadsUrl }] : []), ...(i.related || [])].slice(0, lead ? 6 : 4);
    for (const r of links) rel.append(el('a', { href: safeUrl(r.url), target: '_blank', rel: 'noopener' }, extIcon(), document.createTextNode(r.label || r.url)));
    return t;
  }

  function render() {
    const list = filtered();
    const top = $('#top'); const main = $('#list'); top.replaceChildren(); main.replaceChildren();
    $('#empty').hidden = list.length > 0;
    const showTop = state.sort === 'importance' && !state.q && state.source === 'all' && list.length >= 4;
    const picks = showTop ? list.slice(0, 3) : [];
    const rest = showTop ? list.slice(3) : list;
    $('#topTitle').hidden = !picks.length;
    $('#listTitle').hidden = !list.length;
    $('#listTitle').replaceChildren(document.createTextNode(picks.length ? '그 외 소식' : '소식'), el('span', { class: 'count', text: `${rest.length}건` }));
    picks.forEach((i, k) => top.append(card(i, k === 0)));
    const visible = rest.slice(0, state.page * PAGE);
    const grouped = state.range === 'all' || state.range === 'month' || state.sort === 'date';
    let cur = '';
    for (const i of visible) {
      if (grouped) { const k = dayKey(i.publishedAt); if (k !== cur) { cur = k; main.append(el('div', { class: 'day', text: fmtDay(i.publishedAt) })); } }
      main.append(card(i));
    }
    $('#pager').hidden = visible.length >= rest.length;
    if (!$('#pager').hidden) $('#moreBtn').textContent = `더 보기 (${rest.length - visible.length}건 남음)`;
    chips();
  }

  function chips() {
    const counts = {}; const base = inRange(state.items);
    for (const i of base) counts[i.source] = (counts[i.source] || 0) + 1;
    const box = $('#sourceChips'); box.replaceChildren();
    for (const [k, v] of [['all', '전체'], ...Object.entries(SOURCE_LABEL)]) {
      const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(state.source === k) }, document.createTextNode(v), el('span', { class: 'n', text: String(k === 'all' ? base.length : (counts[k] || 0)) }));
      b.addEventListener('click', () => { state.source = k; state.page = 1; render(); });
      box.append(b);
    }
  }

  function digest(data) {
    const items = state.items;
    const latest = items.filter(i => i.collectedAt === state.latestBatch);
    const today = inRange(items);
    const upd = new Date(data.updatedAt);
    $('#updated').textContent = `마지막 업데이트 ${upd.toLocaleString('ko-KR', { timeZone: KST, month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 매시간 갱신`;
    $('#digestTitle').textContent = `${upd.toLocaleDateString('ko-KR', { timeZone: KST, month: 'long', day: 'numeric' })} AI 소식`;
    const must = items.filter(i => i.importance >= 9 && (Date.now() - new Date(i.publishedAt)) < 7 * 864e5).length;
    $('#digestSub').textContent = `누적 ${items.length}건 · 24시간 내 ${today.length}건 · 이번 주 필독 ${must}건 · 소스 ${new Set(items.flatMap(i => i.sources || [i.sourceName])).size}곳`;
    if (latest.length) { $('#newBadge').hidden = false; $('#newCount').textContent = `이번 업데이트 +${latest.length}`; }
  }

  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    state.range = b.dataset.range; state.page = 1; render();
  }));
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; state.page = 1; render(); });
  let qt; $('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; state.page = 1; render(); }, 120); });
  $('#moreBtn').addEventListener('click', () => { state.page++; render(); });
  $('#aboutBtn').addEventListener('click', () => $('#about').showModal());
  $('#themeBtn').addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); });

  fetch('data/news.json?t=' + Math.floor(Date.now() / 6e4)).then(r => r.json()).then(data => {
    state.items = (data.items || []).filter(i => i && i.id && i.title);
    state.latestBatch = state.items.map(i => i.collectedAt).filter(Boolean).sort().pop() || null;
    digest(data);
    if (inRange(state.items).length < 3) { state.range = 'week'; document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x.dataset.range === 'week'))); }
    render();
  }).catch(() => { $('#updated').textContent = '데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'; $('#empty').hidden = false; });
})();
