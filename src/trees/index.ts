import type { Tree } from '../types';
import treeSE from './tree_SE.json';
import treeOC from './tree_OC.json';
import treeStranger1 from './tree_stranger1.json';
import treeStranger2 from './tree_stranger2.json';
import treeStranger3 from './tree_stranger3.json';
import treeCharacterA from './tree_characterA.json';

export const TREES: Record<string, Tree> = {
  'tree:SE': treeSE as Tree,
  'tree:OC': treeOC as Tree,
  'tree:stranger1': treeStranger1 as Tree,
  'tree:stranger2': treeStranger2 as Tree,
  'tree:stranger3': treeStranger3 as Tree,
  'tree:characterA': treeCharacterA as Tree,
};

export const CHARACTER_TREES = ['tree:characterA'];
export const STRANGER_TREES = ['tree:stranger1', 'tree:stranger2', 'tree:stranger3'];
