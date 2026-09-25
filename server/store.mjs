import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Tiny JSON-file backed event store with debounced writes. */
export class Store {
  #file;
  #events = new Map();
  #timer = null;

  constructor(file) {
    this.#file = file;
  }

  async load() {
    try {
      const raw = await readFile(this.#file, 'utf8');
      const list = JSON.parse(raw);
      for (const ev of list) this.#events.set(ev.id, ev);
      console.log(`loaded ${this.#events.size} event(s) from ${path.basename(this.#file)}`);
    } catch {
      /* first run */
    }
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

  #scheduleSave() {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#save().catch((err) => console.error('save failed', err));
    }, 300);
  }

  async #save() {
    await mkdir(path.dirname(this.#file), { recursive: true });
    await writeFile(this.#file, JSON.stringify([...this.#events.values()]), 'utf8');
  }
}
