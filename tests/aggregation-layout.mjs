import assert from 'node:assert/strict';

export async function verifyAggregationLayout(api) {
  const { aggregationRanges, placedMasterRows, orderedMasterRows, masterRowKey, changeAggregationMaster, createTriadicDatabase, readPlanContents } = api;
  let bytes = await createTriadicDatabase(2026);
  const before = await readPlanContents(bytes), order = orderedMasterRows(before.accounts, before.aggregations);
  const original = JSON.stringify(order);
  const ranges = aggregationRanges(order, before.aggregations);
  for (const group of before.aggregations) {
    const range = ranges.find(item => item.id === group.id);
    assert.ok(range);
    const expected = new Set([`group:${group.id}`]);
    const pending = [group];
    while (pending.length) for (const member of pending.pop().members) {
      expected.add(masterRowKey(member));
      if (member.kind === 'group') pending.push(before.aggregations.find(item => item.id === member.id));
    }
    assert.deepEqual(new Set(range.segments.flatMap(segment => order.slice(segment.start, segment.end + 1).map(masterRowKey))), expected, 'L字は子孫だけを囲い、無関係な行を含めない');
    for (const segment of range.segments) if (segment.groupIndex !== null) assert.deepEqual(order[segment.groupIndex], { kind: 'group', id: group.id }, '横の受け皿は実際の集計行につながる');
  }
  assert.equal(JSON.stringify(order), original, '表示のために保存順を組み替えない');
  const source = { kind: 'group', id: 5 }, target = { kind: 'group', id: 9 };
  const nextOrder = placedMasterRows(order, before.aggregations, source, target);
  const descendants = before.aggregations.find(item => item.id === source.id).members;
  const block = [...descendants, source].map(masterRowKey);
  assert.deepEqual(nextOrder.filter(row => block.includes(masterRowKey(row))).map(masterRowKey), order.filter(row => block.includes(masterRowKey(row))).map(masterRowKey), '集計を移しても配下の相対順を維持');
  const snapshot = bytes.slice();
  bytes = await changeAggregationMaster(bytes, { type: 'move', member: source, parentId: target.id, sign: -1, presentationOrder: nextOrder });
  const after = await readPlanContents(bytes);
  assert.deepEqual(orderedMasterRows(after.accounts, after.aggregations), nextOrder, '所属と並び順を一度の保存で確定');
  assert.deepEqual(after.aggregations.find(item => item.id === source.id).members, descendants, '配下を保持');
  assert.ok(after.aggregations.find(item => item.id === target.id).members.some(member => member.kind === 'group' && member.id === source.id && member.sign === -1));
  await assert.rejects(changeAggregationMaster(bytes, { type: 'move', member: target, parentId: source.id, sign: 1 }), /循環/);
  assert.throws(() => placedMasterRows(order, before.aggregations, source, descendants[0]), /配下/);
  assert.deepEqual((await readPlanContents(snapshot)).aggregations, before.aggregations, '更新前の保存データを保護');
  const reversed = [...nextOrder].reverse();
  const unrelated = reversed.find(row => row.kind === 'account' && !descendants.some(member => masterRowKey(member) === masterRowKey(row)));
  const separated = reversed.filter(row => masterRowKey(row) !== masterRowKey(unrelated));
  separated.splice(separated.findIndex(row => masterRowKey(row) === masterRowKey(source)) + 1, 0, unrelated);
  const reverseRanges = aggregationRanges(separated, after.aggregations);
  const discontinuous = reverseRanges.find(item => item.id === source.id);
  assert.ok(discontinuous.segments.length > 1, '別集計へ移した後の離れた所属は分割する');
  for (const segment of reverseRanges.find(item => item.id === source.id).segments) if (segment.groupIndex !== null) assert.equal(separated[segment.groupIndex].id, source.id, '集計行が先にあっても実際の行に接続');
  console.log('PASS: aggregation ranges, unchanged cost-table order, atomic placement and cycle rejection');
}
