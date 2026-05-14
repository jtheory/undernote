import type { Contact, WorldState } from './types';

const NS = 'undernote';

function key(...parts: string[]) {
  return [NS, ...parts].join('.');
}

export const storage = {
  getWorld(): WorldState {
    return {
      assignments: JSON.parse(localStorage.getItem(key('world', 'assignments')) ?? '{}'),
      usedCharacterTrees: JSON.parse(localStorage.getItem(key('world', 'usedCharacterTrees')) ?? '[]'),
    };
  },
  saveWorld(world: WorldState) {
    localStorage.setItem(key('world', 'assignments'), JSON.stringify(world.assignments));
    localStorage.setItem(key('world', 'usedCharacterTrees'), JSON.stringify(world.usedCharacterTrees));
  },
  getDeviceIds(): string[] {
    return JSON.parse(localStorage.getItem(key('device', 'ids')) ?? '[]');
  },
  addDeviceId(id: string) {
    const ids = this.getDeviceIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem(key('device', 'ids'), JSON.stringify(ids));
    }
  },
  getPlayerHandle(playerId: string): string | null {
    return localStorage.getItem(key('player', playerId, 'handle'));
  },
  setPlayerHandle(playerId: string, handle: string) {
    localStorage.setItem(key('player', playerId, 'handle'), handle);
  },
  getPlayerContacts(playerId: string): Contact[] {
    return JSON.parse(localStorage.getItem(key('player', playerId, 'contacts')) ?? '[]');
  },
  savePlayerContacts(playerId: string, contacts: Contact[]) {
    localStorage.setItem(key('player', playerId, 'contacts'), JSON.stringify(contacts));
  },
};
