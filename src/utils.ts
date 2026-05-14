import { ID_REGEX, HANDLE_REGEX } from './constants';

export function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function generateHandle(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const len = Math.random() < 0.5 ? 2 : 3;
  return Array.from({ length: len }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

export function isValidId(id: string): boolean {
  return ID_REGEX.test(id);
}

export function isValidHandle(h: string): boolean {
  return HANDLE_REGEX.test(h);
}
