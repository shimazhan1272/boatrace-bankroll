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

  /** ルール3:結果の精算 */
  function settle(balance, invest, payout) {
    const profit = payout - invest;
    const secured = profit > 0 ? floor100(profit * 0.5) : 0;
    return { profit, secured, balance: balance - invest + payout - secured };
  }

  const api = { floor100, plan, stageFor, settle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BoatLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
