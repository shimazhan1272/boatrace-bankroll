/* 舟券資金帳:画面と状態管理 */
(function () {
  'use strict';
  const L = window.BoatLogic;
  const KEY = 'boat-bankroll-v1';
  const app = document.getElementById('app');
  const VENUES = ['桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江', '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村'];

  let state = load();
  let hitMode = false;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      return s ? migrate(s) : null;
    } catch (e) { return null; }
  }
  /** 買い目入力があった旧版のデータを引き継ぐ */
  function migrate(s) {
    if (s.pending) {
      s.draft = { venue: s.pending.venue, r: s.pending.r, invest: String(s.pending.invest) };
      s.pending = null;
    }
    if (s.prev) s.prev = null;
    return s;
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
  const rate = () => (state.totalInvest > 0 ? `${((state.totalPayout / state.totalInvest) * 100).toFixed(1)}%` : '−');
  const boughtCount = () => state.races.filter((r) => r.result !== 'skip').length;

  /** 全角の数字・カンマを半角にし、「1,000円」のような入力を整数にする */
  function parseMoney(text) {
    const half = String(text).replace(/[０-９，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,円\s]/g, '');
    return /^\d+$/.test(half) ? Number(half) : null;
  }

  function newDraft(prev) {
    return {
      venue: prev ? prev.venue : VENUES[0],
      r: prev ? Math.min(12, Number(prev.r) + 1) : 1,
      invest: '',
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
    const v = parseMoney(document.getElementById('capital').value);
    return v !== null && v >= 100 && v <= 100000000 ? v : null;
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

  /* ---------- レース結果の入力 ---------- */
  function renderRace() {
    const d = state.draft;
    const { budget } = L.stageFor(state.plan, state.balance);
    const investValue = d.invest === '' ? String(budget) : d.invest;
    app.innerHTML = `
      <p class="brand">舟券資金帳</p>
      ${statusPanel()}
      ${state.flash ? flashCard(state.flash) : ''}
      <section class="card">
        <h2>レースの結果</h2>
        <div class="two">
          <label class="field">場名
            <select data-draft="venue">${VENUES.map((v) => `<option ${v === d.venue ? 'selected' : ''}>${v}</option>`).join('')}</select>
          </label>
          <label class="field">レース
            <select data-draft="r">${Array.from({ length: 12 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === Number(d.r) ? 'selected' : ''}>${n}R</option>`).join('')}</select>
          </label>
        </div>
        <label class="field" for="invest">投資額(予算 ${yen(budget)} まで)
          <div class="money-input"><input id="invest" inputmode="numeric" autocomplete="off" value="${esc(investValue)}"><span>円</span></div>
        </label>
        <div id="invest-error"></div>
        <div class="result-buttons">
          <button class="hit ${hitMode ? 'selected' : ''}" data-act="hit" aria-pressed="${hitMode}">的中</button>
          <button class="miss" data-act="miss">不的中</button>
        </div>
        ${hitMode ? `
          <label class="field" for="payout">払戻金
            <div class="money-input"><input id="payout" inputmode="numeric" autocomplete="off" placeholder="0"><span>円</span></div>
          </label>
          <div id="payout-error"></div>
          <button class="primary block" data-act="confirm-hit">この払戻金で確定</button>` : ''}
        <button class="link" data-act="skip">このレースは見送る</button>
      </section>
      ${historyCard()}
      <p class="muted foot">掛け金の増額と軍資金の追加はできません。予算はルールで自動的に決まります。</p>
      <div class="foot">
        ${state.races.length === 0
          ? '<button class="link" data-act="discard">軍資金を入れ直す</button>'
          : '<button class="danger block" data-act="finish">今日の運用を終了する</button>'}
      </div>`;
    if (hitMode) document.getElementById('payout').focus();
  }

  function flashCard(f) {
    return `<section class="card">
      <div class="notice ${f.kind}"><strong>${esc(f.title)}</strong>${f.lines.map(esc).join('<br>')}</div>
      ${state.prev ? '<button class="link" data-act="undo">結果の入力をやり直す</button>' : ''}
    </section>`;
  }

  function showError(inputId, boxId, message) {
    const input = document.getElementById(inputId);
    input.setAttribute('aria-invalid', 'true');
    document.getElementById(boxId).innerHTML = `<div class="notice ng">${esc(message)}</div>`;
    input.focus();
  }

  /** 投資額を検証して返す。不正なら画面にエラーを出して null を返す */
  function readInvest() {
    const { budget } = L.stageFor(state.plan, state.balance);
    const v = parseMoney(document.getElementById('invest').value);
    document.getElementById('invest').removeAttribute('aria-invalid');
    document.getElementById('invest-error').innerHTML = '';
    if (v === null || v < 100 || v % 100 !== 0) { showError('invest', 'invest-error', '投資額は100円単位で入力してください。'); return null; }
    if (v > budget) { showError('invest', 'invest-error', `投資額は予算 ${yen(budget)} を超えられません。`); return null; }
    return v;
  }

  /* ---------- 履歴 ---------- */
  function historyCard() {
    if (!state.races.length) return '';
    const rows = state.races.slice().reverse().map((r) => {
      const label = `${esc(r.venue)}${esc(r.r)}R`;
      if (r.result === 'skip') return `<tr><td>${label}<span class="tag">見送り</span></td><td>−</td><td>−</td><td>${yen(r.balanceAfter)}</td><td>${yen(r.securedAfter)}</td></tr>`;
      const tag = r.result === 'hit' ? '的中' : '不的中';
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
    return renderRace();
  }

  /* ---------- 操作 ---------- */
  function snapshot() {
    const copy = JSON.parse(JSON.stringify(state));
    delete copy.prev;
    delete copy.flash;
    return copy;
  }

  function applyResult(result, invest, payout) {
    state.draft.invest = String(invest);
    state.prev = snapshot();
    const d = state.draft;
    const before = L.stageFor(state.plan, state.balance).stage;
    const s = L.settle(state.balance, invest, payout);
    state.balance = s.balance;
    state.secured += s.secured;
    state.totalInvest += invest;
    state.totalPayout += payout;
    state.races.push({
      venue: d.venue, r: d.r, result, invest, payout,
      moved: s.secured, balanceAfter: state.balance, securedAfter: state.secured,
    });
    const next = L.stageFor(state.plan, state.balance);
    const lines = [];
    if (result === 'hit') {
      lines.push(`払戻 ${yen(payout)} − 投資 ${yen(invest)} = 利益 ${signed(s.profit)}`);
      if (s.profit > 0) lines.push(`確保金へ ${yen(s.secured)}、運用残高へ ${yen(s.profit - s.secured)}`);
      else lines.push('利益が出なかったため、確保金への移動はありません。');
    } else {
      lines.push(`投資 ${yen(invest)} を運用残高から差し引きました。`);
    }
    if (next.stage < before) lines.push(`残高がラインを下回ったため、予算を ${yen(next.budget)} に戻します。`);
    else if (next.stage > before) lines.push(`残高がラインを超えたため、次の予算は ${yen(next.budget)} です。`);
    else if (result === 'miss') lines.push(`次の予算は ${yen(next.budget)} です。掛け金は上げません。`);
    state.flash = { kind: result === 'hit' && s.profit > 0 ? 'ok' : 'warn', title: `${d.venue} ${d.r}R ${result === 'hit' ? '的中' : '不的中'}`, lines };
    state.draft = newDraft(d);
    hitMode = false;
    if (state.balance < state.plan.endLine) { state.ended = 'auto'; state.endDate = today(); }
    save();
    render();
    window.scrollTo(0, 0);
  }

  const actions = {
    start() {
      const S = parseCapital();
      if (!S) return;
      state = { plan: L.plan(S), balance: S, secured: 0, totalInvest: 0, totalPayout: 0, races: [], draft: newDraft(), ended: null, endDate: null, startDate: today() };
      save(); render(); window.scrollTo(0, 0);
    },
    discard() {
      if (!confirm('入力した軍資金を取り消して、最初の画面に戻りますか?')) return;
      state = null; save(); render();
    },
    hit() {
      hitMode = !hitMode;
      renderRace();
    },
    miss() {
      const invest = readInvest();
      if (invest !== null) applyResult('miss', invest, 0);
    },
    'confirm-hit'() {
      const invest = readInvest();
      if (invest === null) return;
      const payout = parseMoney(document.getElementById('payout').value);
      if (payout === null || payout <= 0) { showError('payout', 'payout-error', '払戻金を入力してください。'); return; }
      applyResult('hit', invest, payout);
    },
    skip() {
      state.races.push({ venue: state.draft.venue, r: state.draft.r, result: 'skip', invest: 0, payout: 0, moved: 0, balanceAfter: state.balance, securedAfter: state.secured });
      state.flash = { kind: 'ok', title: `${state.draft.venue} ${state.draft.r}R 見送り`, lines: ['残高は変わりません。'] };
      state.prev = null;
      state.draft = newDraft(state.draft);
      hitMode = false;
      save(); render(); window.scrollTo(0, 0);
    },
    undo() {
      if (!state.prev) return;
      if (!confirm('直前のレース結果を取り消して、入力に戻りますか?入力ミスの訂正にだけ使ってください。')) return;
      state = state.prev;
      hitMode = false;
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
    if (t.id === 'invest') { state.draft.invest = t.value; save(); }
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.draft) { state.draft[t.dataset.draft] = t.value; save(); }
  });

  app.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'capital') actions.start();
    if (e.target.id === 'payout') actions['confirm-hit']();
  });

  render();
})();
