import assert from 'node:assert/strict';

const text = html => html.replace(/<[^>]*>/g, '');
const rows = html => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
const headers = row => [...row.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(match => text(match[1]));
const cells = row => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match => text(match[1]));
const name = kind => kind === 1 ? '一次予算' : '確定予算';
const previousName = kind => kind === 1 ? '前年見込' : '前年実績';
const shown = amount => amount === 0 ? '' : String(amount);

// Expected columns and amounts are business assertions, not derived from production descriptors.
function assertRenderedTables(api, contents, selected, display, first, final) {
  const kinds = [...selected].sort();
  const latest = kinds.at(-1);
  const expected = [previousName(display), ...kinds.map(name), `${name(latest)}−前年`, ...(kinds.length === 2 ? ['確定予算−一次予算'] : [])];
  const cost = api.renderCostTable(contents, selected);
  const costRows = rows(cost);
  assert.deepEqual(headers(costRows[1]), Array(19).fill(expected).flat(), '総原価表: 前年を残し、最新種別と各表示対象との差だけを一行見出しで表示');
  assert.equal((cost.match(/<col\b/g) ?? []).length, 1 + 19 * expected.length, '総原価表: 定義列と実表示列の数を一致');
  const budgets = kinds.map(kind => (kind === 1 ? first : final) * 100 + kind * 10);
  const expectedAmounts = [display * 100, ...budgets, budgets.at(-1) - display * 100, ...(kinds.length === 2 ? [budgets[1] - budgets[0]] : [])];
  const account = costRows.find(row => headers(row)[0] === '売上高');
  assert.deepEqual(cells(account).slice(0, expected.length), expectedAmounts.map(shown), '総原価表: 独立した前年・一次・確定と丸め前の引き算');
  const expansion = api.renderExpansionTable(contents, selected);
  const expansionRows = rows(expansion);
  const expansionExpected = [...kinds.map(name), ...(kinds.length === 2 ? ['確定予算−一次予算'] : [])];
  assert.deepEqual(headers(expansionRows[1]), Array(19).fill(expansionExpected).flat(), '展開表: 前年を列へ追加しない');
  assert.equal((expansion.match(/<col\b/g) ?? []).length, 4 + 19 * expansionExpected.length * 2, '展開表: 分類4列と予算別の売上・利益だけを持つ');
  assert.deepEqual(headers(expansionRows[3]), [previousName(display)], '展開表: 選択した前年は既存の前年行へ表示');
  assert.deepEqual(cells(expansionRows[3]).slice(0, expansionExpected.length * 2), [...kinds.flatMap(() => [String(display * 100), String(display * 100)]), ...(kinds.length === 2 ? ['', ''] : [])]);
  const expectedTotals = [...budgets.flatMap(amount => [shown(amount), shown(amount)]), ...(kinds.length === 2 ? [shown(budgets[1] - budgets[0]), shown(budgets[1] - budgets[0])] : [])];
  assert.deepEqual(cells(expansionRows[4]).slice(0, expectedTotals.length), expectedTotals, '展開表: 前年表示だけの変更で予算合計を変えない');
}

export async function verifyTableContracts(api) {
  assert.deepEqual(api.latestComparisonPairs(['前年', '一次', '確定', '追加種別']), [
    { latest: '追加種別', earlier: '前年' }, { latest: '追加種別', earlier: '一次' }, { latest: '追加種別', earlier: '確定' },
  ], '確定より後の種別が表示されたら、その種別を差額の左辺にする');
  const original = await api.readPlanContents(await api.createSamplePlan(2026));
  const account = original.accounts.find(item => item.accountName === '売上高');
  const initiative = original.initiatives[0];
  const input = { ...original, previousAmounts: [1, 2].map(previousKind => ({ id: previousKind, revision: 1, previousKind, accountId: account.id, industryId: initiative.industryId, departmentId: initiative.departmentId, month: 4, amount: String(previousKind * 100) })), initiatives: [{ ...initiative, rows: [{ ...initiative.rows[0], accountId: account.id, amounts: { 4: '10' }, overrides: { 2: { 4: '20' } } }] }] };
  for (const display of [1, 2]) for (const first of [1, 2]) for (const final of [1, 2]) for (const selected of [[1], [2], [1, 2], [2, 1]]) {
    const context = { ...input, budgetPrevious: { display, 1: first, 2: final } };
    const before = structuredClone(context);
    assertRenderedTables(api, context, selected, display, first, final);
    for (const previous of [1, 2]) {
      const label = `前年列に${previousName(previous)}を表示`;
      assert.deepEqual(api.comparisonSelectionChange(selected, context.budgetPrevious, label), { selected, previous: { ...context.budgetPrevious, display: previous } }, '前年の操作で予算の選択・金額条件を変えない');
      for (const kind of [1, 2]) {
        const toggleOff = selected.includes(kind) && context.budgetPrevious[kind] === previous;
        const expectedSelected = toggleOff ? selected.length === 1 ? selected : selected.filter(id => id !== kind) : [...new Set([...selected, kind])].sort();
        const expectedPrevious = toggleOff ? context.budgetPrevious : { ...context.budgetPrevious, [kind]: previous };
        assert.deepEqual(api.comparisonSelectionChange(selected, context.budgetPrevious, `${previousName(previous)}を基準にした${name(kind)}`), { selected: expectedSelected, previous: expectedPrevious }, '予算の操作で他の2列を変えず、最後の予算選択を残す');
      }
    }
    assert.deepEqual(context, before, '表示と選択操作で元の金額や設定を書き換えない');
  }
  // Demonstrate that the guard rejects the concrete regressions, rather than merely running.
  const context = { ...input, budgetPrevious: { display: 1, 1: 1, 2: 2 } };
  for (const broken of [
    { ...api, renderExpansionTable: (...args) => api.renderExpansionTable(...args).replace('<colgroup>', '<colgroup><col/>') },
    { ...api, renderCostTable: (...args) => api.renderCostTable(...args).replaceAll('確定予算−前年', '差額') },
    { ...api, renderCostTable: (...args) => api.renderCostTable(...args).replaceAll('確定予算−一次予算', '一次予算−確定予算') },
  ]) assert.throws(() => assertRenderedTables(broken, context, [1, 2], 1, 1, 2), assert.AssertionError, '不要列・差額欠落・逆向きの比較を拒否');
  console.log('PASS: 実画面部品の32条件、総原価表の最新種別との差額、展開表の前年行・列構成、独立選択、元データ保持、既知の破壊の検出');
}
