import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KEEP_BACKUPS = 14;

/**
 * Tiny JSON-file backed event store with debounced, atomic writes and a daily
 * snapshot next to the file (`backups/events-YYYY-MM-DD.json`, two weeks kept).
 */
export class Store {
  #file;
  #events = new Map();
  #timer = null;

  constructor(file) {
    this.#file = file;
  }

  get backupDir() {
    return path.join(path.dirname(this.#file), 'backups');
  }

  async load() {
    const sources = [this.#file, ...(await this.#backups())];
    for (const file of sources) {
      try {
        const list = JSON.parse(await readFile(file, 'utf8'));
        for (const ev of list) this.#events.set(ev.id, ev);
        const note = file === this.#file ? '' : ' (recovered from a backup)';
        console.log(`loaded ${this.#events.size} event(s) from ${path.basename(file)}${note}`);
        return;
      } catch (err) {
        if (err?.code !== 'ENOENT') console.warn(`could not read ${path.basename(file)}:`, err.message);
      }
    }
    /* first run */
  }

  all() {
    return [...this.#events.values()];
  }

  get(id) {
    return this.#events.get(id) ?? null;
  }

  set(ev) {
    this.#events.set(ev.id, ev);
    this.#scheduleSave();
  }

  delete(id) {
    this.#events.delete(id);
    this.#scheduleSave();
  }

  /** Writes today's snapshot if there isn't one yet, and drops the oldest beyond the limit. */
  async backup() {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(this.backupDir, `events-${today}.json`);
    const existing = await this.#backups();
    if (existing.includes(file)) return;
    await mkdir(this.backupDir, { recursive: true });
    await writeFile(file, JSON.stringify(this.all()), 'utf8');
    for (const old of existing.slice(KEEP_BACKUPS - 1)) await rm(old, { force: true });
    console.log(`backup written: ${path.basename(file)}`);
  }

  /** Newest first. */
  async #backups() {
    try {
      const names = (await readdir(this.backupDir)).filter((n) => /^events-\d{4}-\d{2}-\d{2}\.json$/.test(n));
      return names.sort().reverse().map((n) => path.join(this.backupDir, n));
    } catch {
      return [];
    }
  }

  #scheduleSave() {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#save().catch((err) => console.error('save failed', err));
    }, 300);
  }

  /** Written to a temporary file first, so a crash mid-write never leaves a half file behind. */
  async #save() {
    await mkdir(path.dirname(this.#file), { recursive: true });
    const tmp = `${this.#file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.all()), 'utf8');
    await rename(tmp, this.#file);
  }
}
