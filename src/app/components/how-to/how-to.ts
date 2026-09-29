import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { HowToState } from '../../core/how-to-state';

interface Tip {
  icon: string;
  text: string;
}

interface Step {
  key: 'calendar' | 'day' | 'actions';
  title: string;
  lead: string;
  tips: Tip[];
}

const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Three-step introduction shown over the app. */
@Component({
  selector: 'app-how-to',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './how-to.html',
  styleUrl: './how-to.scss',
  host: { '(keydown.escape)': 'skip()' },
})
export class HowTo {
  private readonly state = inject(HowToState);
  private readonly primary = viewChild.required<ElementRef<HTMLButtonElement>>('primary');

  readonly steps: Step[] = [
    {
      key: 'calendar',
      title: 'The calendar',
      lead: 'One bar per day. Every colour is a person.',
      tips: [
        { icon: 'touch_app', text: 'Tap a day to add your free time.' },
        { icon: 'star', text: 'Gold shows when everyone can make it.' },
        { icon: 'wb_sunny', text: 'The sun under a day means free all day.' },
      ],
    },
    {
      key: 'day',
      title: 'Day by day',
      lead: 'Mark when you are free, one day at a time.',
      tips: [
        { icon: 'add', text: COARSE ? 'Hold, then drag to add a block.' : 'Drag to add a block.' },
        { icon: 'unfold_more', text: 'Drag its edges to resize, hold it to move.' },
        { icon: 'edit_note', text: 'Tap a block for a note. × removes it.' },
      ],
    },
    {
      key: 'actions',
      title: 'Shortcuts',
      lead: 'The buttons next to the bar save you time.',
      tips: [
        { icon: 'wb_sunny', text: 'Free all day fills the whole day.' },
        { icon: 'content_copy', text: 'Copy to… repeats your times on other days.' },
        { icon: 'check', text: 'Next moves on. Done takes you back to the calendar.' },
      ],
    },
  ];

  readonly index = signal(0);
  readonly step = computed(() => this.steps[this.index()]);
  readonly isLast = computed(() => this.index() === this.steps.length - 1);

  constructor() {
    // Material's button finishes setting up a moment after render; focus once it has.
    afterNextRender(() =>
      setTimeout(() => this.primary().nativeElement.focus({ preventScroll: true }), 60),
    );
  }

  /** Direction of the last move, so the content slides the right way. */
  readonly dir = signal<'fwd' | 'back'>('fwd');

  next(): void {
    this.dir.set('fwd');
    if (this.isLast()) this.state.close();
    else this.index.update((i) => i + 1);
  }

  back(): void {
    this.dir.set('back');
    this.index.update((i) => Math.max(0, i - 1));
  }

  // ---- Swipe left/right to move between steps.
  private swipeFrom: { x: number; y: number } | null = null;

  onSwipeStart(e: PointerEvent): void {
    this.swipeFrom = { x: e.clientX, y: e.clientY };
  }

  onSwipeEnd(e: PointerEvent): void {
    const from = this.swipeFrom;
    this.swipeFrom = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) this.next();
    else if (this.index() > 0) this.back();
  }

  skip(): void {
    this.state.close();
  }
}
