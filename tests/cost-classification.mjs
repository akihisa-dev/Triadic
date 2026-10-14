import assert from 'node:assert/strict';

export async function verifyCostClassification(api) {
  const bytes = await api.createCostUnassignedIndustryPlan();
  const original = bytes.slice();
  const plan = await api.readPlanContents(bytes);
  const industry = plan.industries.find(item => item.industryCode === '10');
  assert.ok(plan.departments.every(item => !item.industryIds.includes(industry.id)));
  const rendered = api.renderCostTable(plan);
  const options = rendered.match(/<select id="cost-industry"[\s\S]*?<\/select>/)[0];
  assert.match(options, new RegExp(`<option value="${industry.id}">未所属の確認業種<\/option>`));
  assert.equal((options.match(/<option /g) ?? []).length, plan.industries.length + 1, '全部署表示ではマスタ全件と合計を候補にする');
  assert.match(api.renderCostTable({ ...plan, departments: [] }), /未所属の確認業種/, '部署がなくても業種マスタ全件を表示する');
  assert.deepEqual(bytes, original, '表示ではファイルを書き換えない');
  console.log('PASS: 総原価表の全部署表示は未所属・未登録の業種も候補に含める');
}
