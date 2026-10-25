import assert from 'node:assert/strict';
export function verifyAmountExpression(api) {
  for (const [expression, result] of [
    ['=12*4', '48'], ['=120*1.05', '126'], ['=2+3*4', '14'], ['=(2+3)*4', '20'],
    ['= -(12 + 3) / 2', '-7.5'], ['=0.1+0.2', '0.3'], ['=1/3*3', '1'], ['=1/8', '0.125'],
    ['=0.0001*10', '0.001'], ['=1-1', '0'], ['=2*-3', '-6'], ['=10-3-2', '5'],
    ['=9007199254740.991+1-1', '9007199254740.991'], ['=-9007199254740.991', '-9007199254740.991'],
  ]) assert.equal(api.normalizeGridAmount(expression), result, expression);
  for (const expression of ['=', '=1+', '=()', '=2(3)', '=(1+2', '=1+2)', '=1e3', '=A1', '=Math.random()', '=1;alert(1)', '=1/**/2', '=2**3']) {
    assert.throws(() => api.normalizeGridAmount(expression), /計算式/, expression);
  }
  assert.throws(() => api.normalizeGridAmount('=1/(2-2)'), /0で割る/);
  assert.throws(() => api.normalizeGridAmount('=1/3'), /1円未満/);
  assert.throws(() => api.normalizeGridAmount('=9007199254740.991+0.001'), /範囲/);
  assert.throws(() => api.normalizeGridAmount('=' + '1+'.repeat(300) + '1'), /512/);
  assert.throws(() => api.normalizeGridAmount('=' + '('.repeat(34) + '1' + ')'.repeat(34)), /括弧/);
  assert.throws(() => api.amountToYen('=12*4'), /金額/, '保存側は引き続き式を拒否する');
  const draft = { rows: [{ accountId: 1, amounts: { 4: '7', 5: '8' } }] };
  const before = structuredClone(draft), selection = { anchor: { row: 0, column: 0 }, end: { row: 0, column: 1 } };
  assert.deepEqual(api.fillInitiativeGrid(draft, 2, selection, '=12*4').rows[0].overrides[2], { 4: '48', 5: '48' });
  assert.deepEqual(api.pasteInitiativeGrid(draft, 1, selection.anchor, '=12*4\t=1-1').rows[0].amounts, { 4: '48', 5: '0' });
  assert.deepEqual(api.pastePreviousGrid(draft, [1], selection.anchor, '=12*4\t=1-1').rows[0].amounts, { 4: '48', 5: '0' });
  assert.throws(() => api.pasteInitiativeGrid(draft, 1, selection.anchor, '=12*4\t=1/0'), /0で割る/);
  assert.throws(() => api.pastePreviousGrid(draft, [1], selection.anchor, '=12*4\t=1/0'), /0で割る/);
  assert.deepEqual(draft, before, '計算失敗や範囲処理で元データを変えない');
  console.log('金額欄の計算: 演算順序・正負・円精度・相殺・不正式・範囲・貼付の原子性・数値のみの保存を確認');
}
