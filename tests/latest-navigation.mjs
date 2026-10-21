import assert from 'node:assert/strict';
export async function verifyLatestNavigation(api) {
  const events = [], errors = [], releases = [];
  const queue = api.latestNavigation(async target => {
    events.push('start:' + target);
    await new Promise(resolve => releases.push(resolve));
    if (target === 'failure') throw new Error('保存失敗・入力保持');
    events.push('ready:' + target);
  }, error => errors.push(error.message));
  const request = target => queue(target, () => events.push('show:' + target));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  request('history'); request('cost'); request('previous');
  assert.deepEqual(events, ['start:history']);
  releases.shift()(); await tick();
  assert.deepEqual(events, ['start:history', 'ready:history', 'start:previous']);
  releases.shift()(); await tick();
  assert.equal(events.at(-1), 'show:previous');
  assert.ok(!events.includes('show:history') && !events.includes('start:cost'));
  request('failure'); request('history'); releases.shift()(); await tick();
  assert.deepEqual(errors, ['保存失敗・入力保持']);
  releases.shift()(); await tick(); assert.equal(events.at(-1), 'show:history');
  console.log('PASS: 保存・履歴の準備を直列化、途中の行先を集約、最後の行先だけ表示、失敗後の再試行');
}
