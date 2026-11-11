/* 舟券資金帳:画面と状態管理 */
(function () {
  'use strict';
  const L = window.BoatLogic;
  const KEY = 'boat-bankroll-v1';
  const app = document.getElementById('app');
  const VENUES = ['桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江', '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村'];
  const PATTERNS = {
    both: ['1-2-3', '1-2-4', '1-2-5', '1-3-2', '1-4-2', '1-5-2'],
    a: ['1-2-3', '1-2-4', '1-2-5'],
    b: ['1-3-2', '1-4-2', '1-5-2'],
  };
  const MAX_POINTS = 6;

  let state = load();
  let hitCombo = null;
  let resultMode = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function save() {
    try {
      if (state) localStorage.setItem(KEY, JSON.stringify(state));
      else localStorage.removeItem(KEY);
    } catch (e) { /* 保存できない環境でも画面は動かす */ }
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = (n) => `${Math.round(n).toLocaleString('ja-JP')}円`;
  const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(Math.round(n)).toLocaleString('ja-JP')}円`;
  const floor2 = (n) => (Math.floor(n * 100) / 100).toFixed(2);
  const rate = () => (state.totalInvest > 0 ? `${((state.totalPayout / state.totalInvest) * 100).toFixed(1)}%` : '−');
  const chips = (combo) => `<span class="combo" aria-label="${esc(combo)}">${String(combo).split('-').map((d) => `<span class="b b${esc(d)}">${esc(d)}</span>`).join('')}</span>`;
  const boughtCount = () => state.races.filter((r) => r.result !== 'skip').length;

  /** 全角の数字・ピリオド・カンマを半角にする */
  const toHalf = (text) => String(text).replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  /** 「1,000円」のような金額入力を数字だけの文字列にする */
  const moneyDigits = (text) => toHalf(text).replace(/[,円\s]/g, '');

  function normalizeCombo(text) {
    const digits = toHalf(text).replace(/[^0-9]/g, '');
    if (!/^[1-6]{3}$/.test(digits) || new Set(digits).size !== 3) return null;
    return digits.split('').join('-');
  }
  function parseOdds(text) {
    const half = toHalf(text).trim();
    if (!/^\d+(\.\d+)?$/.test(half)) return null;
    const v = Number(half);
    return v >= 1 ? v : null;
  }

  function newDraft(prev) {
    return {
      venue: prev ? prev.venue : VENUES[0],
      r: prev ? Math.min(12, Number(prev.r) + 1) : 1,
      rows: PATTERNS.both.map((combo) => ({ combo, odds: '', on: true })),
    };
  }

  /* ---------- 開始画面 ---------- */
  function planTable(p) {
    return `<table class="kv"><tbody>
      <tr><td>軍資金(S)</td><td>${yen(p.S)}</td></tr>
      <tr><td>基本予算(B)</td><td>${yen(p.B)}</td></tr>
      <tr><td>段階1ライン</td><td>${yen(p.line1)}</td></tr>
      <tr><td>段階1予算</td><td>${yen(p.budget1)}</td></tr>
      <tr><td>段階2ライン</td><td>${yen(p.line2)}</td></tr>
      <tr><td>段階2予算</td><td>${yen(p.budget2)}</td></tr>
      <tr><td>終了ライン</td><td>${yen(p.endLine)}未満で終了</td></tr>
    </tbody></table>`;
  }
  function renderSetup() {
    app.innerHTML = `
      <p class="brand">舟券資金帳</p>
      <h1>今日の軍資金はいくらですか?</h1>
      <div class="card">
        <label class="field" for="capital">軍資金(100円以上)
          <div class="money-input"><input id="capital" data-setup inputmode="numeric" autocomplete="off" placeholder="10000"><span>円</span></div>
        </label>
        <div id="plan-preview"></div>
        <button class="primary block" data-act="start" id="start-btn" disabled>この内容で開始する</button>
      </div>
      <p class="muted foot">入力内容はこの端末のブラウザにだけ保存されます。</p>`;
    document.getElementById('capital').focus();
  }
  function parseCapital() {
    const el = document.getElementById('capital');
    const half = moneyDigits(el.value);
    if (!/^\d+$/.test(half)) return null;
    const v = Number(half);
    return v >= 100 && v <= 100000000 ? v : null;
  }
  function updatePlanPreview() {
    const S = parseCapital();
    document.getElementById('plan-preview').innerHTML = S ? planTable(L.plan(S)) : '';
    document.getElementById('start-btn').disabled = !S;
  }

  /* ---------- 残高パネル ---------- */
  function statusPanel() {
    const p = state.plan;
    const { stage, budget } = L.stageFor(p, state.balance);
    const steps = [
      ['基本', p.B, `${yen(p.line1)}未満`],
      ['段階1', p.budget1, `${yen(p.line1)}以上`],
      ['段階2', p.budget2, `${yen(p.line2)}以上`],
    ];
    return `<section class="status" aria-label="現在の残高">
      <div class="status-label">運用残高</div>
      <div class="status-balance">${Math.round(state.balance).toLocaleString('ja-JP')}<small>円</small></div>
      <div class="status-grid">
        <div><span class="status-label">確保金</span><b>${yen(state.secured)}</b></div>
        <div><span class="status-label">累計回収率</span><b>${rate()}</b></div>
        <div><span class="status-label">次の予算</span><b>${yen(budget)}</b></div>
      </div>
      <div class="ladder">${steps.map(([name, b, line], i) => `<div class="step ${i === stage ? 'on' : ''}"><b>${name} ${yen(b)}</b>${line}</div>`).join('')}</div>
    </section>`;
  }

  /* ---------- レース入力 ---------- */
  function renderRows() {
    const d = state.draft;
    return `<div class="ticket-head"><span>買う</span><span>買い目</span><span>オッズ</span><span></span></div>
      ${d.rows.map((row, i) => {
        const comboBad = row.combo !== '' && !normalizeCombo(row.combo);
        const oddsBad = row.odds !== '' && parseOdds(row.odds) === null;
        return `<div class="ticket ${row.on ? '' : 'off'}">
          <input type="checkbox" data-row="on" data-i="${i}" ${row.on ? 'checked' : ''} aria-label="${esc(row.combo)}を買う">
          <input type="text" data-row="combo" data-i="${i}" value="${esc(row.combo)}" inputmode="numeric" autocomplete="off" aria-label="買い目" aria-invalid="${comboBad}">
          <input type="text" data-row="odds" data-i="${i}" value="${esc(row.odds)}" inputmode="decimal" autocomplete="off" placeholder="0.0" aria-label="${esc(row.combo)}のオッズ" aria-invalid="${oddsBad}">
          <button class="icon-btn" data-act="del-row" data-i="${i}" aria-label="この行を削除">×</button>
        </div>`;
      }).join('')}`;
  }

  function renderRace() {
    const d = state.draft;
    const flash = state.flash;
    app.innerHTML = `
      <p class="brand">舟券資金帳</p>
      ${statusPanel()}
      ${flash ? flashCard(flash) : ''}
      <section class="card">
        <h2>次のレース</h2>
        <div class="two">
          <label class="field">場名
            <select data-draft="venue">${VENUES.map((v) => `<option ${v === d.venue ? 'selected' : ''}>${v}</option>`).join('')}</select>
          </label>
          <label class="field">レース
            <select data-draft="r">${Array.from({ length: 12 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === Number(d.r) ? 'selected' : ''}>${n}R</option>`).join('')}</select>
          </label>
        </div>
        <div class="presets" role="group" aria-label="買い方">
          <button data-act="preset" data-p="both">1-2-345 + 1-345-2</button>
          <button data-act="preset" data-p="a">1-2-345</button>
          <button data-act="preset" data-p="b">1-345-2</button>
        </div>
        <div class="tickets" id="rows">${renderRows()}</div>
        <button class="block" data-act="add-row" id="add-row" ${d.rows.length >= MAX_POINTS ? 'disabled' : ''}>買い目を追加(最大6点)</button>
      </section>
      <section class="card" id="alloc" aria-live="polite"></section>
      ${historyCard()}
      <p class="muted foot">掛け金の増額と軍資金の追加はできません。予算はルールで自動的に決まります。</p>
      <div class="foot">
        ${state.races.length === 0
          ? '<button class="link" data-act="discard">軍資金を入れ直す</button>'
          : '<button class="danger block" data-act="finish">今日の運用を終了する</button>'}
      </div>`;
    renderAlloc();
  }

  function flashCard(f) {
    return `<section class="card">
      <div class="notice ${f.kind}"><strong>${esc(f.title)}</strong>${f.lines.map(esc).join('<br>')}</div>
      ${state.prev ? '<button class="link" data-act="undo">結果の入力をやり直す</button>' : ''}
    </section>`;
  }

  function currentInput() {
    const rows = state.draft.rows.filter((r) => r.on);
    const parsed = rows.map((r) => ({ combo: normalizeCombo(r.combo), odds: parseOdds(r.odds) }));
    return { rows, parsed };
  }

  function allocTable(tickets, invest) {
    return `<table>
      <thead><tr><th>買い目</th><th>オッズ</th><th>掛け金</th><th>払戻額</th></tr></thead>
      <tbody>${tickets.map((t) => {
        const pay = L.payoutOf(t.stake / 100, t.odds);
        return `<tr><td>${chips(t.combo)}</td><td>${t.odds.toFixed(1)}</td><td>${yen(t.stake)}</td><td class="${pay <= invest ? 'bad' : ''}">${yen(pay)}</td></tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function renderAlloc() {
    const el = document.getElementById('alloc');
    if (!el) return;
    const { budget } = L.stageFor(state.plan, state.balance);
    const { parsed } = currentInput();
    const head = `<h2>配分 ・ このレースの予算 ${yen(budget)}</h2>`;
    const skipBtn = '<button class="block" data-act="skip">このレースは見送る</button>';

    if (parsed.length === 0) { el.innerHTML = `${head}<p class="muted">買い目を1点以上選んでください。</p>${skipBtn}`; return; }
    if (parsed.some((p) => !p.combo)) { el.innerHTML = `${head}<div class="notice ng">買い目は1〜6の異なる3つの数字で入力してください(例:1-2-3)。</div>`; return; }
    if (new Set(parsed.map((p) => p.combo)).size !== parsed.length) { el.innerHTML = `${head}<div class="notice ng">同じ買い目が重複しています。</div>`; return; }
    if (parsed.some((p) => p.odds === null)) { el.innerHTML = `${head}<p class="muted">すべての買い目にオッズ(1.0以上)を入力すると、配分を計算します。</p>${skipBtn}`; return; }

    const odds = parsed.map((p) => p.odds);
    const a = L.allocate(odds, budget);
    const props = L.proposals(odds, budget);
    const tickets = a.units.map((u, i) => ({ combo: parsed[i].combo, odds: odds[i], stake: u * 100 }));

    let verdict;
    if (a.ok) {
      verdict = `<div class="notice ok"><strong>どの目が当たっても投資額を上回ります</strong>最低払戻 ${yen(a.minPayout)} / 投資 ${yen(a.total)}</div>`;
      if (!a.reachesTarget) verdict += `<div class="notice warn">100円単位の丸めにより、最低払戻が目標払戻 ${yen(a.target)} に届きません。</div>`;
      if (a.total < budget) verdict += `<p class="muted">トリガミを避けるため、予算のうち ${yen(a.total)} だけ使います。</p>`;
    } else {
      const reason = a.tooMany ? `予算 ${yen(budget)} では ${parsed.length}点を100円ずつ買えません。`
        : a.composite < 2 ? '合成オッズが2倍未満です。'
        : '予算内でトリガミを避けられません。';
      verdict = `<div class="notice ng"><strong>このままでは買えません</strong>${reason}</div>`;
    }

    const proposalHtml = props.map((pr, n) => `<div class="proposal">
        <div class="proposal-head"><b>${esc(pr.title)}</b><span class="muted">合成 ${floor2(pr.alloc.composite)}倍</span></div>
        <div class="proposal-picks">${pr.idx.map((idx, j) => `<span>${chips(parsed[idx].combo)} ${yen(pr.alloc.units[j] * 100)}</span>`).join('')}</div>
        <div class="muted">投資 ${yen(pr.alloc.total)} / 最低払戻 ${yen(pr.alloc.minPayout)}</div>
        <button data-act="apply" data-n="${n}">この案にする</button>
      </div>`).join('');

    el.innerHTML = `${head}
      <div class="metrics">
        <div><span class="muted">合成オッズ</span><b>${floor2(a.composite)}倍</b></div>
        <div><span class="muted">目標払戻(予算×2)</span><b>${yen(a.target)}</b></div>
      </div>
      ${tickets.length ? allocTable(tickets, a.total) : ''}
      ${verdict}
      ${props.length ? `<h2>${a.ok ? '本線に厚く張る案' : '提案'}</h2>${proposalHtml}` : ''}
      ${!a.ok && !props.length ? '<p>条件を満たす買い方がないため、見送りをおすすめします。</p>' : ''}
      <div class="actions">
        <button class="primary" data-act="buy" ${a.ok ? '' : 'disabled'}>この配分で購入した</button>
        <button data-act="skip">見送る</button>
      </div>`;
    el._props = props;
  }

  /* ---------- 結果入力 ---------- */
  function renderPending() {
    const p = state.pending;
    const hit = hitCombo ? p.tickets.find((t) => t.combo === hitCombo) : null;
    app.innerHTML = `
      <p class="brand">舟券資金帳</p>
      ${statusPanel()}
      <section class="card">
        <h2>${esc(p.venue)} ${esc(p.r)}R の結果を入力</h2>
        ${allocTable(p.tickets, p.invest)}
        <p class="muted">投資 ${yen(p.invest)} / 合成オッズ ${floor2(p.composite)}倍</p>
        <div class="actions" style="grid-template-columns:1fr 1fr">
          <button class="${resultMode === 'hit' ? 'primary' : ''}" data-act="mode-hit">的中</button>
          <button data-act="miss">外れ</button>
        </div>
        ${resultMode === 'hit' ? `
          <div class="hit-choices" role="group" aria-label="的中した買い目">
            ${p.tickets.map((t) => `<button data-act="pick" data-combo="${esc(t.combo)}" aria-pressed="${t.combo === hitCombo}">${chips(t.combo)}</button>`).join('')}
          </div>
          ${hit ? `
            <label class="field" for="payout">払戻額(この買い目で受け取る合計)
              <div class="money-input"><input id="payout" inputmode="numeric" autocomplete="off" value="${L.payoutOf(hit.stake / 100, hit.odds)}"><span>円</span></div>
            </label>
            <p class="muted">掛け金 ${yen(hit.stake)}。初期値は購入時オッズの見込みです。確定した金額に直してください。</p>
            <button class="primary block" data-act="confirm-hit">この払戻で確定</button>` : ''}
        ` : ''}
        <button class="link" data-act="cancel-buy">購入を取り消して入力に戻る</button>
      </section>
      ${historyCard()}`;
  }

  /* ---------- 履歴 ---------- */
  function historyCard() {
    if (!state.races.length) return '';
    const rows = state.races.slice().reverse().map((r) => {
      const label = `${esc(r.venue)}${esc(r.r)}R`;
      if (r.result === 'skip') return `<tr><td>${label}<span class="tag">見送り</span></td><td>−</td><td>−</td><td>${yen(r.balanceAfter)}</td><td>${yen(r.securedAfter)}</td></tr>`;
      const tag = r.result === 'hit' ? '的中' : '外れ';
      return `<tr><td>${label}<span class="tag">${tag}</span></td><td>${yen(r.invest)}</td><td>${yen(r.payout)}</td><td>${yen(r.balanceAfter)}</td><td>${yen(r.securedAfter)}</td></tr>`;
    }).join('');
    return `<section class="card"><h2>今日の履歴</h2>
      <table class="history"><thead><tr><th>レース</th><th>投資</th><th>払戻</th><th>残高</th><th>確保</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  }

  /* ---------- 終了画面 ---------- */
  function renderEnd() {
    const take = state.balance + state.secured;
    const diff = take - state.plan.S;
    const locked = boughtCount() > 0 && state.endDate === today();
    app.innerHTML = `
      <p class="brand">舟券資金帳</p>
      <h1>${state.ended === 'auto' ? '今日はここで終了です' : '今日の運用を終了しました'}</h1>
      ${state.ended === 'auto' ? `<p class="muted">運用残高が終了ライン(${yen(state.plan.endLine)})を下回りました。</p>` : ''}
      <section class="card">
        <table class="kv"><tbody>
          <tr><td>総投資額</td><td>${yen(state.totalInvest)}</td></tr>
          <tr><td>総払戻額</td><td>${yen(state.totalPayout)}</td></tr>
          <tr><td>回収率</td><td>${rate()}</td></tr>
          <tr><td>最終の運用残高</td><td>${yen(state.balance)}</td></tr>
          <tr><td>確保金</td><td>${yen(state.secured)}</td></tr>
          <tr class="total"><td>持ち帰り額</td><td>${yen(take)}</td></tr>
          <tr><td>軍資金(${yen(state.plan.S)})との差額</td><td>${signed(diff)}</td></tr>
        </tbody></table>
      </section>
      ${historyCard()}
      ${locked
        ? '<p class="muted foot">軍資金の追加はできません。次の運用は明日から始められます。</p>'
        : '<button class="primary block" style="margin-top:12px" data-act="new-day">新しい日を始める</button>'}
      ${state.ended === 'auto' && state.prev ? '<div class="foot"><button class="link" data-act="undo">結果の入力ミスを訂正する</button></div>' : ''}`;
  }

  function render() {
    if (!state) return renderSetup();
    if (state.ended) return renderEnd();
    if (state.pending) return renderPending();
    return renderRace();
  }

  /* ---------- 操作 ---------- */
  function snapshot() {
    const copy = JSON.parse(JSON.stringify(state));
    delete copy.prev;
    delete copy.flash;
    return copy;
  }

  function applyResult(result, payout, combo) {
    state.prev = snapshot();
    const p = state.pending;
    const before = L.stageFor(state.plan, state.balance).stage;
    const s = L.settle(state.balance, p.invest, payout);
    state.balance = s.balance;
    state.secured += s.secured;
    state.totalInvest += p.invest;
    state.totalPayout += payout;
    state.races.push({
      venue: p.venue, r: p.r, result, combo: combo || null, invest: p.invest, payout,
      moved: s.secured, balanceAfter: state.balance, securedAfter: state.secured,
    });
    const next = L.stageFor(state.plan, state.balance);
    const lines = [];
    if (result === 'hit') {
      lines.push(`払戻 ${yen(payout)} − 投資 ${yen(p.invest)} = 利益 ${signed(s.profit)}`);
      if (s.profit > 0) lines.push(`確保金へ ${yen(s.secured)}、運用残高へ ${yen(s.profit - s.secured)}`);
      else lines.push('利益が出なかったため、確保金への移動はありません。');
    } else {
      lines.push(`投資 ${yen(p.invest)} を運用残高から差し引きました。`);
    }
    if (next.stage < before) lines.push(`残高がラインを下回ったため、予算を ${yen(next.budget)} に戻します。`);
    else if (next.stage > before) lines.push(`残高がラインを超えたため、次の予算は ${yen(next.budget)} です。`);
    else if (result === 'miss') lines.push(`次の予算は ${yen(next.budget)} です。掛け金は上げません。`);
    state.flash = { kind: result === 'hit' && s.profit > 0 ? 'ok' : 'warn', title: `${p.venue} ${p.r}R ${result === 'hit' ? '的中' : '外れ'}`, lines };
    state.draft = newDraft(state.draft);
    state.pending = null;
    hitCombo = null;
    resultMode = null;
    if (state.balance < state.plan.endLine) { state.ended = 'auto'; state.endDate = today(); }
    save();
    render();
    window.scrollTo(0, 0);
  }

  const actions = {
    start() {
      const S = parseCapital();
      if (!S) return;
      state = { plan: L.plan(S), balance: S, secured: 0, totalInvest: 0, totalPayout: 0, races: [], pending: null, draft: newDraft(), ended: null, endDate: null, startDate: today() };
      save(); render(); window.scrollTo(0, 0);
    },
    discard() {
      if (!confirm('入力した軍資金を取り消して、最初の画面に戻りますか?')) return;
      state = null; save(); render();
    },
    preset(btn) {
      state.draft.rows = PATTERNS[btn.dataset.p].map((combo) => {
        const old = state.draft.rows.find((r) => normalizeCombo(r.combo) === combo);
        return { combo, odds: old ? old.odds : '', on: true };
      });
      save(); renderRace();
    },
    'add-row'() {
      if (state.draft.rows.length >= MAX_POINTS) return;
      state.draft.rows.push({ combo: '', odds: '', on: true });
      save(); renderRace();
    },
    'del-row'(btn) {
      state.draft.rows.splice(Number(btn.dataset.i), 1);
      save(); renderRace();
    },
    apply(btn) {
      const el = document.getElementById('alloc');
      const pr = el._props[Number(btn.dataset.n)];
      const active = state.draft.rows.filter((r) => r.on);
      const keep = new Set(pr.idx.map((i) => active[i]));
      active.forEach((r) => { r.on = keep.has(r); });
      save(); renderRace();
    },
    buy() {
      const { budget, stage } = L.stageFor(state.plan, state.balance);
      const { parsed } = currentInput();
      const odds = parsed.map((p) => p.odds);
      const a = L.allocate(odds, budget);
      if (!a.ok) return;
      state.pending = {
        venue: state.draft.venue, r: state.draft.r, budget, stage, composite: a.composite, invest: a.total,
        tickets: a.units.map((u, i) => ({ combo: parsed[i].combo, odds: odds[i], stake: u * 100 })),
      };
      state.prev = null; state.flash = null;
      save(); render(); window.scrollTo(0, 0);
    },
    skip() {
      state.races.push({ venue: state.draft.venue, r: state.draft.r, result: 'skip', invest: 0, payout: 0, moved: 0, balanceAfter: state.balance, securedAfter: state.secured });
      state.flash = { kind: 'ok', title: `${state.draft.venue} ${state.draft.r}R 見送り`, lines: ['残高は変わりません。'] };
      state.prev = null;
      state.draft = newDraft(state.draft);
      save(); render(); window.scrollTo(0, 0);
    },
    'cancel-buy'() {
      state.pending = null; hitCombo = null; resultMode = null;
      save(); render();
    },
    'mode-hit'() { resultMode = 'hit'; renderPending(); },
    pick(btn) { hitCombo = btn.dataset.combo; renderPending(); },
    miss() {
      if (!confirm('外れとして確定しますか?')) return;
      applyResult('miss', 0, null);
    },
    'confirm-hit'() {
      const el = document.getElementById('payout');
      const half = moneyDigits(el.value);
      if (!/^\d+$/.test(half)) { el.setAttribute('aria-invalid', 'true'); el.focus(); return; }
      applyResult('hit', Number(half), hitCombo);
    },
    undo() {
      if (!state.prev) return;
      if (!confirm('直前のレース結果を取り消して、結果入力に戻りますか?入力ミスの訂正にだけ使ってください。')) return;
      state = state.prev;
      save(); render();
    },
    finish() {
      if (!confirm('今日の運用を終了しますか?終了すると今日はもう再開できません。')) return;
      state.ended = 'manual'; state.endDate = today(); state.prev = null;
      save(); render(); window.scrollTo(0, 0);
    },
    'new-day'() { state = null; save(); render(); },
  };

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    actions[btn.dataset.act](btn);
  });

  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.setup !== undefined) { updatePlanPreview(); return; }
    if (t.dataset.row) {
      const row = state.draft.rows[Number(t.dataset.i)];
      if (t.dataset.row === 'on') {
        row.on = t.checked;
        t.closest('.ticket').classList.toggle('off', !t.checked);
      } else {
        row[t.dataset.row] = t.value;
        const bad = t.value !== '' && (t.dataset.row === 'combo' ? !normalizeCombo(t.value) : parseOdds(t.value) === null);
        t.setAttribute('aria-invalid', String(bad));
      }
      save(); renderAlloc();
    }
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.draft) { state.draft[t.dataset.draft] = t.value; save(); }
  });

  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'capital') actions.start();
  });

  render();
})();
