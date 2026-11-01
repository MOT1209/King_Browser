import assert from 'node:assert/strict';
import { parseDragPoint, dragPath, MAX_DRAG_COORD } from '../electron/main/dragPlan';

console.log('\n--- Drag Plan Test Suite ---');
{
  assert.deepEqual(parseDragPoint({ x: 1, y: 2 }), { x: 1, y: 2 });
  for (const bad of [null, 5, {}, { x: 1 }, { x: '1', y: 2 }, { x: NaN, y: 1 }, { x: Infinity, y: 1 }, { x: -1, y: 1 }, { x: 1, y: MAX_DRAG_COORD + 1 }]) {
    assert.equal(parseDragPoint(bad), null, JSON.stringify(bad));
  }
  const path = dragPath({ x: 0, y: 0 }, { x: 80, y: 40 }, 4);
  assert.equal(path.length, 4);
  assert.deepEqual(path[3], { x: 80, y: 40 }, 'the path ends exactly on the target');
  assert.deepEqual(path[0], { x: 20, y: 10 });
  assert.equal(dragPath({ x: 0, y: 0 }, { x: 1, y: 1 }, 10_000).length, 50, 'steps are capped');
  assert.equal(dragPath({ x: 0, y: 0 }, { x: 1, y: 1 }, 0).length, 1, 'at least one step');
  console.log('[PASS] Drag plan - points are validated and the path ends on the target');
}
