import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';

const scrypt = promisify(scryptCallback);
const MAX_SESSIONS = 12;
const MAX_WHENS = 200;

/**
 * People with an account, either through Google or with an email and password:
 * which Whens are theirs, so that every device they sign in on shows the same list
 * and joins as the same person. Kept in its own file next to the Whens.
 *
 * Passwords are never stored, only a salted scrypt hash of them.
 */
export class Accounts {
  #file;
  /** account id -> account. Ids look like "g:<google id>" or "e:<random>". */
  #accounts = new Map();
  /** session token -> account id */
  #sessions = new Map();
  #timer = null;

  constructor(file) {
    this.#file = file;
  }

  async load() {
    try {
      const list = JSON.parse(await readFile(this.#file, 'utf8'));
      for (const account of list) {
        // Accounts from before email sign-in were keyed by Google's id alone.
        account.id ??= `g:${account.sub}`;
        this.#accounts.set(account.id, account);
        for (const s of account.sessions ?? []) this.#sessions.set(s.token, account.id);
      }
      console.log(`loaded ${this.#accounts.size} account(s)`);
    } catch {
      /* first run */
    }
  }

  /** Signs a Google user in on one more device and returns that device's session token. */
  signIn({ sub, email, name }) {
    const id = `g:${sub}`;
    const account = this.#accounts.get(id) ?? { id, sub, email, name, sessions: [], whens: {} };
    account.email = email;
    account.name = name;
    this.#accounts.set(id, account);
    return this.#newSession(account);
  }

  /**
   * Creates an account with an email and password.
   * Returns `{ error }` when the email or username is taken, else `{ account, session }`.
   */
  async register({ email, username, password }) {
    if (this.#byEmail(email)) return { error: 'email_taken' };
    if (this.#byUsername(username)) return { error: 'username_taken' };
    const account = {
      id: `e:${randomBytes(12).toString('base64url')}`,
      email,
      name: username,
      password: await hashPassword(password),
      sessions: [],
      whens: {},
      createdAt: new Date().toISOString(),
    };
    this.#accounts.set(account.id, account);
    return { account, session: this.#newSession(account) };
  }

  /** Checks an email (or username) and password. Returns null when they don't match. */
  async logIn(login, password) {
    const account = this.#byEmail(login) ?? this.#byUsername(login);
    // Hash even when there is no such account, so the answer takes equally long either way.
    const ok = await verifyPassword(password, account?.password ?? DUMMY_HASH);
    if (!account || !ok) return null;
    return { account, session: this.#newSession(account) };
  }

  signOut(token) {
    const account = this.bySession(token);
    if (!account) return;
    account.sessions = account.sessions.filter((s) => s.token !== token);
    this.#sessions.delete(token);
    this.#scheduleSave();
  }

  bySession(token) {
    const id = token ? this.#sessions.get(token) : null;
    return id ? (this.#accounts.get(id) ?? null) : null;
  }

  /** Remembers a When for the account. What is already known is kept; new details are added. */
  remember(account, eventId, { participantId, name, creatorToken }) {
    const known = account.whens[eventId] ?? {};
    if (!known.participantId && Object.keys(account.whens).length >= MAX_WHENS) return known;
    account.whens[eventId] = {
      participantId: known.participantId ?? participantId ?? null,
      name: known.participantId ? known.name : (name ?? known.name ?? ''),
      creatorToken: known.creatorToken ?? creatorToken ?? null,
      at: new Date().toISOString(),
    };
    this.#scheduleSave();
    return account.whens[eventId];
  }

  /** The calendar links the person added, so that every device they sign in on shows them. */
  setCalendars(account, links) {
    account.calendars = links;
    this.#scheduleSave();
  }

  forget(account, eventId) {
    delete account.whens[eventId];
    this.#scheduleSave();
  }

  /** Email accounts only: Google accounts are told apart by Google's id, not their address. */
  #byEmail(email) {
    const wanted = String(email ?? '').trim().toLowerCase();
    if (!wanted) return null;
    for (const a of this.#accounts.values()) {
      if (a.password && a.email === wanted) return a;
    }
    return null;
  }

  #byUsername(username) {
    const wanted = String(username ?? '').trim().toLowerCase();
    if (!wanted) return null;
    for (const a of this.#accounts.values()) {
      if (a.password && a.name.toLowerCase() === wanted) return a;
    }
    return null;
  }

  #newSession(account) {
    const token = randomBytes(32).toString('base64url');
    const dropped = account.sessions.slice(0, Math.max(0, account.sessions.length + 1 - MAX_SESSIONS));
    for (const s of dropped) this.#sessions.delete(s.token);
    account.sessions = [...account.sessions, { token, at: new Date().toISOString() }].slice(-MAX_SESSIONS);
    this.#sessions.set(token, account.id);
    this.#scheduleSave();
    return token;
  }

  #scheduleSave() {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#save().catch((err) => console.error('accounts save failed', err));
    }, 300);
  }

  async #save() {
    await mkdir(path.dirname(this.#file), { recursive: true });
    const tmp = `${this.#file}.tmp`;
    await writeFile(tmp, JSON.stringify([...this.#accounts.values()]), { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, this.#file);
  }
}

// ---- Passwords: scrypt with a random salt per password. Format: scrypt$<salt>$<hash>.
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(String(password), Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

const DUMMY_HASH = `scrypt$${randomBytes(16).toString('base64url')}$${randomBytes(KEY_LENGTH).toString('base64url')}`;
