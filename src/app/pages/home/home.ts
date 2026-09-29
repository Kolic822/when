import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { EventApi } from '../../core/event-api';
import { Identity } from '../../core/identity';
import { PrefsStore } from '../../core/prefs';
import { AppMenu } from '../../components/app-menu/app-menu';
import { DURATIONS } from './durations';
import { HOUR_OPTIONS, rangeLabel } from '../../core/time';
import { DayPicker } from '../../components/day-picker/day-picker';

interface CreateModel {
  title: string;
  description: string;
  name: string;
  durationHours: number;
  dayStart: number;
  dayEnd: number;
  partialOk: boolean;
}

export { DURATIONS } from './durations';

@Component({
  selector: 'app-home',
  imports: [
    FormField,
    DayPicker,
    AppMenu,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSlideToggleModule,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly api = inject(EventApi);
  private readonly identity = inject(Identity);
  private readonly router = inject(Router);

  readonly durations = DURATIONS;
  readonly startOptions = HOUR_OPTIONS.slice(0, 24);
  readonly endOptions = HOUR_OPTIONS.slice(1);

  private readonly store = inject(PrefsStore);
  private readonly prefs = this.store.prefs();
  readonly features = computed(() => this.store.prefs().features);
  readonly model = signal<CreateModel>({
    title: '',
    description: '',
    name: '',
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
  readonly rangeText = computed(() => rangeLabel(this.dates()));
  readonly rangeValid = computed(() => {
    const m = this.model();
    return m.dayEnd - m.dayStart >= m.durationHours * 60;
  });
  readonly canCreate = computed(
    () => this.form().valid() && this.dates().length > 0 && this.rangeValid() && !this.busy(),
  );

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async create(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canCreate()) return;
    this.busy.set(true);
    this.error.set(null);
    const m = this.model();
    try {
      const { event: created, creatorToken } = await this.api.create({
        title: m.title.trim(),
        description: m.description.trim(),
        dates: this.dates(),
        durationHours: m.durationHours,
        dayStart: m.dayStart,
        dayEnd: m.dayEnd,
        partialOk: m.partialOk,
      });
      this.identity.setCreatorToken(created.id, creatorToken);
      this.identity.setPendingName(created.id, m.name.trim());
      await this.router.navigate(['/e', created.id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Something went wrong');
      this.busy.set(false);
    }
  }
}
