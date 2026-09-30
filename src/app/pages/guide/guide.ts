import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { VERSION } from '../../core/changelog';

interface Topic {
  icon: string;
  title: string;
  intro?: string;
  steps: string[];
  pro?: boolean;
}

/** Every feature, step by step. Reached from the menu under App. */
@Component({
  selector: 'app-guide',
  imports: [RouterLink, MatIconModule],
  templateUrl: './guide.html',
  styleUrl: './guide.scss',
})
export class Guide {
  readonly version = VERSION;

  readonly topics: Topic[] = [
    {
      icon: 'add_circle',
      title: 'Plan a When',
      intro: 'A When is one thing you want to find a time for: a rehearsal, a dinner, a trip.',
      steps: [
        'Tap + and give it a name. A description is optional: where, what to bring.',
        'Enter your own name so the others know who started it.',
        'Tap every day that could work. They don’t have to be next to each other. Use This week, Next week or Weekends to pick several at once.',
        'Set how long the meetup should be, and the earliest and latest hour people can choose.',
        'Tap Create my When. You are the organiser.',
      ],
    },
    {
      icon: 'ios_share',
      title: 'Invite people',
      steps: [
        'Tap Copy link at the top of the When and send it in any chat.',
        'Whoever opens it enters a name and gets their own colour. No account is needed.',
        'Two people can’t use the same name in one When.',
      ],
    },
    {
      icon: 'touch_app',
      title: 'Mark when you are free',
      intro: 'The first time you open a When it walks you through the days one by one.',
      steps: [
        'Tap a day in the calendar to open it.',
        'Hold your finger on the bar for a moment, then drag to mark a period. A period can’t be shorter than the meetup.',
        'Drag the top or bottom edge to make it longer or shorter. Hold the middle and drag to move it.',
        'Tap a period to write a note, for example “only if it doesn’t rain”. Tap × to remove it.',
        'Free all day marks the whole day. Tap it again to get your earlier periods back.',
        'Clear day removes everything you marked on that day. In the calendar you can also hold a day to clear it.',
        'Prev and Next move between days. Done returns to the calendar.',
      ],
    },
    {
      icon: 'content_copy',
      title: 'Copy times to other days',
      steps: [
        'In a day, tap Copy to… to copy everything you marked, or the copy icon on one period to copy just that one.',
        'Tick the days it should go to, or use Select all.',
        'Tap Copy. What those days already had is kept; overlapping periods are joined.',
      ],
    },
    {
      icon: 'calendar_view_week',
      title: 'Read the calendar',
      steps: [
        'Each day is a column and each person is a coloured bar inside it. Your bar is always on the right.',
        'A gold band marks a possible session: a time when everyone who answered is free for at least the length of the meetup.',
        'Tap a name under the calendar to highlight that person; tap again to switch it off. A green dot means they are in the app right now.',
        'With more than five days, swipe sideways. An arrow on the edge shows there is more.',
        'The sun button under a day marks you free all day.',
      ],
    },
    {
      icon: 'event_available',
      title: 'Possible sessions',
      steps: [
        'They appear above the calendar once at least two people have answered, in date order.',
        'Tap a session to see the notes people left on the times it covers.',
        'Tap the header to fold the list down to one line.',
        '“Waiting for …” tells you who hasn’t answered yet.',
      ],
    },
    {
      icon: 'check_circle',
      title: 'Book a session (organiser)',
      steps: [
        'Tap a possible session, or its gold band in the calendar.',
        'If it is longer than the meetup, choose when the meetup should start.',
        'Tap Book. Everyone sees the Booked banner at the top and can add it to their calendar.',
        'Undo on the banner takes the booking back.',
      ],
    },
    {
      icon: 'edit',
      title: 'Change or delete a When (organiser)',
      steps: [
        'Tap the pencil next to the title to change the name, description, days, length or hours.',
        'If you make the meetup longer or the hours narrower, periods that no longer fit are trimmed or removed.',
        'To delete a When, open the menu and tap × on it under My Whens. Everyone loses access.',
        'If you are not the organiser, × makes you leave: your answers are removed.',
      ],
    },
    {
      icon: 'notifications_active',
      title: 'Notifications',
      intro: 'Get told while the app is closed.',
      steps: [
        'Tap the bell at the top of a When, or open Notifications in the menu, and switch Push notifications on.',
        'On an iPhone, first add When to your Home Screen (Share, then Add to Home Screen) and open it from there.',
        'You are told when everyone has answered, and when a session is booked, moved or cancelled.',
        'The organiser is also told when someone answers, changes or withdraws an answer on a link they sent.',
        'The switch is per device and covers all your Whens.',
      ],
    },
    {
      icon: 'public',
      title: 'Time zones',
      intro: 'A When keeps its times in the organiser’s time zone.',
      steps: [
        'If your clock is different, every time is shown converted to yours, and a note at the top says so.',
        'Tap the button in that note to see the organiser’s time instead, and again to go back.',
        'The day columns stay the organiser’s days. A small ⁺¹ or ⁻¹ next to a time means it is the next or previous day for you.',
        'Booked sessions, calendar files and notifications always use your own time and date.',
        'Travelling, or planning for somewhere else? Choose a time zone under Date and time in the menu.',
      ],
    },
    {
      icon: 'menu',
      title: 'The menu',
      steps: [
        'My Whens lists every When you created or joined on this device, with what is booked or possible.',
        'Appearance changes the colours and light or dark mode. Date and time switches between 30.9. and 30 Sep and sets your time zone.',
        'Defaults for new Whens pre-fills the length and hours when you plan the next one.',
        'App checks for a new version and shows what changed.',
      ],
    },
    {
      icon: 'install_mobile',
      title: 'Install it on your phone',
      steps: [
        'iPhone: open the link in Safari, tap Share, then Add to Home Screen.',
        'Android: open the browser menu and tap Install app or Add to Home screen.',
        'It then opens full screen like any other app.',
      ],
    },
    {
      icon: 'person',
      title: 'Guest or Google',
      steps: [
        'As a guest you type a name in each When. Your Whens are remembered on this device only.',
        'With Google your name is filled in for you. Sign in or out from the top of the menu.',
      ],
    },
    {
      icon: 'forward_to_inbox',
      title: 'Let someone else pick',
      pro: true,
      intro:
        'For when the group has options and one more person has to choose, like a teacher or a guest.',
      steps: [
        'Under Possible sessions tap Let someone else pick and tick the sessions to offer.',
        'Choose whether they may pick just one or several, then create and copy the link.',
        'They see only those sessions, enter a name and tap what works. They never see the calendar.',
        'If a session is longer than the meetup they can also choose the start time.',
        'Their answer appears as a card at the top of your When, and their choice is outlined in the calendar. Book it from the card.',
        'Sent to the wrong person? Tap the bin next to the link to remove it.',
      ],
    },
    {
      icon: 'library_add_check',
      title: 'Book several sessions',
      pro: true,
      steps: [
        'With this on, booking a session on another day adds it instead of replacing the first.',
        'One session per day: booking the same day again replaces that day’s session.',
        'The banner lists every booked session, each with its own calendar button.',
        'The organiser removes one with its × button.',
      ],
    },
    {
      icon: 'event',
      title: 'Connect calendar and fill from it',
      pro: true,
      intro: 'A preview with sample events; your real calendar is not read yet.',
      steps: [
        'Your own events appear as grey striped blocks behind the bars, so you see clashes while marking.',
        'Fill from my calendar marks you free in every gap between events that is long enough for the meetup.',
        'If you already marked times it asks whether to add to them or replace them. Undo is offered afterwards.',
      ],
    },
    {
      icon: 'more_horiz',
      title: 'Other Pro previews',
      pro: true,
      steps: [
        'Add to calendar: a calendar button on every possible session, not only on the booked one.',
        'Join for part of it: people may mark less than the full length; a session then needs everyone together for at least half of it.',
        'History: a section in the menu showing who changed what in any of your Whens.',
      ],
    },
  ];
}
