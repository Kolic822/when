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
import { AppMenu } from '../../components/app-menu/app-menu';
import { AnswerCard, latestVerdict } from '../../components/answer-card/answer-card';
import { Booked } from '../../components/booked/booked';
import { WhenDetails, WhenForm } from '../../components/when-form/when-form';
import { ZoneNote } from '../../components/zone-note/zone-note';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { PrefsStore } from '../../core/prefs';
import { Push } from '../../core/push';
import { HowToState } from '../../core/how-to-state';
import { CalendarLink } from '../../core/calendar-link';
import { mergeSlots } from '../../core/availability';
import { DayStepper } from '../../components/day-stepper/day-stepper';
import { DURATIONS } from '../home/durations';
import { t, tn } from '../../core/i18n/i18n';

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
    AppMenu,
    DayStepper,
    Booked,
    WhenForm,
    ZoneNote,
    AnswerCard,
    MatSlideToggleModule,
  ],
  templateUrl: './event.html',
  styleUrl: './event.scss',
})
export class EventPage implements OnDestroy {
  readonly t = t;
  readonly tn = tn;
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
  private readonly push = inject(Push);
  private readonly howTo = inject(HowToState);
  readonly calendar = inject(CalendarLink);
  /** Pro, Google is set up, and the calendar is not connected (or the hour is up). */
  readonly showCalendarPrompt = computed(
    () =>
      this.features().connect &&
      !!this.meId() &&
      this.calendar.available() &&
      !this.calendar.connected(),
  );
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
  /** The When as it was when the organiser opened the editor. */
  readonly editSnapshot = signal<WhenDetails | null>(null);

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
    // Connect calendar: fetch my busy times for these days once connected.
    effect(() => {
      const ev = this.event();
      if (!ev || !this.features().connect || !this.calendar.connected()) return;
      void this.calendar.load(ev.dates, ev.timeZone ?? null);
    });

    // Notifications are per device; each When still has to be registered once.
    effect(() => {
      const id = this.id();
      if (this.meId() || this.isCreator()) void this.push.register(id);
    });

    effect(() => this.session.connect(this.id()));
    // Offer the day stepper once, to people who have not marked anything yet.
    effect(() => {
      const me = this.me();
      if (!me || this.stepperOffered) return;
      this.stepperOffered = true;
      // New here: explain the calendar first. Skipping it is one tap.
      this.howTo.offer();
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

  readonly bookings = computed<Session[]>(() => {
    const ev = this.event();
    return ev?.bookings ?? (ev?.booked ? [ev.booked] : []);
  });
  readonly notifyOn = computed(() => this.push.state() === 'on');

  /** Organiser settles on a session; with the Pro option it is added to what is already booked. */
  onBook(session: Session): void {
    // One per day: booking a day again replaces what that day had.
    const keep = this.features().multiBook
      ? this.bookings().filter((b) => b.date !== session.date)
      : [];
    const ok = this.session.updateEvent({ bookings: [...keep, session] });
    if (!ok)
      this.snack.open(t('Only the organiser can book a session'), undefined, { duration: 3000 });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onUnbook(session: Session): void {
    this.session.updateEvent({
      bookings: this.bookings().filter((b) => b.date !== session.date || b.start !== session.start),
    });
  }

  /** From the answer card: open that session so the organiser can choose the start. */
  onChooseTime(session: Session): void {
    const opened = this.resultsCard()?.openFor(session.date, session.start);
    if (!opened) {
      this.snack.open(t('That session is no longer possible for everyone'), undefined, {
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
      tn(e.to.length, 'Copied to {n} day', 'Copied to {n} days'),
      undefined,
      this.toastOpts(2500),
    );
  }

  onCopyTo(e: { from: string; to: string[] }): void {
    this.session.copyDay(e.from, e.to);
    if (this.inDayView()) return;
    this.snack.open(
      tn(e.to.length, 'Copied to {n} day', 'Copied to {n} days'),
      undefined,
      this.toastOpts(2500),
    );
  }

  finishStepper(): void {
    this.identity.setStepperDone(this.id());
    this.stepping.set(false);
    if (this.hasAnySlots())
      this.snack.open(t('You’re in. Nice one!'), undefined, { duration: 3000 });
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
      .open(t('Cleared {day}', { day: shortDate(date) }), t('Undo'), this.toastOpts(4000))
      .onAction()
      .subscribe(() => this.session.setSlots(before));
  }

  openSettings(): void {
    const ev = this.event();
    if (!ev) return;
    this.editSnapshot.set({
      title: ev.title,
      description: ev.description ?? '',
      name: '',
      dates: [...ev.dates],
      durationHours: ev.durationHours,
      dayStart: ev.dayStart,
      dayEnd: ev.dayEnd,
      partialOk: ev.partialOk,
    });
    this.settingsOpen.set(true);
    window.scrollTo({ top: 0 });
  }

  saveSettings(details: WhenDetails): void {
    const { name: _name, ...patch } = details;
    const ok = this.session.updateEvent(patch);
    if (!ok)
      this.snack.open(t('Only the organiser can change the days'), undefined, { duration: 3000 });
    this.settingsOpen.set(false);
  }
}
