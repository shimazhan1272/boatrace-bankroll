/* ボートレース資金管理:ルール計算(画面に依存しない純粋関数) */
(function (root) {
  'use strict';

  const floor100 = (n) => Math.floor(n / 100) * 100;

  /** 開始時の各数値 */
  function plan(S) {
    const B = Math.max(100, floor100(S * 0.2));
    return {
      S,
      B,
      line1: S * 1.5,
      budget1: floor100(B * 1.5),
      line2: S * 2,
      budget2: floor100(B * 2),
      endLine: B,
    };
  }

  /** ルール1:運用残高から段階と予算を決める */
  function stageFor(p, balance) {
    let stage = 0;
    let budget = p.B;
    if (balance >= p.line2) { stage = 2; budget = p.budget2; }
    else if (balance >= p.line1) { stage = 1; budget = p.budget1; }
    return { stage, budget: Math.min(budget, floor100(balance)) };
  }

  const payoutOf = (units, odds) => Math.round(units * odds * 100);

  function composite(oddsList) {
    return 1 / oddsList.reduce((sum, o) => sum + 1 / o, 0);
  }

  /** 合計 total 口で、最低払戻が最大になる配分(1点最低1口) */
  function spread(oddsList, total) {
    const units = oddsList.map(() => 1);
    for (let left = total - units.length; left > 0; left--) {
      let low = 0;
      for (let i = 1; i < units.length; i++) {
        if (payoutOf(units[i], oddsList[i]) < payoutOf(units[low], oddsList[low])) low = i;
      }
      units[low]++;
    }
    return units;
  }

  /**
   * ルール2:配分。
   * 予算内で「どの目が当たっても投資額を上回る」最大の投資額を選ぶ。
   * 投資額を増やすと逆にトリガミになる場合があるため、口数を1つずつ検証する。
   */
  function allocate(oddsList, budget) {
    const n = oddsList.length;
    const maxUnits = Math.floor(budget / 100);
    const comp = composite(oddsList);
    const target = budget * 2;
    if (n === 0 || n > maxUnits) {
      return { feasible: false, tooMany: n > maxUnits, composite: comp, target, units: [], total: 0, minPayout: 0, ok: false };
    }
    let chosen = null;
    for (let t = maxUnits; t >= n; t--) {
      const units = spread(oddsList, t);
      const minPayout = Math.min(...units.map((u, i) => payoutOf(u, oddsList[i])));
      if (minPayout > t * 100) { chosen = { units, total: t * 100, minPayout }; break; }
    }
    const feasible = !!chosen;
    if (!chosen) {
      const units = spread(oddsList, maxUnits);
      chosen = { units, total: maxUnits * 100, minPayout: Math.min(...units.map((u, i) => payoutOf(u, oddsList[i]))) };
    }
    return {
      feasible,
      tooMany: false,
      composite: comp,
      target,
      units: chosen.units,
      total: chosen.total,
      minPayout: chosen.minPayout,
      reachesTarget: chosen.minPayout >= target,
      ok: feasible && comp >= 2,
    };
  }

  function subsets(n, k) {
    const out = [];
    const walk = (start, cur) => {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = start; i < n; i++) { cur.push(i); walk(i + 1, cur); cur.pop(); }
    };
    walk(0, []);
    return out;
  }

  /** k点の組み合わせのうち、条件を満たし最も低オッズ寄り(本線寄り)のものを返す */
  function bestSubset(oddsList, budget, k) {
    let best = null;
    let bestWeight = -1;
    for (const idx of subsets(oddsList.length, k)) {
      const sub = idx.map((i) => oddsList[i]);
      const a = allocate(sub, budget);
      if (!a.ok) continue;
      const weight = sub.reduce((s, o) => s + 1 / o, 0);
      if (weight > bestWeight) { bestWeight = weight; best = { idx, alloc: a }; }
    }
    return best;
  }

  /** 低オッズの目から順に削って条件を満たす案 */
  function trimLow(oddsList, budget) {
    const order = oddsList.map((o, i) => [o, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    for (let drop = 1; drop < oddsList.length; drop++) {
      const removed = new Set(order.slice(0, drop));
      const idx = oddsList.map((_, i) => i).filter((i) => !removed.has(i));
      const a = allocate(idx.map((i) => oddsList[i]), budget);
      if (a.ok) return { idx, alloc: a };
    }
    return null;
  }

  /** 条件を満たさないとき/予算が少ないときの提案 */
  function proposals(oddsList, budget) {
    const n = oddsList.length;
    const maxUnits = Math.floor(budget / 100);
    const base = allocate(oddsList, budget);
    const out = [];
    const seen = new Set();
    const add = (kind, title, plan_) => {
      if (!plan_) return;
      const key = plan_.idx.join(',');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ kind, title, idx: plan_.idx, alloc: plan_.alloc });
    };
    if (!base.ok) {
      add('trim', '低オッズの目を削る', trimLow(oddsList, budget));
      for (const k of [4, 3]) {
        if (k < n) add('narrow', `${k}点に絞る`, bestSubset(oddsList, budget, k));
      }
    }
    if (n >= 2 && maxUnits <= n) {
      const top = Math.max(1, Math.min(3, n - 1, Math.floor(maxUnits / 2)));
      for (let k = top; k >= 1; k--) {
        const thick = bestSubset(oddsList, budget, k);
        if (thick) { add('thick', `${k}点に絞って本線に厚く張る`, thick); break; }
      }
    }
    return out;
  }

  /** ルール3:結果の精算 */
  function settle(balance, invest, payout) {
    const profit = payout - invest;
    const secured = profit > 0 ? floor100(profit * 0.5) : 0;
    return { profit, secured, balance: balance - invest + payout - secured };
  }

  const api = { floor100, plan, stageFor, payoutOf, composite, allocate, proposals, settle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BoatLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
