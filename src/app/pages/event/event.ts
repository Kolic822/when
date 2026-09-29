import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EventSession } from '../../core/event-session';
import { Identity } from '../../core/identity';
import { findCommonWindows } from '../../core/availability';
import {
  HOUR_OPTIONS,
  formatDuration,
  formatMinutes,
  rangeLabel,
  shortDate,
} from '../../core/time';
import { Session, Slot } from '../../core/models';
import { NamePrompt } from '../../components/name-prompt/name-prompt';
import { ShareLink } from '../../components/share-link/share-link';
import { WeekChart } from '../../components/week-chart/week-chart';
import { Legend } from '../../components/legend/legend';
import { Results } from '../../components/results/results';
import { DayPicker } from '../../components/day-picker/day-picker';
import { AppMenu } from '../../components/app-menu/app-menu';
import { AnswerCard, latestVerdict } from '../../components/answer-card/answer-card';
import { Booked } from '../../components/booked/booked';
import { History } from '../../components/history/history';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { PrefsStore } from '../../core/prefs';
import { DayStepper } from '../../components/day-stepper/day-stepper';
import { DURATIONS } from '../home/durations';

@Component({
  selector: 'app-event',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    NamePrompt,
    ShareLink,
    WeekChart,
    Legend,
    Results,
    DayPicker,
    AppMenu,
    DayStepper,
    Booked,
    AnswerCard,
    History,
    MatSlideToggleModule,
  ],
  templateUrl: './event.html',
  styleUrl: './event.scss',
})
export class EventPage implements OnDestroy {
  /** Route param, bound via withComponentInputBinding(). */
  readonly id = input.required<string>();

  readonly session = inject(EventSession);
  private readonly identity = inject(Identity);
  private readonly snack = inject(MatSnackBar);

  readonly event = this.session.event;
  readonly me = this.session.me;
  readonly meId = this.session.meId;
  readonly status = this.session.status;

  /** Pro features switched on in the menu (preview). */
  private readonly prefsStore = inject(PrefsStore);
  readonly features = computed(() => this.prefsStore.prefs().features);

  readonly resultsCard = viewChild<Results>('results');

  /** What came back from an "Ask someone" link, marked in the calendar for the organiser. */
  readonly answered = computed(() => {
    const ev = this.event();
    if (!ev || ev.booked || !this.isCreator()) return null;
    const v = latestVerdict(ev.shortlists ?? [], ev.durationHours * 60);
    const s = v?.window ?? v?.session;
    return v && s ? { ...s, label: v.names } : null;
  });

  readonly editingDay = signal<string | null>(null);
  /** Legend highlight: sticky (clicked) and transient (hovered). */
  readonly selectedId = signal<string | null>(null);
  readonly hoveredId = signal<string | null>(null);
  readonly highlightId = computed(() => this.hoveredId() ?? this.selectedId());
  /** First visit: walk through the days one by one. */
  readonly stepping = signal(false);
  private stepperOffered = false;
  private lastRenameRequest = '';
  readonly renaming = signal(false);
  readonly settingsOpen = signal(false);
  readonly draftDates = signal<string[]>([]);
  readonly draftDuration = signal(3);
  readonly draftTitle = signal('');
  readonly draftDescription = signal('');
  readonly draftDayStart = signal(8 * 60);
  readonly draftDayEnd = signal(23 * 60);
  readonly draftPartialOk = signal(false);
  readonly durations = DURATIONS;
  readonly startOptions = HOUR_OPTIONS.slice(0, 24);
  readonly endOptions = HOUR_OPTIONS.slice(1);
  readonly draftValid = computed(
    () =>
      this.draftDates().length > 0 &&
      this.draftDayEnd() - this.draftDayStart() >= this.draftDuration() * 60,
  );

  readonly isCreator = computed(() => !!this.identity.creatorToken(this.id()));
  readonly shareUrl = computed(() => `${location.origin}/e/${this.id()}`);
  readonly rangeText = computed(() => (this.event() ? rangeLabel(this.event()!.dates) : ''));
  readonly hasAnySlots = computed(() => (this.me()?.slots.length ?? 0) > 0);
  readonly durationText = computed(() =>
    this.event() ? formatDuration(this.event()!.durationHours * 60) : '',
  );
  readonly hoursText = computed(() => {
    const ev = this.event();
    return ev ? `${formatMinutes(ev.dayStart)} – ${formatMinutes(ev.dayEnd)}` : '';
  });
  readonly availability = computed(() => {
    const ev = this.event();
    return ev ? findCommonWindows(ev) : { windows: [], answered: [], pending: [] };
  });

  constructor() {
    effect(() => this.session.connect(this.id()));
    // Offer the day stepper once, to people who have not marked anything yet.
    effect(() => {
      const me = this.me();
      if (!me || this.stepperOffered) return;
      this.stepperOffered = true;
      if (me.slots.length === 0 && !this.identity.stepperDone(this.id())) this.stepping.set(true);
    });
    // Close the rename prompt once the new name has arrived (it stays open on a "name taken" error).
    effect(() => {
      const me = this.me();
      if (
        this.renaming() &&
        me &&
        this.session.nameError() === null &&
        me.name === this.lastRenameRequest
      ) {
        this.renaming.set(false);
      }
    });
    // If the organiser removes the day being edited, go back to the overview.
    effect(() => {
      const day = this.editingDay();
      const ev = this.event();
      if (day && ev && !ev.dates.includes(day)) this.editingDay.set(null);
    });
  }

  ngOnDestroy(): void {
    this.session.disconnect();
  }

  join(name: string): void {
    this.session.join(name);
  }

  rename(name: string): void {
    this.lastRenameRequest = name.trim();
    this.session.rename(name);
  }

  onSlotsChange(slots: Slot[]): void {
    this.session.setSlots(slots);
  }

  /** Organiser settles on a session (or undoes it with null). */
  onBook(session: Session | null): void {
    const ok = this.session.updateEvent({ booked: session });
    if (!ok)
      this.snack.open('Only the organiser can book a session', undefined, { duration: 3000 });
    else if (session) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** From the answer card: open that session so the organiser can choose the start. */
  onChooseTime(session: Session): void {
    const opened = this.resultsCard()?.openFor(session.date, session.start);
    if (!opened) {
      this.snack.open('That session is no longer possible for everyone', undefined, {
        duration: 3500,
      });
    }
  }

  onAllDay(date: string, on: boolean): void {
    this.session.setAllDay(date, on);
  }

  onStepNotFree(date: string): void {
    this.session.clearDay(date);
  }

  /** Stepper quick action: apply, then confirm with an Undo toast since the view moves on by itself. */
  /** Stepper quick action, applied silently. */
  onStepQuick(kind: 'free', date: string): void {
    if (kind === 'free') this.session.setAllDay(date, true);
  }

  onCopySlotTo(e: { slot: Slot; to: string[] }): void {
    this.session.copySlot(e.slot, e.to);
    if (this.inDayView()) return;
    this.snack.open(
      `Copied to ${e.to.length} ${e.to.length === 1 ? 'day' : 'days'}`,
      undefined,
      this.toastOpts(2500),
    );
  }

  onCopyTo(e: { from: string; to: string[] }): void {
    this.session.copyDay(e.from, e.to);
    if (this.inDayView()) return;
    this.snack.open(
      `Copied to ${e.to.length} ${e.to.length === 1 ? 'day' : 'days'}`,
      undefined,
      this.toastOpts(2500),
    );
  }

  finishStepper(): void {
    this.identity.setStepperDone(this.id());
    this.stepping.set(false);
    if (this.hasAnySlots()) this.snack.open("You're in. Nice one!", undefined, { duration: 3000 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Snackbar options: lifted above the sticky bar while an editor or the stepper is open. */
  /** True while a day view is open; toasts are suppressed there. */
  private inDayView(): boolean {
    return this.stepping() || !!this.editingDay();
  }

  private toastOpts(duration: number) {
    return { duration };
  }

  onClearDay(date: string): void {
    const before = this.me()?.slots ?? [];
    const removed = this.session.clearDay(date);
    if (!removed.length) return;
    if (this.inDayView()) return;
    this.snack
      .open(`Cleared ${shortDate(date)}`, 'Undo', this.toastOpts(4000))
      .onAction()
      .subscribe(() => this.session.setSlots(before));
  }

  openSettings(): void {
    const ev = this.event();
    if (!ev) return;
    this.draftDates.set([...ev.dates]);
    this.draftTitle.set(ev.title);
    this.draftDescription.set(ev.description ?? '');
    this.draftDuration.set(ev.durationHours);
    this.draftDayStart.set(ev.dayStart);
    this.draftDayEnd.set(ev.dayEnd);
    this.draftPartialOk.set(ev.partialOk);
    this.settingsOpen.set(true);
  }

  saveSettings(): void {
    if (!this.draftValid()) return;
    const ok = this.session.updateEvent({
      title: this.draftTitle().trim() || undefined,
      description: this.draftDescription().trim(),
      dates: this.draftDates(),
      durationHours: this.draftDuration(),
      dayStart: this.draftDayStart(),
      dayEnd: this.draftDayEnd(),
      partialOk: this.draftPartialOk(),
    });
    if (!ok)
      this.snack.open('Only the organiser can change the days', undefined, { duration: 3000 });
    this.settingsOpen.set(false);
  }
}
