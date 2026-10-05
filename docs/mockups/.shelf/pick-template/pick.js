// Pick page: normal and blind modes, reason tags, vote JSON download, #tally view.
// Works from file:// (options are embedded in <script type="application/json" id="options">).
(function () {
  const cfg = JSON.parse(document.getElementById('options').textContent);
  const app = document.getElementById('app');
  const reasons = cfg.reasons || ['Clearer', 'Calmer', 'More fun', 'Easier to read', 'Looks finished', 'Feels like us', 'Too busy', 'Too plain'];
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };

  const options = cfg.options.slice();
  if (!options.some((o) => o.id === 'today')) {
    options.unshift({ id: 'today', label: 'Today', name: 'Today', line: 'The current design.', type: 'image', src: 'today.png' });
  }
  const blind = !!cfg.blind;
  let order = options.slice();
  if (blind) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  const state = { choice: null, tags: new Set(), note: '', voter: '', voted: false };

  function media(o) {
    if (o.type === 'video') return el('video', { src: o.src, controls: true, muted: true, loop: true, playsinline: true });
    if (o.type === 'iframe') return el('iframe', { src: o.src, title: o.name, loading: 'lazy' });
    return el('img', { src: o.src, alt: o.name, onerror: (e) => { e.target.replaceWith(el('p', { class: 'soft', style: 'padding:24px' }, 'Missing: ' + o.src)); } });
  }

  // Cards are built once so iframes and videos are not reloaded when the selection changes.
  const refs = {};
  function optionCard(o, idx) {
    const letter = el('div', { class: 'letter' });
    const name = el('div', { class: 'name' });
    const line = el('div', { class: 'line' });
    const btn = el('button', { class: 'primary pickbtn', onclick: (e) => { e.stopPropagation(); choose(o.id); } });
    const card = el(
      'div',
      { class: 'opt', onclick: (e) => { if (e.target.tagName !== 'IFRAME') choose(o.id); } },
      el('div', { class: 'media' }, media(o)),
      el('div', { class: 'cap' }, letter, el('div', {}, name, line), btn)
    );
    refs[o.id] = { card, letter, name, line, btn, o, idx };
    return card;
  }
  function choose(id) { if (!state.voted) { state.choice = id; refresh(); } }
  function refresh() {
    for (const r of Object.values(refs)) {
      const revealed = !blind || state.voted;
      r.card.classList.toggle('sel', state.choice === r.o.id);
      r.letter.textContent = revealed ? (r.o.id === 'today' ? 'Today' : r.o.label) : String(r.idx + 1);
      r.name.textContent = revealed ? r.o.name : 'Option ' + (r.idx + 1);
      r.line.textContent = revealed ? r.o.line || '' : '';
      r.btn.disabled = state.voted;
      r.btn.textContent = state.choice === r.o.id ? 'Selected' : 'Pick this';
    }
    noneCard.classList.toggle('sel', state.choice === 'none');
    document.querySelectorAll('.tag').forEach((t) => t.classList.toggle('on', state.tags.has(t.textContent)));
    saveBtn.disabled = !state.choice || state.voted;
    savedMsg.hidden = !state.voted;
  }

  const noneCard = el('div', { class: 'opt', onclick: () => choose('none') }, el('div', { class: 'cap' }, el('div', { class: 'name' }, 'None of these'), el('div', { class: 'line' }, 'Say why below.')));
  const saveBtn = el('button', { class: 'primary', onclick: () => vote() }, 'Save vote');
  const savedMsg = el('span', { class: 'done', hidden: true }, 'Saved. Put the file in votes/.');
  const pickView = el(
    'div',
    { class: 'wrap' },
    el('h1', {}, cfg.title || 'Pick'),
    el('div', { class: 'question' }, cfg.question || ''),
    el('p', { class: 'hint' }, blind ? 'Blind vote: the order is shuffled and labels show after you vote. ' : 'Pick one, or choose none of these. ', el('a', { href: '#tally' }, 'Tally view')),
    el('div', { class: 'opts' }, order.map(optionCard)),
    el('div', { class: 'none' }, noneCard),
    el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Why?'),
      el('div', { class: 'tags' }, reasons.map((t) => el('button', { class: 'tag', type: 'button', onclick: () => { if (state.voted) return; state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t); refresh(); } }, t))),
      el('textarea', { placeholder: 'Optional note', oninput: (e) => (state.note = e.target.value) }),
      el('div', { class: 'row' }, el('input', { type: 'text', placeholder: 'Your name (optional)', style: 'max-width:260px', oninput: (e) => (state.voter = e.target.value) }), saveBtn, savedMsg)
    )
  );

  function render() {
    if (location.hash === '#tally') return renderTally();
    app.replaceChildren(pickView);
    refresh();
  }

  function vote() {
    const o = options.find((x) => x.id === state.choice);
    const data = {
      round: cfg.title || '',
      blind,
      voter: state.voter || '',
      at: new Date().toISOString(),
      choice: state.choice,
      label: o ? o.label : 'none',
      reasons: [...state.tags],
      note: state.note,
      shown_order: order.map((x) => x.id),
      options: options.map((x) => ({ id: x.id, label: x.label, name: x.name })),
    };
    const name = 'vote-' + (state.voter ? state.voter.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' : '') + data.at.replace(/[:.]/g, '-') + '.json';
    const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), download: name });
    document.body.append(a); a.click(); a.remove();
    state.voted = true;
    refresh();
  }

  function renderTally() {
    const votes = renderTally.votes || (renderTally.votes = []);
    const count = {}, tagBy = {};
    for (const v of votes) {
      count[v.choice] = (count[v.choice] || 0) + 1;
      for (const t of v.reasons || []) (tagBy[v.choice] = tagBy[v.choice] || {})[t] = ((tagBy[v.choice] || {})[t] || 0) + 1;
    }
    const rows = options.map((o) => ({ id: o.id, label: o.id === 'today' ? 'Today' : o.label + ' ' + o.name })).concat([{ id: 'none', label: 'None of these' }]);
    const max = Math.max(1, ...rows.map((r) => count[r.id] || 0));
    app.replaceChildren(
      el(
        'div',
        { class: 'wrap' },
        el('h1', {}, (cfg.title || 'Pick') + ': tally'),
        el('p', { class: 'hint' }, el('a', { href: '#' }, 'Back to the pick page')),
        el('div', { class: 'panel' }, el('h2', {}, 'Load vote files'), el('input', { type: 'file', accept: '.json,application/json', multiple: true, onchange: async (e) => { for (const f of e.target.files) { try { votes.push(JSON.parse(await f.text())); } catch (err) { alert(f.name + ': ' + err.message); } } renderTally(); } }), el('p', { class: 'soft' }, votes.length + ' vote' + (votes.length === 1 ? '' : 's') + ' loaded.')),
        el('div', { class: 'panel' }, el('h2', {}, 'Totals'), el('table', {}, el('tr', {}, el('th', {}, 'Option'), el('th', {}, 'Votes'), el('th', {}, 'Reasons')), rows.map((r) => el('tr', {}, el('td', {}, r.label), el('td', {}, el('span', { class: 'bar', style: 'width:' + Math.round(((count[r.id] || 0) / max) * 160) + 'px' }), String(count[r.id] || 0)), el('td', {}, Object.entries(tagBy[r.id] || {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + ' x' + n).join(', ') || '-'))))),
        el('div', { class: 'panel' }, el('h2', {}, 'Notes'), el('ul', { class: 'notes' }, votes.filter((v) => v.note).map((v) => el('li', {}, (v.voter ? v.voter + ' (' + v.label + '): ' : v.label + ': ') + v.note))))
      )
    );
  }

  window.addEventListener('hashchange', render);
  render();
})();
