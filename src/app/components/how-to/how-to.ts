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
import { t, m } from '../../core/i18n/i18n';

interface Tip {
  icon: string;
  text: string;
}

interface Step {
  key: 'calendar' | 'day' | 'actions' | 'sessions' | 'book' | 'tidy' | 'share';
  title: string;
  lead: string;
  tips: Tip[];
  /** Pages without a drawing show a big icon instead. */
  icon?: string;
  /** Only the organiser sees these. */
  organiser?: boolean;
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
  readonly t = t;
  private readonly state = inject(HowToState);
  private readonly primary = viewChild.required<ElementRef<HTMLButtonElement>>('primary');

  private readonly allSteps: Step[] = [
    {
      key: 'calendar',
      title: m('The calendar'),
      lead: m('One bar per day. Every colour is a person.'),
      tips: [
        { icon: 'touch_app', text: m('Tap a day to add your free time.') },
        { icon: 'star', text: m('Gold shows when everyone can make it.') },
        { icon: 'check', text: m('The Free button under a day means free all day.') },
      ],
    },
    {
      key: 'day',
      title: m('Day by day'),
      lead: m('Mark when you are free, one day at a time.'),
      tips: [
        {
          icon: 'add',
          text: COARSE ? m('Hold, then drag to add a block.') : m('Drag to add a block.'),
        },
        { icon: 'unfold_more', text: m('Drag its edges to resize, hold it to move.') },
        { icon: 'edit_note', text: m('Tap a block for a note. × removes it.') },
      ],
    },
    {
      key: 'actions',
      title: m('Shortcuts'),
      lead: m('The buttons next to the bar save you time.'),
      tips: [
        { icon: 'wb_sunny', text: m('Free all day fills the whole day.') },
        { icon: 'content_copy', text: m('Copy to… repeats your times on other days.') },
        {
          icon: 'calendar_view_week',
          text: m('Next moves on. Overview shows all days at once, any time.'),
        },
      ],
    },
    {
      key: 'sessions',
      title: m('Possible sessions'),
      lead: m('Chips at the top list the times that work for everyone.'),
      tips: [
        { icon: 'thumb_up', text: m('Vote with the thumb; everyone sees it at once.') },
        {
          icon: 'event_available',
          text: m('The organiser books one; it lands in everyone’s calendar.'),
        },
        { icon: 'event_busy', text: m('Days nobody can make can be dropped by the organiser.') },
      ],
    },
    {
      key: 'book',
      organiser: true,
      icon: 'event_available',
      title: m('You book'),
      lead: m('Only the organiser can book a session.'),
      tips: [
        { icon: 'touch_app', text: m('Tap a possible session, pick a start, tap Book.') },
        {
          icon: 'back_hand',
          text: m('Or hold a gold band in the calendar to book it right there.'),
        },
        {
          icon: 'calendar_add_on',
          text: m('A booked session lands in everyone’s calendar with one tap.'),
        },
      ],
    },
    {
      key: 'tidy',
      organiser: true,
      icon: 'tune',
      title: m('Keep it tidy'),
      lead: m('Your When, your rules.'),
      tips: [
        {
          icon: 'event_busy',
          text: m('Drop the days nobody can make, under the possible sessions.'),
        },
        { icon: 'edit', text: m('Change the plan: name, days, hours and length.') },
        { icon: 'person_remove', text: m('Remove a leftover double from the people list there.') },
      ],
    },
    {
      key: 'share',
      organiser: true,
      icon: 'forward_to_inbox',
      title: m('Share, or outsource'),
      lead: m('Get answers, or let someone else choose.'),
      tips: [
        { icon: 'link', text: m('Copy link sends the When to the group.') },
        {
          icon: 'forward_to_inbox',
          text: m('Outsource decision sends the sessions to someone outside the group to choose.'),
        },
        {
          icon: 'notifications_active',
          text: m('Turn on notifications to hear when everyone has answered.'),
        },
      ],
    },
  ];

  /** The pages for this showing: the general ones, the organiser's, or both. */
  readonly steps = computed(() => {
    const { general, organiser } = this.state.pages();
    return this.allSteps.filter((s) => (s.organiser ? organiser : general));
  });

  readonly index = signal(0);
  readonly step = computed(() => this.steps()[this.index()]);
  readonly isLast = computed(() => this.index() === this.steps().length - 1);

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
