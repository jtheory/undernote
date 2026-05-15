import { useState, useEffect, useRef, useCallback } from 'react';
import type { Contact, ContactStatus, Message, PlayerState } from './types';
import { storage } from './storage';
import { assignTree } from './assignTree';
import { TreeEngine } from './treeEngine';
import { TREES } from './trees';
import { generateId, generateHandle, isValidId, isValidHandle } from './utils';
import { MAX_MESSAGE_LENGTH } from './constants';

// ── screens ────────────────────────────────────────────────────────────────

type Screen = 'splash' | 'login' | 'app';

// ── runtime message store (session-only, not persisted) ────────────────────

type Messages = Record<string, Message[]>; // contactId → messages

function msgId() {
  return Math.random().toString(36).slice(2);
}

// ── Splash ─────────────────────────────────────────────────────────────────

const BOOT_STEPS = [
  'Peer mesh triangulation',
  'Negotiating ephemeral keys',
  'Locking secure relay chain',
];
const STEP_DURATION = 1800; // ms per step
const DONE_DELAY = 900;     // pause after last step before advancing

function Splash({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step < BOOT_STEPS.length - 1) {
      const t = setTimeout(() => setStep(s => s + 1), STEP_DURATION);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(onDone, STEP_DURATION + DONE_DELAY);
      return () => clearTimeout(t);
    }
  }, [step, onDone]);

  return (
    <div style={styles.center}>
      <div style={styles.splashText}>
        undernote<span className="cursor" />
      </div>
      <div style={{ marginTop: 24, fontSize: 11, letterSpacing: '0.12em' }}>
        <span className="blink">›</span> {BOOT_STEPS[step]}...
      </div>
    </div>
  );
}

// ── Login ──────────────────────────────────────────────────────────────────

function Login({ onLogin }: { onLogin: (player: PlayerState) => void }) {
  const [mode, setMode] = useState<'pick' | 'new-handle' | 'reconnect'>('pick');
  const [handle, setHandle] = useState('');
  const [handleErr, setHandleErr] = useState('');
  const [pendingId, setPendingId] = useState('');
  const deviceIds = storage.getDeviceIds();

  function startNew() {
    setPendingId(generateId());
    setHandle('');
    setHandleErr('');
    setMode('new-handle');
  }

  function confirmNew() {
    const h = handle.trim().toUpperCase();
    if (!isValidHandle(h)) {
      setHandleErr('HANDLE MUST BE 2–3 UPPERCASE LETTERS (A-Z)');
      return;
    }
    storage.addDeviceId(pendingId);
    storage.setPlayerHandle(pendingId, h);
    onLogin({
      id: pendingId,
      handle: h,
      contacts: [],
    });
  }

  function reconnect(id: string) {
    const h = storage.getPlayerHandle(id) ?? '??';
    const contacts = storage.getPlayerContacts(id);
    onLogin({ id, handle: h, contacts });
  }

  if (mode === 'new-handle') {
    return (
      <div style={styles.center}>
        <div style={styles.loginBox}>
          <div className="dim" style={{ marginBottom: 4 }}>NEW IDENTITY</div>
          <div style={{ marginBottom: 16 }}>
            ID assigned: <span style={{ letterSpacing: '0.1em' }}>{pendingId}</span>
          </div>
          <div className="dim" style={{ marginBottom: 8, fontSize: 11 }}>
            CHOOSE HANDLE (2–3 LETTERS)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="dim">&gt;</span>
            <input
              autoFocus
              maxLength={3}
              value={handle}
              onChange={e => { setHandle(e.target.value.toUpperCase()); setHandleErr(''); }}
              onKeyDown={e => e.key === 'Enter' && confirmNew()}
              placeholder=""
              style={{ width: 80 }}
            />
            <button onClick={confirmNew}>CONFIRM</button>
          </div>
          {handleErr && <div style={{ color: '#ff3333', marginTop: 8, fontSize: 11 }}>{handleErr}</div>}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setMode('pick')} style={{ border: 'none', fontSize: 11 }} className="dim">
              ← BACK
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'reconnect') {
    return (
      <div style={styles.center}>
        <div style={styles.loginBox}>
          <div className="dim" style={{ marginBottom: 12 }}>SELECT IDENTITY</div>
          {deviceIds.map(id => {
            const h = storage.getPlayerHandle(id) ?? '??';
            return (
              <div
                key={id}
                style={styles.reconnectRow}
                onClick={() => reconnect(id)}
              >
                <span style={{ fontWeight: 'bold' }}>{h}</span>
                <span className="dim" style={{ marginLeft: 12, fontSize: 11 }}>{id}</span>
              </div>
            );
          })}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setMode('pick')} style={{ border: 'none', fontSize: 11 }} className="dim">
              ← BACK
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.center}>
      <div style={styles.loginBox}>
        <div style={{ fontSize: 20, letterSpacing: '0.1em', marginBottom: 8 }}>undernote</div>
        <div className="dim" style={{ fontSize: 11, marginBottom: 32, letterSpacing: '0.15em' }}>
          ZERO-TRUST · EPHEMERAL · MIL-SPEC ENCRYPTION
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={startNew} style={{ padding: '8px 16px' }}>&gt; NEW IDENTITY</button>
          <button
            onClick={() => setMode('reconnect')}
            disabled={deviceIds.length === 0}
            style={{ padding: '8px 16px' }}
          >
            &gt; RECONNECT
          </button>
        </div>
        {deviceIds.length === 0 && (
          <div className="dim" style={{ marginTop: 12, fontSize: 11 }}>no prior identities on this device</div>
        )}
      </div>
    </div>
  );
}

// ── AddContact modal ────────────────────────────────────────────────────────

function AddContact({
  playerId,
  existingIds,
  onAdd,
  onClose,
}: {
  playerId: string;
  existingIds: string[];
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');

  function submit() {
    const id = value.trim().toLowerCase();
    if (!isValidId(id)) {
      setErr('INVALID ID FORMAT — 12 ALPHANUMERIC CHARACTERS REQUIRED');
      return;
    }
    if (id === playerId) {
      setErr('CANNOT SEND TO SELF');
      return;
    }
    if (existingIds.includes(id)) {
      setErr('CONTACT ALREADY EXISTS');
      return;
    }
    onAdd(id);
  }

  return (
    <div style={styles.modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div className="dim" style={{ marginBottom: 12, letterSpacing: '0.1em' }}>ADD CONTACT</div>
        <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>ENTER 12-CHARACTER ID</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="dim">&gt;</span>
          <input
            autoFocus
            maxLength={12}
            value={value}
            onChange={e => { setValue(e.target.value.toLowerCase()); setErr(''); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
            placeholder=""
          />
        </div>
        {err && <div style={{ color: '#ff3333', marginTop: 8, fontSize: 11 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={submit}>SEND REQUEST</button>
          <button onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ── ContactList ─────────────────────────────────────────────────────────────

function ContactList({
  contacts,
  activeId,
  activity,
  onSelect,
  onAdd,
  isMobile,
}: {
  contacts: Contact[];
  activeId: string | null;
  activity: Set<string>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  isMobile: boolean;
}) {
  return (
    <div style={{ ...styles.contactList, width: isMobile ? '100%' : 220, borderRight: isMobile ? 'none' : '1px solid var(--green)' }}>
      <div style={styles.contactListHeader}>
        <span style={{ letterSpacing: '0.1em' }}>CONTACTS</span>
        <button onClick={onAdd} style={{ fontSize: 11, padding: '2px 6px' }} title="Ctrl+N">
          + ADD
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {contacts.length === 0 && (
          <div className="dim" style={{ padding: '12px 12px', fontSize: 11 }}>
            no contacts yet
          </div>
        )}
        {contacts.map(c => {
          const isActive = c.id === activeId;
          const hasActivity = activity.has(c.id) && !isActive;
          const isDeleted = c.status === 'deleted';
          return (
            <div
              key={c.id}
              style={{
                ...styles.contactRow,
                background: isActive ? 'var(--green-faint)' : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => onSelect(c.id)}
            >
              <span style={{ width: 14, flexShrink: 0 }}>
                {isDeleted ? (
                  <span className="dim" style={{ fontSize: 10 }}>[D]</span>
                ) : c.status === 'online' ? (
                  <span style={{ color: 'var(--green)' }}>●</span>
                ) : (
                  <span className="dim">○</span>
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={isDeleted ? 'strike' : ''}>{c.handle}</div>
                <div className="dim" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.id}
                </div>
              </div>
              {hasActivity && (
                <span className="blink" style={{ color: 'var(--green)', fontSize: 12 }}>*</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ChatPanel ───────────────────────────────────────────────────────────────

function ChatPanel({
  contact,
  messages,
  playerHandle,
  onSend,
}: {
  contact: Contact | null;
  messages: Message[];
  playerHandle: string;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (contact && contact.status === 'online') {
      inputRef.current?.focus();
    }
  }, [contact?.id, contact?.status]);

  // Reset draft when switching contacts
  useEffect(() => {
    setDraft('');
  }, [contact?.id]);

  if (!contact) {
    return (
      <div style={{ ...styles.chatPanel, ...styles.center }}>
        <div className="dim" style={{ fontSize: 11, letterSpacing: '0.1em' }}>
          SELECT A CONTACT
        </div>
      </div>
    );
  }

  const isDeleted = contact.status === 'deleted';
  const canSend = contact.status === 'online' && draft.trim().length > 0;

  function handleSend() {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft('');
  }

  return (
    <div style={styles.chatPanel}>
      {/* Header */}
      <div style={styles.chatHeader}>
        <span>[{contact.handle} | {contact.id}]</span>
        <span className="dim" style={{ marginLeft: 12 }}>
          — {contact.status.toUpperCase()}
        </span>
      </div>

      {/* Messages */}
      <div style={styles.messageList}>
        {isDeleted && messages.length === 0 && (
          <div className="dim" style={{ textAlign: 'center', marginTop: 40, fontSize: 11 }}>
            [CHAT ERASED]
          </div>
        )}
        {messages.map(m => (
          <div
            key={m.id}
            style={{
              ...styles.message,
              textAlign: m.from === 'player' ? 'right' : 'left',
            }}
          >
            <span className="dim" style={{ fontSize: 10, marginRight: m.from === 'player' ? 0 : 6, marginLeft: m.from === 'player' ? 6 : 0, order: m.from === 'player' ? 1 : -1 }}>
              {m.from === 'player' ? playerHandle : contact.handle}
            </span>
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        {isDeleted || contact.status === 'offline' ? (
          <div className="dim" style={{ fontSize: 11, padding: '6px 0', flex: 1 }}>
            [CONTACT UNREACHABLE]
          </div>
        ) : (
          <>
            <span className="dim" style={{ marginRight: 6 }}>&gt;</span>
            <input
              ref={inputRef}
              value={draft}
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="type a message..."
              style={{ flex: 1 }}
              disabled={contact.status !== 'online'}
            />
            <button
              onClick={handleSend}
              disabled={!canSend}
              style={{ marginLeft: 8 }}
            >
              SEND
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── StatusBar ───────────────────────────────────────────────────────────────

function StatusBar({
  player,
  onKill,
  isMobile,
  mobileView,
  onBack,
}: {
  player: PlayerState;
  onKill: () => void;
  isMobile: boolean;
  mobileView: 'contacts' | 'chat';
  onBack: () => void;
}) {
  if (isMobile) {
    return (
      <div style={styles.statusBar}>
        {mobileView === 'chat' ? (
          <button onClick={onBack} style={{ fontSize: 11, border: 'none', padding: '2px 0' }}>
            ← CONTACTS
          </button>
        ) : (
          <span style={{ fontSize: 11 }}>[{player.handle}]</span>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={onKill} style={{ fontSize: 11 }} title="Ctrl+K">
          [KILL SESSION]
        </button>
      </div>
    );
  }

  return (
    <div style={styles.statusBar}>
      <span>[{player.handle} | {player.id}]</span>
      <span className="dim" style={{ margin: '0 12px', fontSize: 11 }}>
        {player.contacts.length} contact{player.contacts.length !== 1 ? 's' : ''}
      </span>
      <span className="dim" style={{ fontSize: 10, flex: 1 }}>
        MESSAGES WILL BE ERASED ON EXIT
      </span>
      <button onClick={onKill} style={{ fontSize: 11 }} title="Ctrl+K">
        [KILL SESSION]
      </button>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Messages>({});
  const [activity, setActivity] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 700);
  const [mobileView, setMobileView] = useState<'contacts' | 'chat'>('contacts');

  const engineRef = useRef<TreeEngine | null>(null);
  // Track current contacts for engine callbacks (avoids stale closures)
  const contactsRef = useRef<Contact[]>([]);
  const playerRef = useRef<PlayerState | null>(null);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  // ── resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); killSession(); }
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); setShowAdd(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── engine callbacks ──────────────────────────────────────────────────────
  const handleEngineMessage = useCallback((contactId: string, text: string) => {
    const msg: Message = {
      id: msgId(),
      contactId,
      from: 'contact',
      text,
      timestamp: Date.now(),
    };
    setMessages(prev => ({
      ...prev,
      [contactId]: [...(prev[contactId] ?? []), msg],
    }));
  }, []);

  const handleStatusChange = useCallback((contactId: string, status: ContactStatus) => {
    if (status === 'deleted') {
      setMessages(prev => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
    }
    setPlayer(prev => {
      if (!prev) return prev;
      const contacts = prev.contacts.map(c =>
        c.id === contactId ? { ...c, status } : c
      );
      contactsRef.current = contacts;
      storage.savePlayerContacts(prev.id, contacts);
      return { ...prev, contacts };
    });
  }, []);

  const handleActivity = useCallback((contactId: string) => {
    setActivity(prev => {
      const next = new Set(prev);
      next.add(contactId);
      return next;
    });
  }, []);

  // ── init engine when player logs in ──────────────────────────────────────
  function initEngine(p: PlayerState) {
    const engine = new TreeEngine(TREES, {
      onSend: handleEngineMessage,
      onStatusChange: handleStatusChange,
      onActivity: handleActivity,
    });
    engine._onNodeChange = (contactId, nodeId) => {
      setPlayer(prev => {
        if (!prev) return prev;
        const contacts = prev.contacts.map(c =>
          c.id === contactId ? { ...c, currentNodeId: nodeId } : c
        );
        contactsRef.current = contacts;
        storage.savePlayerContacts(prev.id, contacts);
        return { ...prev, contacts };
      });
    };
    engineRef.current = engine;

    // Start all contacts' trees
    const world = storage.getWorld();
    for (const c of p.contacts) {
      const treeKey = world.assignments[c.id];
      if (treeKey && treeKey !== 'silence') {
        engine.initContact(c.id, treeKey, c.currentNodeId);
      }
    }
  }

  // ── login ─────────────────────────────────────────────────────────────────
  function handleLogin(p: PlayerState) {
    setPlayer(p);
    contactsRef.current = p.contacts;
    playerRef.current = p;
    initEngine(p);
    engineRef.current?.unlockAudio();
    setScreen('app');
  }

  // ── add contact ───────────────────────────────────────────────────────────
  function handleAddContact(id: string) {
    const world = storage.getWorld();
    const { world: newWorld, treeKey } = assignTree(id, world);
    storage.saveWorld(newWorld);

    // Generate handle for stranger trees, use canonical for known ones
    let handle: string;
    if (treeKey === 'tree:OC') handle = 'OC';
    else if (treeKey === 'tree:SE') handle = 'SE';
    else if (treeKey === 'tree:characterA') handle = 'CA';
    else handle = generateHandle();

    const newContact: Contact = {
      id,
      handle,
      status: 'offline',
      currentNodeId: treeKey !== 'silence' ? (TREES[treeKey]?.root ?? '') : '',
    };

    setPlayer(prev => {
      if (!prev) return prev;
      const contacts = [...prev.contacts, newContact];
      contactsRef.current = contacts;
      storage.savePlayerContacts(prev.id, contacts);
      return { ...prev, contacts };
    });

    // Start tree if not silence
    if (treeKey !== 'silence' && TREES[treeKey]) {
      engineRef.current?.initContact(id, treeKey, TREES[treeKey].root);
    }

    setShowAdd(false);
    setActiveContactId(id);
    if (isMobile) setMobileView('chat');
  }

  // ── player sends message ──────────────────────────────────────────────────
  function handlePlayerSend(text: string) {
    if (!player || !activeContactId) return;
    const contact = player.contacts.find(c => c.id === activeContactId);
    if (!contact || contact.status !== 'online') return;
    if (!text.trim()) return;

    const msg: Message = {
      id: msgId(),
      contactId: activeContactId,
      from: 'player',
      text,
      timestamp: Date.now(),
    };
    setMessages(prev => ({
      ...prev,
      [activeContactId]: [...(prev[activeContactId] ?? []), msg],
    }));

    const world = storage.getWorld();
    const treeKey = world.assignments[activeContactId];
    if (treeKey && treeKey !== 'silence') {
      engineRef.current?.receivePlayerMessage(activeContactId, treeKey, contact.currentNodeId, text);
    }
  }

  // ── select contact ────────────────────────────────────────────────────────
  function selectContact(id: string) {
    setActiveContactId(id);
    setActivity(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (isMobile) setMobileView('chat');
  }

  // ── kill session ──────────────────────────────────────────────────────────
  function killSession() {
    engineRef.current = null;
    setPlayer(null);
    setMessages({});
    setActivity(new Set());
    setActiveContactId(null);
    setScreen('login');
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (screen === 'splash') {
    return <Splash onDone={() => setScreen('login')} />;
  }

  if (screen === 'login' || !player) {
    return <Login onLogin={handleLogin} />;
  }

  const activeContact = player.contacts.find(c => c.id === activeContactId) ?? null;
  const activeMessages = activeContactId ? (messages[activeContactId] ?? []) : [];

  const showContactList = !isMobile || mobileView === 'contacts';
  const showChat = !isMobile || mobileView === 'chat';

  return (
    <div style={styles.appRoot}>
      <StatusBar
        player={player}
        onKill={killSession}
        isMobile={isMobile}
        mobileView={mobileView}
        onBack={() => setMobileView('contacts')}
      />
      <div style={styles.body}>
        {showContactList && (
          <ContactList
            contacts={player.contacts}
            activeId={activeContactId}
            activity={activity}
            onSelect={selectContact}
            onAdd={() => setShowAdd(true)}
            isMobile={isMobile}
          />
        )}
        {showChat && (
          <ChatPanel
            contact={activeContact}
            messages={activeMessages}
            playerHandle={player.handle}
            onSend={handlePlayerSend}
          />
        )}
      </div>
      {showAdd && (
        <AddContact
          playerId={player.id}
          existingIds={player.contacts.map(c => c.id)}
          onAdd={handleAddContact}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
  },
  splashText: {
    fontSize: 28,
    letterSpacing: '0.15em',
  },
  loginBox: {
    border: '1px solid var(--green)',
    padding: '32px 24px',
    minWidth: 280,
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  reconnectRow: {
    padding: '8px 12px',
    border: '1px solid var(--green-faint)',
    marginBottom: 6,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'baseline',
  },
  appRoot: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 12px',
    borderBottom: '1px solid var(--green)',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 4,
    fontSize: 12,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  contactList: {
    width: 220,
    flexShrink: 0,
    borderRight: '1px solid var(--green)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  contactListHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    borderBottom: '1px solid var(--green-faint)',
    fontSize: 11,
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  contactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderBottom: '1px solid var(--green-faint)',
  },
  chatPanel: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  chatHeader: {
    padding: '6px 14px',
    borderBottom: '1px solid var(--green)',
    flexShrink: 0,
    fontSize: 12,
    letterSpacing: '0.05em',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  message: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 14px',
    borderTop: '1px solid var(--green)',
    flexShrink: 0,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: 'var(--black)',
    border: '1px solid var(--green)',
    padding: '24px 24px',
    minWidth: 280,
    maxWidth: '90vw',
    width: 360,
  },
};
