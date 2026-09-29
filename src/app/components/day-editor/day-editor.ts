import {
  afterNextRender,
  effect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MeetEvent, Slot } from '../../core/models';
import { mergeSlots } from '../../core/availability';
import { sampleBusy } from '../../core/busy';
import { PrefsStore } from '../../core/prefs';
import { dayMonth, formatDuration, formatMinutes, weekdayLong } from '../../core/time';
import { CopyDays } from '../copy-days/copy-days';

interface Interval {
  start: number;
  end: number;
  note?: string;
}

const SNAP = 15;
/** Grab zone at the top/bottom of a block that resizes instead of moving. */
const EDGE_PX = 14;
const LONG_PRESS_MS = 350;
/** Touch: hold this long on empty space before a new period starts. */
const CREATE_HOLD_MS = 600;
/** The "keep holding" hint appears after this much of the hold, so scroll swipes never show it. */
const HOLD_HINT_DELAY_MS = 200;
const MOVE_TOLERANCE_PX = 8;

/**
 * Single-day bar where the current user drags out the periods they are free.
 * Tap a block to remove it. Every change is emitted immediately so the rest of
 * the group sees it live.
 */
@Component({
  selector: 'app-day-editor',
  host: { '[class.step]': "mode() === 'step'" },
  imports: [MatButtonModule, MatIconModule, CopyDays],
  templateUrl: './day-editor.html',
  styleUrl: './day-editor.scss',
})
export class DayEditor {
  private readonly prefs = inject(PrefsStore);
  /** Own calendar events behind the bar (Connect calendar preview, sample data). */
  readonly busy = computed(() => {
    if (!this.prefs.prefs().features.connect) return [];
    const { dayStart, dayEnd } = this.event();
    return sampleBusy(this.date(), dayStart, dayEnd).map((b) => ({
      ...b,
      label: `${b.title} · ${formatMinutes(b.start)} – ${formatMinutes(b.end)}`,
    }));
  });

  readonly event = input.required<MeetEvent>();
  readonly meId = input.required<string>();
  readonly date = input.required<string>();
  /** 'step' embeds the editor in the day stepper: no header, no Done bar. */
  readonly mode = input<'full' | 'step'>('full');
  readonly slotsChange = output<Slot[]>();
  readonly allDayToggled = output<boolean>();
  readonly dayCleared = output<void>();
  readonly closed = output<void>();
  readonly copyTo = output<{ from: string; to: string[] }>();
  /** Copy one period to other days. */
  readonly copySlotTo = output<{ slot: Slot; to: string[] }>();
  /** Step mode: the parent shows the day picker for this period in its side column. */
  readonly copySlotRequested = output<Slot>();

  /** Index of the block whose "copy to days" picker is open. */
  readonly copySlotIndex = signal<number | null>(null);

  copySlotLabel(): string {
    const i = this.copySlotIndex();
    const s = i === null ? null : this.mine()[i];
    return s ? this.label(s) : '';
  }

  applyCopySlot(to: string[]): void {
    const i = this.copySlotIndex();
    const s = i === null ? null : this.mine()[i];
    this.copySlotIndex.set(null);
    if (!s) return;
    const slot: Slot = s.note
      ? { date: this.date(), start: s.start, end: s.end, note: s.note }
      : { date: this.date(), start: s.start, end: s.end };
    this.copySlotTo.emit({ slot, to });
  }
  /** Asks the parent to open another day (previous/next arrows). */
  readonly dayChange = output<string>();

  readonly dayIndex = computed(() => this.event().dates.indexOf(this.date()));
  readonly prevDate = computed(() => this.event().dates[this.dayIndex() - 1] ?? null);
  readonly nextDate = computed(() => this.event().dates[this.dayIndex() + 1] ?? null);

  goTo(date: string | null): void {
    if (!date) return;
    this.reset();
    this.noteEditing.set(null);
    this.dayChange.emit(date);
  }

  private readonly snack = inject(MatSnackBar);
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  private readonly noteInput = viewChild.required<ElementRef<HTMLInputElement>>('noteInput');

  readonly range = computed(() => {
    const { dayStart, dayEnd } = this.event();
    return { start: dayStart, end: dayEnd, hours: (dayEnd - dayStart) / 60 };
  });

  readonly hours = computed(() => {
    const { start, end } = this.range();
    const out: { min: number; label: string; top: number; minor: boolean }[] = [];
    for (let m = start; m <= end; m += 60) {
      out.push({
        min: m,
        label: formatMinutes(m),
        top: this.pct(m),
        minor: (m / 60) % 3 !== 0 && m !== start && m !== end,
      });
    }
    if (out[out.length - 1].min !== end)
      out.push({ min: end, label: formatMinutes(end), top: 100, minor: false });
    return out;
  });

  /** Shortest period allowed: the meetup length (capped by the day range). */
  readonly minLen = computed(() => {
    const { start, end } = this.range();
    if (this.event().partialOk) return SNAP;
    return Math.min(Math.round(this.event().durationHours * 60), end - start);
  });
  readonly strict = computed(() => !this.event().partialOk);
  readonly minLabel = computed(() => formatDuration(this.minLen()));

  readonly title = computed(() => weekdayLong(this.date()));
  readonly subtitle = computed(() => dayMonth(this.date()));

  readonly me = computed(() => this.event().participants.find((p) => p.id === this.meId()));
  readonly color = computed(() => this.me()?.color ?? '#6366F1');
  readonly others = computed(() => this.event().participants.filter((p) => p.id !== this.meId()));

  /** My slots on this day. */
  readonly mine = computed<Interval[]>(() =>
    (this.me()?.slots ?? [])
      .filter((s) => s.date === this.date())
      .map(({ start, end, note }) => (note ? { start, end, note } : { start, end })),
  );

  /** Index of the block whose note is being edited. */
  readonly noteEditing = signal<number | null>(null);
  readonly noteDraft = signal('');

  readonly allDay = computed(() => {
    const m = this.mine();
    const { start, end } = this.range();
    return m.length === 1 && m[0].start <= start && m[0].end >= end;
  });

  /** Live preview of the block being created, resized or moved. `index` hides the original while editing. */
  readonly drag = signal<(Interval & { index?: number }) | null>(null);
  /** True while a long-press has turned into a move, for styling. */
  readonly moving = signal(false);

  private gesture:
    | { kind: 'create'; origin: number; last: number; held?: boolean }
    | {
        kind: 'pending-create';
        origin: number;
        startY: number;
        timer: ReturnType<typeof setTimeout>;
        hintTimer: ReturnType<typeof setTimeout>;
      }
    | { kind: 'resize'; index: number; fixed: number; last: number }
    | { kind: 'pending-move'; index: number; startY: number; timer: ReturnType<typeof setTimeout> }
    | { kind: 'move'; index: number; grab: number; length: number }
    | null = null;

  /** True for a moment after "free all day" flips, so blocks glide to their new size. */
  readonly morphing = signal(false);
  private morphTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAllDay: boolean | null = null;
  private lastDate: string | null = null;

  private readonly watchAllDay = effect(() => {
    const now = this.allDay();
    const date = this.date();
    const changed = this.lastAllDay !== null && this.lastDate === date && this.lastAllDay !== now;
    this.lastAllDay = now;
    this.lastDate = date;
    if (!changed) return;
    this.morphing.set(true);
    if (this.morphTimer) clearTimeout(this.morphTimer);
    this.morphTimer = setTimeout(() => this.morphing.set(false), 500);
  });

  /** Touch screens: hold to add so a plain swipe scrolls the page. */
  readonly coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  /** True while a touch is being held on empty space, before the hold engages. */
  readonly holding = signal(false);
  /** Where the finger is, so the hint can sit just above it (viewport px). */
  readonly holdPoint = signal({ x: 0, y: 0 });
  /** Milliseconds the hint's progress bar takes to fill (hold length minus the hint delay). */
  readonly holdProgressMs = CREATE_HOLD_MS - HOLD_HINT_DELAY_MS;

  fmt = formatMinutes;

  constructor() {
    // While a gesture is active, stop the page from scrolling under the finger.
    // Outside a gesture the browser scrolls as usual (touch-action: pan-y).
    const destroyRef = inject(DestroyRef);
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => {
      // Bring the editor to the top of the screen so the whole day fits.
      if (this.mode() === 'full') window.scrollTo({ top: 0, behavior: 'smooth' });
      const el = this.bar().nativeElement;
      const onTouchMove = (e: TouchEvent) => {
        const g = this.gesture;
        if (g && g.kind !== 'pending-move' && g.kind !== 'pending-create') e.preventDefault();
      };
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      destroyRef.onDestroy(() => el.removeEventListener('touchmove', onTouchMove));
    });
  }

  pct(min: number): number {
    const { start, end } = this.range();
    return ((min - start) / (end - start)) * 100;
  }

  height(iv: Interval): number {
    return this.pct(iv.end) - this.pct(iv.start);
  }

  label(iv: Interval): string {
    return `${formatMinutes(iv.start)} – ${formatMinutes(iv.end)}`;
  }

  othersBlocks(id: string): Interval[] {
    return (
      this.others()
        .find((p) => p.id === id)
        ?.slots.filter((s) => s.date === this.date()) ?? []
    );
  }

  onDown(e: PointerEvent): void {
    if (e.button !== 0 || this.gesture) return;
    e.preventDefault();
    try {
      this.bar().nativeElement.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }

    const target = e.target as HTMLElement;
    const slotEl = target.closest<HTMLElement>('.slot:not(.preview)');
    const index = slotEl ? Number(slotEl.dataset['index']) : -1;
    const slot = this.mine()[index];

    if (slotEl && slot && target.closest('.x')) {
      // The × removes; nothing else does.
      this.remove(slot);
      return;
    }
    if (slotEl && slot && target.closest('.copy-one')) {
      this.noteEditing.set(null);
      if (this.mode() === 'step') {
        const s: Slot = slot.note
          ? { date: this.date(), start: slot.start, end: slot.end, note: slot.note }
          : { date: this.date(), start: slot.start, end: slot.end };
        this.copySlotRequested.emit(s);
      } else {
        this.copySlotIndex.set(index);
      }
      return;
    }

    if (slotEl && slot) {
      const rect = slotEl.getBoundingClientRect();
      const nearTop = e.clientY - rect.top <= EDGE_PX;
      const nearBottom = rect.bottom - e.clientY <= EDGE_PX;
      if (nearTop || nearBottom) {
        // Resize: the opposite edge stays fixed.
        this.gesture = {
          kind: 'resize',
          index,
          fixed: nearTop ? slot.end : slot.start,
          last: nearTop ? slot.start : slot.end,
        };
        this.drag.set({ ...slot, index });
        return;
      }
      // Body: wait for a long press before moving; a quick tap opens the note.
      const timer = setTimeout(() => {
        this.gesture = {
          kind: 'move',
          index,
          grab: this.minuteAt(e.clientY, false) - slot.start,
          length: slot.end - slot.start,
        };
        this.drag.set({ ...slot, index });
        this.moving.set(true);
        navigator.vibrate?.(15);
      }, LONG_PRESS_MS);
      this.gesture = { kind: 'pending-move', index, startY: e.clientY, timer };
      return;
    }

    const m = this.minuteAt(e.clientY);
    if (e.pointerType === 'mouse') {
      this.gesture = { kind: 'create', origin: m, last: m };
      this.drag.set({ start: m, end: m });
      return;
    }
    // Touch/pen: wait for a hold so that a swipe scrolls the page instead.
    this.holdPoint.set({
      x: Math.min(Math.max(e.clientX, 120), window.innerWidth - 120),
      y: e.clientY,
    });
    const hintTimer = setTimeout(() => this.holding.set(true), HOLD_HINT_DELAY_MS);
    const timer = setTimeout(() => {
      // Started by holding: the minimum-length block stays even if the finger never moves.
      this.gesture = { kind: 'create', origin: m, last: m, held: true };
      this.holding.set(false);
      this.drag.set(this.withMin(m, m, 'start'));
      navigator.vibrate?.(20);
    }, CREATE_HOLD_MS);
    this.gesture = { kind: 'pending-create', origin: m, startY: e.clientY, timer, hintTimer };
  }

  onMove(e: PointerEvent): void {
    const g = this.gesture;
    if (!g) return;
    const { start: rs, end: re } = this.range();

    switch (g.kind) {
      case 'create': {
        const m = this.minuteAt(e.clientY);
        g.last = m;
        this.drag.set(
          m >= g.origin ? this.withMin(g.origin, m, 'start') : this.withMin(m, g.origin, 'end'),
        );
        break;
      }
      case 'resize': {
        const m = this.minuteAt(e.clientY);
        g.last = m;
        const iv =
          m >= g.fixed ? this.withMin(g.fixed, m, 'start') : this.withMin(m, g.fixed, 'end');
        this.drag.set({ ...iv, index: g.index });
        break;
      }
      case 'pending-move':
      case 'pending-create': {
        // Moved before the hold engaged: the user is scrolling – let go.
        if (Math.abs(e.clientY - g.startY) > MOVE_TOLERANCE_PX) this.reset();
        break;
      }
      case 'move': {
        const raw = this.minuteAt(e.clientY, false) - g.grab;
        const start = Math.max(rs, Math.min(re - g.length, Math.round(raw / SNAP) * SNAP));
        this.drag.set({ start, end: start + g.length, index: g.index });
        break;
      }
    }
  }

  onUp(e: PointerEvent): void {
    const g = this.gesture;
    if (!g) return;
    const d = this.drag();
    const mine = this.mine();
    this.reset();

    switch (g.kind) {
      case 'create': {
        if (!d) return;
        if (!g.held && Math.abs(g.last - g.origin) < SNAP) return; // a tap on empty space does nothing
        this.commit([...mine, d]);
        this.warnIfExtended(Math.abs(g.last - g.origin));
        break;
      }
      case 'pending-move': {
        if (mine[g.index]) this.openNote(g.index);
        break;
      }
      case 'pending-create':
        break; // a tap on empty space does nothing
      case 'resize':
      case 'move': {
        if (!d) return;
        const rest = mine.filter((_, i) => i !== g.index);
        if (d.end - d.start < SNAP) {
          this.commit(rest);
          return;
        }
        const note = mine[g.index]?.note;
        this.commit([
          ...rest,
          note ? { start: d.start, end: d.end, note } : { start: d.start, end: d.end },
        ]);
        if (g.kind === 'resize') this.warnIfExtended(Math.abs(g.last - g.fixed));
        break;
      }
    }
  }

  onCancel(): void {
    this.reset();
  }

  /**
   * Extends a too-short interval to the minimum length, growing away from the
   * anchored edge and sliding back inside the day range if needed.
   */
  private withMin(start: number, end: number, anchor: 'start' | 'end'): Interval {
    const { start: rs, end: re } = this.range();
    const min = this.minLen();
    if (end - start >= min) return { start, end };
    if (anchor === 'start') {
      end = start + min;
      if (end > re) {
        end = re;
        start = re - min;
      }
    } else {
      start = end - min;
      if (start < rs) {
        start = rs;
        end = rs + min;
      }
    }
    return { start, end };
  }

  /** Tells the user why their period came out longer than what they dragged. */
  private warnIfExtended(dragged: number): void {
    if (dragged >= this.minLen() || this.mode() === 'step') return;
    this.snack.open(
      `Minimum is ${this.minLabel()} – the meetup length. Your period was extended.`,
      undefined,
      {
        duration: 3500,
        panelClass: 'above-bar',
      },
    );
  }

  private reset(): void {
    if (this.gesture?.kind === 'pending-move' || this.gesture?.kind === 'pending-create')
      clearTimeout(this.gesture.timer);
    if (this.gesture?.kind === 'pending-create') clearTimeout(this.gesture.hintTimer);
    this.gesture = null;
    this.drag.set(null);
    this.moving.set(false);
    this.holding.set(false);
  }

  openNote(index: number): void {
    this.noteDraft.set(this.mine()[index]?.note ?? '');
    this.noteEditing.set(index);
    // Focus inside the tap gesture so phones open the keyboard right away.
    const input = this.noteInput().nativeElement;
    input.value = this.noteDraft();
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  saveNote(): void {
    const index = this.noteEditing();
    if (index === null) return;
    this.noteInput().nativeElement.blur();
    const note = this.noteDraft().trim().slice(0, 120);
    const updated = this.mine().map((s, i) => {
      if (i !== index) return s;
      const { note: _old, ...rest } = s;
      return note ? { ...rest, note } : rest;
    });
    this.noteEditing.set(null);
    this.commit(updated);
  }

  cancelNote(): void {
    this.noteEditing.set(null);
    this.noteInput().nativeElement.blur();
  }

  /** Toggles "free all day"; the parent stashes/restores the earlier periods. */
  freeAllDay(): void {
    this.noteEditing.set(null);
    this.allDayToggled.emit(!this.allDay());
  }

  remove(iv: Interval): void {
    const before = this.mine();
    this.commit(before.filter((s) => s !== iv));
    if (this.mode() === 'step') return;
    this.snack
      .open(`Removed ${this.label(iv)}`, 'Undo', { duration: 4000, panelClass: 'above-bar' })
      .onAction()
      .subscribe(() => this.commit(before));
  }

  clearDay(): void {
    if (!this.mine().length) return;
    this.noteEditing.set(null);
    this.dayCleared.emit();
  }

  /** Replaces my slots for this day and emits the full merged list. */
  private commit(today: Interval[]): void {
    this.noteEditing.set(null);
    const date = this.date();
    const otherDays = (this.me()?.slots ?? []).filter((s) => s.date !== date);
    const merged = mergeSlots([...otherDays, ...today.map((iv) => ({ date, ...iv }))]);
    this.slotsChange.emit(merged);
  }

  private minuteAt(clientY: number, snap = true): number {
    const { start, end } = this.range();
    const rect = this.bar().nativeElement.getBoundingClientRect();
    const raw = start + ((clientY - rect.top) / rect.height) * (end - start);
    const m = Math.max(start, Math.min(end, raw));
    return snap ? Math.max(start, Math.min(end, Math.round(m / SNAP) * SNAP)) : m;
  }
}
