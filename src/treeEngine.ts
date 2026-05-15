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
    const t = ctx.currentTime;

    // Option 6 — 280Hz, 500ms, slow hum-like fade
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.50);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.50);

    // Option 4b — 280Hz + soft relay clicks, same duration (try this instead)
    // const makeClick = (when: number, g: number) => {
    //   const c = ctx.createOscillator();
    //   const cg = ctx.createGain();
    //   c.type = 'sine';
    //   c.frequency.setValueAtTime(80, when);
    //   c.frequency.exponentialRampToValueAtTime(40, when + 0.012);
    //   cg.gain.setValueAtTime(g, when);
    //   cg.gain.exponentialRampToValueAtTime(0.001, when + 0.012);
    //   c.connect(cg); cg.connect(ctx.destination);
    //   c.start(when); c.stop(when + 0.015);
    // };
    // makeClick(t, 0.06);
    // const osc = ctx.createOscillator();
    // const filter = ctx.createBiquadFilter();
    // const gain = ctx.createGain();
    // osc.type = 'sine';
    // osc.frequency.setValueAtTime(280, t);
    // filter.type = 'lowpass';
    // filter.frequency.setValueAtTime(600, t);
    // gain.gain.setValueAtTime(0.08, t + 0.004);
    // gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
    // osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    // osc.start(t + 0.004); osc.stop(t + 0.30);
    // makeClick(t + 0.30, 0.04);
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
