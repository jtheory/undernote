import type { Tree, TreeNode, ConversationState, ContactStatus } from './types';

function interpolate(text: string, playerMessage: string, captures: string[]): string {
  let result = text.replace(/\{message\}/g, playerMessage);
  captures.forEach((cap, i) => {
    result = result.replace(new RegExp(`\\{${i + 1}\\}`, 'g'), cap);
  });
  return result;
}

export type EngineCallbacks = {
  onSend: (contactId: string, text: string) => void;
  onStatusChange: (contactId: string, status: ContactStatus) => void;
  onActivity: (contactId: string) => void;
};

export class TreeEngine {
  private trees: Record<string, Tree>;
  private states: Map<string, ConversationState> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private callbacks: EngineCallbacks;
  private audioContext: AudioContext | null = null;

  constructor(trees: Record<string, Tree>, callbacks: EngineCallbacks) {
    this.trees = trees;
    this.callbacks = callbacks;
  }

  unlockAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
  }

  private playPing() {
    const ctx = this.audioContext;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(820, ctx.currentTime);
    osc.detune.setValueAtTime(-8, ctx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.07, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.09);
  }

  initContact(contactId: string, treeKey: string, currentNodeId: string) {
    if (this.states.has(contactId)) return;
    const state: ConversationState = {
      contactId,
      messages: [],
      eventQueue: [],
      isPlayingEvents: false,
      pendingPlayerMessage: null,
      captureGroups: [],
    };
    this.states.set(contactId, state);
    this.enterNode(contactId, treeKey, currentNodeId, '', []);
  }

  private getTree(treeKey: string): Tree {
    const tree = this.trees[treeKey];
    if (!tree) throw new Error(`Unknown tree: ${treeKey}`);
    return tree;
  }

  private enterNode(contactId: string, treeKey: string, nodeId: string, playerMessage: string, captures: string[]) {
    const state = this.states.get(contactId);
    if (!state) return;

    const tree = this.getTree(treeKey);
    const node = tree.nodes[nodeId];
    if (!node) return;

    state.eventQueue = [...node.events];
    state.isPlayingEvents = true;
    state.pendingPlayerMessage = null;
    state.captureGroups = captures;

    this.playNextEvent(contactId, treeKey, node, playerMessage, captures);
  }

  private playNextEvent(
    contactId: string,
    treeKey: string,
    node: TreeNode,
    playerMessage: string,
    captures: string[]
  ) {
    const state = this.states.get(contactId);
    if (!state) return;

    if (state.eventQueue.length === 0) {
      state.isPlayingEvents = false;
      // If a player message arrived during playback, handle it now
      if (state.pendingPlayerMessage !== null) {
        const msg = state.pendingPlayerMessage;
        state.pendingPlayerMessage = null;
        this.matchAndAdvance(contactId, treeKey, node, msg);
      }
      return;
    }

    const event = state.eventQueue.shift()!;

    if ('wait' in event) {
      const timer = setTimeout(() => {
        // Re-check state hasn't been cancelled
        const s = this.states.get(contactId);
        if (!s || s.eventQueue === state.eventQueue || true) {
          this.playNextEvent(contactId, treeKey, node, playerMessage, captures);
        }
      }, event.wait);
      this.timers.set(`${contactId}:current`, timer);
    } else if ('send' in event) {
      const text = interpolate(event.send, playerMessage, captures);
      this.callbacks.onSend(contactId, text);
      this.callbacks.onActivity(contactId);
      this.playPing();
      this.playNextEvent(contactId, treeKey, node, playerMessage, captures);
    } else if ('status' in event) {
      this.callbacks.onStatusChange(contactId, event.status);
      this.playNextEvent(contactId, treeKey, node, playerMessage, captures);
    }
  }

  receivePlayerMessage(contactId: string, treeKey: string, currentNodeId: string, text: string) {
    const state = this.states.get(contactId);
    if (!state) return;

    const tree = this.getTree(treeKey);
    const node = tree.nodes[currentNodeId];
    if (!node) return;

    if (state.isPlayingEvents) {
      // Interrupt: cancel future events, queue the message
      state.eventQueue = [];
      state.pendingPlayerMessage = text;
    } else {
      this.matchAndAdvance(contactId, treeKey, node, text);
    }
  }

  private matchAndAdvance(contactId: string, treeKey: string, node: TreeNode, playerMessage: string) {
    for (const pattern of node.patterns) {
      const regex = new RegExp(pattern.pattern, 'i');
      const match = regex.exec(playerMessage);
      if (match) {
        const captures = match.slice(1);
        // Update currentNodeId via callback — caller must persist
        this.callbacks.onActivity(contactId);
        this.enterNode(contactId, treeKey, pattern.next, playerMessage, captures);
        // Signal node change
        this._onNodeChange?.(contactId, pattern.next);
        return;
      }
    }
    // No match, no catchall — message swallowed, node stays
  }

  _onNodeChange?: (contactId: string, nodeId: string) => void;
}
