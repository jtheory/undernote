export const TREE_ASSIGNMENT_RATES = {
  CHARACTER: 5,   // percent (0–4)
  STRANGER: 15,   // percent (5–19)
  // remainder (20–99) = silence
};

export const ID_REGEX = /^[a-z0-9]{12}$/;
export const HANDLE_REGEX = /^[A-Z]{2,3}$/;
export const MAX_MESSAGE_LENGTH = 500;

export const CANONICAL_IDS: Record<string, string> = {
  ajjrpx34l3qv: 'tree:OC',
  k6v63rlw5n4m: 'tree:SE',
};
