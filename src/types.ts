export type ContactStatus = 'offline' | 'online' | 'deleted';

export interface Contact {
  id: string;
  handle: string;
  status: ContactStatus;
  currentNodeId: string;
}

export interface PlayerState {
  id: string;
  handle: string;
  contacts: Contact[];
}

export interface WorldState {
  assignments: Record<string, string>; // id -> treeKey | 'silence'
  usedCharacterTrees: string[];
}

// Tree types
export type WaitEvent = { wait: number };
export type SendEvent = { send: string };
export type StatusEvent = { status: ContactStatus };
export type TreeEvent = WaitEvent | SendEvent | StatusEvent;

export interface Pattern {
  pattern: string;
  next: string;
}

export interface TreeNode {
  id: string;
  events: TreeEvent[];
  patterns: Pattern[];
}

export interface Tree {
  root: string;
  nodes: Record<string, TreeNode>;
}

export type Message = {
  id: string;
  contactId: string;
  from: 'player' | 'contact';
  text: string;
  timestamp: number;
};

export type ConversationState = {
  contactId: string;
  messages: Message[];
  // runtime only, not persisted
  eventQueue: TreeEvent[];
  isPlayingEvents: boolean;
  pendingPlayerMessage: string | null;
  captureGroups: string[];
};
