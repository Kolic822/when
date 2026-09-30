import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const MAX_SESSIONS = 12;
const MAX_WHENS = 200;

/**
 * People who signed in with Google: which Whens are theirs, so that every device they
 * sign in on shows the same list and joins as the same person. Kept in its own file
 * next to the Whens.
 */
export class Accounts {
  #file;
  /** Google's stable id for the person -> account */
  #accounts = new Map();
  /** session token -> Google id */
  #sessions = new Map();
  #timer = null;

  constructor(file) {
    this.#file = file;
  }

  async load() {
    try {
      const list = JSON.parse(await readFile(this.#file, 'utf8'));
      for (const account of list) {
        this.#accounts.set(account.sub, account);
        for (const s of account.sessions ?? []) this.#sessions.set(s.token, account.sub);
      }
      console.log(`loaded ${this.#accounts.size} account(s)`);
    } catch {
      /* first run */
    }
  }

  /** Signs a person in on one more device and returns that device's session token. */
  signIn({ sub, email, name }) {
    const account = this.#accounts.get(sub) ?? { sub, email, name, sessions: [], whens: {} };
    account.email = email;
    account.name = name;
    const token = randomBytes(32).toString('base64url');
    account.sessions = [...account.sessions, { token, at: new Date().toISOString() }].slice(-MAX_SESSIONS);
    this.#accounts.set(sub, account);
    this.#index(account);
    this.#scheduleSave();
    return token;
  }

  signOut(token) {
    const account = this.bySession(token);
    if (!account) return;
    account.sessions = account.sessions.filter((s) => s.token !== token);
    this.#sessions.delete(token);
    this.#scheduleSave();
  }

  bySession(token) {
    const sub = token ? this.#sessions.get(token) : null;
    return sub ? (this.#accounts.get(sub) ?? null) : null;
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

  forget(account, eventId) {
    delete account.whens[eventId];
    this.#scheduleSave();
  }

  #index(account) {
    for (const [token, sub] of this.#sessions) if (sub === account.sub) this.#sessions.delete(token);
    for (const s of account.sessions) this.#sessions.set(s.token, account.sub);
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
