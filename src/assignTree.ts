import { CANONICAL_IDS, TREE_ASSIGNMENT_RATES } from './constants';
import { CHARACTER_TREES, STRANGER_TREES } from './trees';
import type { WorldState } from './types';

export function assignTree(id: string, world: WorldState): { world: WorldState; treeKey: string | 'silence' } {
  if (world.assignments[id]) {
    return { world, treeKey: world.assignments[id] };
  }

  let treeKey: string | 'silence';

  if (CANONICAL_IDS[id]) {
    treeKey = CANONICAL_IDS[id];
  } else {
    const roll = Math.floor(Math.random() * 100);
    if (roll < TREE_ASSIGNMENT_RATES.CHARACTER) {
      const unused = CHARACTER_TREES.filter(t => !world.usedCharacterTrees.includes(t));
      if (unused.length > 0) {
        treeKey = unused[Math.floor(Math.random() * unused.length)];
      } else {
        // fall through to stranger
        treeKey = STRANGER_TREES[Math.floor(Math.random() * STRANGER_TREES.length)];
      }
    } else if (roll < TREE_ASSIGNMENT_RATES.CHARACTER + TREE_ASSIGNMENT_RATES.STRANGER) {
      treeKey = STRANGER_TREES[Math.floor(Math.random() * STRANGER_TREES.length)];
    } else {
      treeKey = 'silence';
    }
  }

  const newWorld = { ...world };
  newWorld.assignments = { ...world.assignments, [id]: treeKey };
  if (treeKey !== 'silence' && CHARACTER_TREES.includes(treeKey)) {
    newWorld.usedCharacterTrees = [...world.usedCharacterTrees, treeKey];
  }

  return { world: newWorld, treeKey };
}
