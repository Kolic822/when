import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Auth } from '../../core/auth';
import { listOf, t, tn } from '../../core/i18n/i18n';
import { Participant } from '../../core/models';
import { PrefsStore } from '../../core/prefs';
import { HOUR_OPTIONS, rangeLabel } from '../../core/time';
import { eventZone, viewerZone, zoneCity } from '../../core/zone';
import { DayPicker } from '../day-picker/day-picker';
import { DURATIONS } from '../../pages/home/durations';

/** Everything that defines a When. */
export interface WhenDetails {
  title: string;
  description: string;
  /** The organiser's own name; only asked when creating. */
  name: string;
  dates: string[];
  durationHours: number;
  dayStart: number;
  dayEnd: number;
  partialOk: boolean;
}

interface Model {
  title: string;
  description: string;
  name: string;
  durationHours: number;
  dayStart: number;
  dayEnd: number;
  partialOk: boolean;
}

/**
 * What defines a When, on one page: what it is, which days and how long. Used to plan
 * a new one and, by the organiser, to change an existing one.
 */
@Component({
  selector: 'app-when-form',
  imports: [FormField, DayPicker, MatButtonModule, MatIconModule, MatSlideToggleModule],
  templateUrl: './when-form.html',
  styleUrl: './when-form.scss',
})
export class WhenForm {
  readonly t = t;
  readonly tn = tn;
  private readonly store = inject(PrefsStore);
  private readonly prefs = this.store.prefs();

  readonly mode = input<'create' | 'edit'>('create');
  /** What to start from when editing; read once, so live updates don't overwrite typing. */
  readonly initial = input<WhenDetails | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  /** Editing: who is in the When, so the organiser can take people out. */
  readonly people = input<Participant[]>([]);
  readonly meId = input<string | null>(null);
  /** The people marked for removal, sent out when the form is saved. */
  readonly removePeople = output<Participant[]>();
  /** Ticked chips, waiting for the Remove button. */
  readonly selected = signal<ReadonlySet<string>>(new Set());
  /** Marked for removal; it only happens on Save, so Cancel undoes it. */
  readonly doomed = signal<ReadonlySet<string>>(new Set());
  readonly askRemove = signal(false);
  readonly selectedNames = computed(() =>
    listOf(
      this.people()
        .filter((p) => this.selected().has(p.id))
        .map((p) => p.name),
    ),
  );

  toggleSelect(p: Participant): void {
    this.selected.update((set) => {
      const next = new Set(set);
      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
      return next;
    });
  }

  stageRemoval(): void {
    this.doomed.update((set) => new Set([...set, ...this.selected()]));
    this.selected.set(new Set());
    this.askRemove.set(false);
  }

  keep(p: Participant): void {
    this.doomed.update((set) => {
      const next = new Set(set);
      next.delete(p.id);
      return next;
    });
  }

  readonly submitted = output<WhenDetails>();
  readonly cancelled = output<void>();

  readonly durations = DURATIONS;
  readonly startOptions = HOUR_OPTIONS.slice(0, 24);
  readonly endOptions = HOUR_OPTIONS.slice(1);
  readonly features = computed(() => this.store.prefs().features);
  readonly editing = computed(() => this.mode() === 'edit');

  readonly model = signal<Model>({
    title: '',
    description: '',
    name: inject(Auth).name(),
    durationHours: this.prefs.durationHours,
    dayStart: this.prefs.dayStart,
    dayEnd: this.prefs.dayEnd,
    partialOk: false,
  });
  readonly form = form(this.model, (p) => {
    required(p.title);
    maxLength(p.title, 80);
    required(p.name);
    maxLength(p.description, 600);
  });
  readonly dates = signal<string[]>([]);

  readonly rangeText = computed(() => rangeLabel(this.dates()));
  readonly rangeValid = computed(() => {
    const m = this.model();
    return m.dayEnd - m.dayStart >= m.durationHours * 60;
  });
  readonly valid = computed(
    () => this.form().valid() && this.dates().length > 0 && this.rangeValid() && !this.busy(),
  );

  /** Hours are in the When's zone: the organiser's own when creating. */
  readonly zoneName = computed(() =>
    zoneCity((this.editing() ? eventZone() : null) ?? viewerZone()),
  );

  constructor() {
    let loaded = false;
    effect(() => {
      const start = this.initial();
      if (!start || loaded) return;
      loaded = true;
      untracked(() => {
        const { dates, ...rest } = start;
        // The organiser's name is not part of editing; any value satisfies the form.
        this.model.set({ ...rest, name: rest.name || '-' });
        this.dates.set([...dates]);
      });
    });
  }

  /** Native selects hand back text; the model keeps numbers. */
  setNumber(key: 'durationHours' | 'dayStart' | 'dayEnd', event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    this.model.update((m) => ({ ...m, [key]: value }));
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.save();
  }

  save(): void {
    if (!this.valid()) return;
    const gone = this.people().filter((p) => this.doomed().has(p.id));
    if (gone.length) this.removePeople.emit(gone);
    const m = this.model();
    this.submitted.emit({
      title: m.title.trim(),
      description: m.description.trim(),
      name: m.name.trim(),
      dates: this.dates(),
      durationHours: m.durationHours,
      dayStart: m.dayStart,
      dayEnd: m.dayEnd,
      partialOk: m.partialOk,
    });
  }
}
