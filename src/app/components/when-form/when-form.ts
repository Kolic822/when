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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Auth } from '../../core/auth';
import { t } from '../../core/i18n/i18n';
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
 * The two steps that define a When: what it is, then which days and how long.
 * Used both to plan a new one and, by the organiser, to change an existing one.
 */
@Component({
  selector: 'app-when-form',
  imports: [
    FormField,
    DayPicker,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSlideToggleModule,
  ],
  templateUrl: './when-form.html',
  styleUrl: './when-form.scss',
})
export class WhenForm {
  readonly t = t;
  private readonly store = inject(PrefsStore);
  private readonly prefs = this.store.prefs();

  readonly mode = input<'create' | 'edit'>('create');
  /** What to start from when editing; read once, so live updates don't overwrite typing. */
  readonly initial = input<WhenDetails | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

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
    required(p.name);
    maxLength(p.description, 600);
  });
  readonly dates = signal<string[]>([]);

  /** 1: what (and who). 2: which days and how long. */
  readonly step = signal<1 | 2>(1);

  readonly rangeText = computed(() => rangeLabel(this.dates()));
  readonly rangeValid = computed(() => {
    const m = this.model();
    return m.dayEnd - m.dayStart >= m.durationHours * 60;
  });
  readonly stepOneValid = computed(() => this.form().valid());
  readonly valid = computed(
    () => this.stepOneValid() && this.dates().length > 0 && this.rangeValid() && !this.busy(),
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

  /** Enter on the first step moves on; on the second it finishes. */
  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.step() === 1) {
      if (this.stepOneValid()) this.step.set(2);
      return;
    }
    this.save();
  }

  save(): void {
    if (!this.valid()) return;
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
