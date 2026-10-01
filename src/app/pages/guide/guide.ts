import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { VERSION } from '../../core/changelog';
import { t, m } from '../../core/i18n/i18n';

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
  readonly t = t;
  readonly version = VERSION;

  readonly topics: Topic[] = [
    {
      icon: 'add_circle',
      title: m('Plan a When'),
      intro: m('A When is one thing you want to find a time for: a rehearsal, a dinner, a trip.'),
      steps: [
        m('Tap + and give it a name. A description is optional: where, what to bring.'),
        m('Enter your own name so the others know who started it.'),
        m(
          'Tap every day that could work. They don’t have to be next to each other. Use This week, Next week or Weekends to pick several at once; the arrows move four weeks at a time.',
        ),
        m('Set how long the meetup should be, and the earliest and latest hour people can choose.'),
        m('Tap Create my When. You are the organiser.'),
      ],
    },
    {
      icon: 'ios_share',
      title: m('Invite people'),
      steps: [
        m('Tap Copy link at the top of the When and send it in any chat.'),
        m('Whoever opens it enters a name and gets their own colour. No account is needed.'),
        m('The first time on a device they get a short three-step guide, which they can skip.'),
        m('Two people can’t use the same name in one When.'),
      ],
    },
    {
      icon: 'touch_app',
      title: m('Mark when you are free'),
      intro: m('The first time you open a When it walks you through the days one by one.'),
      steps: [
        m('Tap a day in the calendar to open it.'),
        m(
          'Hold your finger on the bar for a moment, then drag to mark a period. A period can’t be shorter than the meetup.',
        ),
        m(
          'Drag the top or bottom edge to make it longer or shorter. Hold the middle and drag to move it.',
        ),
        m(
          'Tap a period to write a note, for example “only if it doesn’t rain”. Tap × to remove it.',
        ),
        m('Free all day marks the whole day. Tap it again to get your earlier periods back.'),
        m(
          'Clear day removes everything you marked on that day. In the calendar you can also hold a day to clear it.',
        ),
        m('Prev and Next move between days. Overview shows all days at once, any time.'),
      ],
    },
    {
      icon: 'content_copy',
      title: m('Copy times to other days'),
      steps: [
        m(
          'In a day, tap Copy to… to copy everything you marked, or the copy icon on one period to copy just that one.',
        ),
        m('Tick the days it should go to, or use Select all.'),
        m('Tap Copy. What those days already had is kept; overlapping periods are joined.'),
      ],
    },
    {
      icon: 'calendar_view_week',
      title: m('Read the calendar'),
      steps: [
        m(
          'Each day is a column and each person is a coloured bar inside it. Your bar is always on the right.',
        ),
        m(
          'A gold band marks a possible session: a time when everyone who answered is free for at least the length of the meetup.',
        ),
        m(
          'Tap a name under the calendar to highlight that person; tap again to switch it off. A green dot means they are in the app right now.',
        ),
        m(
          'Lost your place (a new phone, a cleared browser)? Type your old name and tap “That’s me” to carry on with your times. The organiser can remove a leftover double under Change the plan: tick people, tap Remove, and it happens when you save (Cancel undoes it).',
        ),
        m('With more than five days, swipe sideways. An arrow on the edge shows there is more.'),
        m('The Free button under a day marks you free all day.'),
      ],
    },
    {
      icon: 'event_available',
      title: m('Possible sessions'),
      steps: [
        m('They appear above the calendar once at least two people have answered, in date order.'),
        m(
          'Everyone can vote for a session with the thumb on its chip; the votes show for all of you at once, the line along the bottom shows how many of you are for it, and the best-liked session gets a gold outline. The organiser still decides.',
        ),
        m(
          'Once two or more have answered, the organiser can drop the days nobody can make, under the possible sessions. Times marked on those days go with them.',
        ),
        m('Tap a session to see the notes people left on the times it covers.'),
        m('Tap the header to fold the list down to one line.'),
        m('“Waiting for …” tells you who hasn’t answered yet.'),
      ],
    },
    {
      icon: 'check_circle',
      title: m('Book a session (organiser)'),
      steps: [
        m(
          'Tap a possible session, or its gold band in the calendar. Hold a gold band to book it right there.',
        ),
        m('If it is longer than the meetup, choose when the meetup should start.'),
        m('Tap Book. Everyone sees the Booked banner at the top and can add it to their calendar.'),
        m('Undo on the banner takes the booking back.'),
      ],
    },
    {
      icon: 'edit',
      title: m('Change or delete a When (organiser)'),
      steps: [
        m(
          'Tap the pencil next to the title to change the name, description, days, length or hours, all on one page.',
        ),
        m('Save is always at the bottom; Cancel leaves everything as it was.'),
        m(
          'If you make the meetup longer or the hours narrower, periods that no longer fit are trimmed or removed.',
        ),
        m('To delete a When, open the menu and tap × on it under My Whens. Everyone loses access.'),
        m('If you are not the organiser, × makes you leave: your answers are removed.'),
      ],
    },
    {
      icon: 'notifications_active',
      title: m('Notifications'),
      intro: m('Get told while the app is closed.'),
      steps: [
        m(
          'Tap the bell at the top of a When, or open Notifications in the menu, and switch Push notifications on.',
        ),
        m(
          'On an iPhone, first add When to your Home Screen (Share, then Add to Home Screen) and open it from there.',
        ),
        m(
          'You are told when everyone has answered, and when a session is booked, moved or cancelled.',
        ),
        m(
          'The organiser is also told when someone answers, changes or withdraws an answer on a link they sent.',
        ),
        m('The switch is per device and covers all your Whens.'),
      ],
    },
    {
      icon: 'public',
      title: m('Time zones'),
      intro: m('A When keeps its times in the organiser’s time zone.'),
      steps: [
        m(
          'If your clock is different, every time is shown converted to yours, and a note at the top says so.',
        ),
        m('Tap the button in that note to see the organiser’s time instead, and again to go back.'),
        m(
          'The day columns stay the organiser’s days. A small ⁺¹ or ⁻¹ next to a time means it is the next or previous day for you.',
        ),
        m('Booked sessions, calendar files and notifications always use your own time and date.'),
        m(
          'Travelling, or planning for somewhere else? Choose a time zone under Settings in the menu.',
        ),
      ],
    },
    {
      icon: 'menu',
      title: m('The menu'),
      steps: [
        m(
          'Choose English, Deutsch or Hrvatski under Settings in the menu. The app starts in your phone’s language when it is one of the three.',
        ),
        m(
          'My Whens lists every When you created or joined on this device, with what is booked or possible.',
        ),
        m(
          'Appearance holds the colour scheme and a Dark mode switch (it follows your phone until you touch it). Settings holds the language, month names in dates, your time zone and the defaults for new Whens.',
        ),
        m('Defaults for new Whens pre-fills the length and hours when you plan the next one.'),
        m('App checks for a new version and shows what changed.'),
      ],
    },
    {
      icon: 'install_mobile',
      title: m('Install it on your phone'),
      steps: [
        m('iPhone: open the link in Safari, tap Share, then Add to Home Screen.'),
        m('Android: open the browser menu and tap Install app or Add to Home screen.'),
        m('It then opens full screen like any other app.'),
      ],
    },
    {
      icon: 'person',
      title: m('Guest or account'),
      steps: [
        m(
          'As a guest you type a name in each When. Your Whens are remembered on this device only.',
        ),
        m(
          'With an account your name is filled in for you: sign in with Google, or create one with an email, a username and a password. Sign in or out from the top of the menu.',
        ),
        m(
          'Created an account with an email? Open the link we email you to confirm the address. Forgot the password? Tap Forgot password? on the sign-in form and we email you a link to set a new one.',
        ),
        m(
          'Signing out takes your Whens off that device; they come back when you sign in again. As a guest, your Whens move into the account you create or sign in to.',
        ),
        m(
          'Signed in, your Whens follow you: sign in on another phone or computer and My Whens is the same, and you are the same person in each When.',
        ),
        m(
          'Signing in with Google also switches on the Pro features. There is nothing to turn on; they are marked PRO where they appear.',
        ),
      ],
    },
    {
      icon: 'forward_to_inbox',
      title: m('Outsource decision'),
      pro: true,
      intro: m(
        'Send the possible sessions to someone outside the group, such as a teacher, a guest or a venue, so they choose which one gets booked.',
      ),
      steps: [
        m('Under Possible sessions tap Outsource decision and tick the sessions to offer.'),
        m('Choose whether they may pick just one or several, then create and copy the link.'),
        m(
          'They see only those sessions, enter a name and tap what works. They never see the calendar.',
        ),
        m('If a session is longer than the meetup they can also choose the start time.'),
        m(
          'Their answer appears as a card at the top of your When, and their choice is outlined in the calendar. Book it from the card.',
        ),
        m('Sent to the wrong person? Tap the bin next to the link to remove it.'),
      ],
    },
    {
      icon: 'library_add_check',
      title: m('Book several sessions'),
      pro: true,
      steps: [
        m(
          'Switch on Book several sessions in Settings. Booking a session on another day then adds it instead of replacing the first.',
        ),
        m('One session per day: booking the same day again replaces that day’s session.'),
        m('The banner lists every booked session, each with its own calendar button.'),
        m('The organiser removes one with its × button.'),
      ],
    },
    {
      icon: 'event',
      title: m('Connect calendar'),
      pro: true,
      intro: m('See your own calendar while you mark when you are free.'),
      steps: [
        m(
          'Sign in with Google, then tap Show my calendar above the calendar, or Connect next to Google under Calendar in the menu, and allow it.',
        ),
        m(
          'Your events appear as grey striped blocks behind the bars, with their names, so you see clashes while marking. An all-day event fills the whole day.',
        ),
        m(
          'Apple Calendar, Outlook and others: under Calendar in the menu tap Add Apple or other calendar and paste the calendar’s subscription link. In Apple Calendar tap Calendars, the ⓘ next to a calendar, switch on Public Calendar, then Share Link.',
        ),
        m(
          'In the day view, the calendar button at the top hides or shows your events, and the Names and All day switches beside the bar choose what is drawn. Fill from calendar marks you free wherever your calendar has nothing, if the gap is long enough for the meetup.',
        ),
        m(
          'Under Calendar in the menu you can hide the names (every event then says Busy) and fold all-day events into a small note at the top of the day. The same switches sit beside the bar in the day view.',
        ),
        m(
          'Added something in your calendar? Pull down on the When, or tap Refresh under Calendar in the menu. It also refreshes when you come back to the app.',
        ),
        m(
          'Your events are only read to draw them for you. When never stores them and nobody else sees them.',
        ),
        m('Google asks again after about an hour; Disconnect in the menu withdraws access.'),
      ],
    },
    {
      icon: 'more_horiz',
      title: m('Other Pro features'),
      pro: true,
      steps: [
        m(
          'Add to calendar: a calendar button on every booked session. In the installed app on iPhone it subscribes your Calendar to the When’s booked sessions, which then follow changes by themselves.',
        ),
        m(
          'Join for part of it: a switch when you plan a When. People may mark less than the full length; a session then needs everyone together for at least half of it.',
        ),
        m('History: under the calendar of each When, who changed what and when.'),
      ],
    },
  ];
}
