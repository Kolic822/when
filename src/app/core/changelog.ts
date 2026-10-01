import { m } from './i18n/i18n';

/** What changed in each version, newest first. Shown in the menu under App. */
export interface Release {
  version: string;
  date: string;
  changes: string[];
}

export const VERSION = '0.17.6';

export const CHANGELOG: Release[] = [
  {
    version: '0.17.6',
    date: '1 Oct 2026',
    changes: [
      m(
        'Change the plan: tick people, tap Remove, confirm; it happens on Save, and Cancel undoes it',
      ),
    ],
  },
  {
    version: '0.17.5',
    date: '1 Oct 2026',
    changes: [
      m('Change the plan: people as chips, with the remove button at the edge'),
      m('Day view: the hint line no longer gets pushed out of view after adding a time'),
    ],
  },
  {
    version: '0.17.4',
    date: '1 Oct 2026',
    changes: [
      m('Clear day and Book popups sit in the middle of the screen, above everything'),
      m('Votes show up in the history'),
    ],
  },
  {
    version: '0.17.3',
    date: '1 Oct 2026',
    changes: [m('An opened session is clearly tinted, even when it is the one with most votes')],
  },
  {
    version: '0.17.2',
    date: '1 Oct 2026',
    changes: [m('Tap a possible session and its gold band lights up in the calendar')],
  },
  {
    version: '0.17.1',
    date: '1 Oct 2026',
    changes: [
      m('Outsource decision: the link is copied the moment it is made; each link is one tidy line'),
      m('Velvet, a deep red scheme, replaces Grape; Lavender is the default'),
    ],
  },
  {
    version: '0.17',
    date: '1 Oct 2026',
    changes: [
      m('Guests keep their place: the server remembers who you are even if the browser forgets'),
      m('Lost it anyway? Type your old name and tap “That’s me” to carry on with your times'),
      m(
        'The organiser can remove a person: highlight the name under the calendar, or under Change the plan',
      ),
      m('Voting: one big thumb per session, and a line along the chip shows how many are for it'),
    ],
  },
  {
    version: '0.16',
    date: '1 Oct 2026',
    changes: [
      m('Vote for possible sessions; everyone sees the votes live and the favourite is marked'),
      m('The Create my When button sits at the bottom again instead of over the form'),
    ],
  },
  {
    version: '0.15.2',
    date: '1 Oct 2026',
    changes: [m('Dark mode and month names in dates are switches now')],
  },
  {
    version: '0.15.1',
    date: '1 Oct 2026',
    changes: [
      m('The colour schemes fit the menu again, two per row'),
      m('Outsource decision: the button steps aside while a link exists'),
    ],
  },
  {
    version: '0.15',
    date: '1 Oct 2026',
    changes: [
      m('Privacy page, linked from the welcome screen and the menu'),
      m('Lavender joins the colour schemes'),
      m('Outsource decision: one switch for multiple choice, clearer buttons'),
      m('Folding is smooth now: the content fades, then the box follows'),
      m('Swiping between days no longer opens a note by accident'),
      m('More air between people’s bars, and the bars are more see-through'),
      m('Google button in the chosen language, the same height as the other buttons'),
    ],
  },
  {
    version: '0.14',
    date: '1 Oct 2026',
    changes: [
      m('New colour schemes: Sand (warm, gold) and Sky (cool blue) join Grape'),
      m('People in a When get colours as far apart as possible, never two look-alikes'),
      m(
        'Menu groups, possible sessions and history ease open and closed; days slide; the bell rings',
      ),
      m('Swipe sideways in the day view to move between days'),
      m('All-day events: fill the day, or (switched off) a small note at the top'),
      m('Day view: the calendar switches only appear on days with calendar events'),
      m(
        'Google sign-in button matches the other buttons and no longer sits in a white box in the dark',
      ),
    ],
  },
  {
    version: '0.13',
    date: '1 Oct 2026',
    changes: [
      m('A fresher look: rounder, lighter, with the menu in tidy groups'),
      m('Menu: one group open at a time; language, date and time live under Settings'),
      m('History sits under the calendar of each When'),
      m('Hold a gold band in the calendar to book it right there'),
      m('A Free button under each day instead of the sun'),
      m('Day view: Names and All day switches for your calendar, beside the bar'),
      m(
        'Add to calendar only on booked sessions; in the installed app on iPhone it subscribes your Calendar to the When',
      ),
    ],
  },
  {
    version: '0.12.2',
    date: '1 Oct 2026',
    changes: [m('The tagline “When are you free?” stays in English in every language')],
  },
  {
    version: '0.12.1',
    date: '30 Sep 2026',
    changes: [
      m(
        'Signing out takes your Whens off the device, so the next account to sign in starts with its own',
      ),
      m('Delete account, at the end of the menu'),
    ],
  },
  {
    version: '0.12',
    date: '30 Sep 2026',
    changes: [
      m('Forgot your password? Get a link by email to set a new one'),
      m('New accounts confirm their email address with a link'),
    ],
  },
  {
    version: '0.11.1',
    date: '30 Sep 2026',
    changes: [
      m('Day view: a button at the top shows or hides your calendar events'),
      m('Fill from calendar marks you free around your calendar events'),
      m('Add to calendar now opens the calendar on phones'),
      m('Book stands out more on its button'),
    ],
  },
  {
    version: '0.11',
    date: '30 Sep 2026',
    changes: [
      m('Create an account with an email, a username and a password, or sign in with them'),
      m('Whens follow any account, not only Google ones, to every device'),
      m(
        'A link opened in the browser while you use the installed app: sign in there and you carry on as the same person',
      ),
      m('Calendar links are kept with your account, so every device shows them'),
    ],
  },
  {
    version: '0.10.8',
    date: '30 Sep 2026',
    changes: [m('All-day calendar events fill the whole day in grey')],
  },
  {
    version: '0.10.7',
    date: '30 Sep 2026',
    changes: [
      m(
        'A linked calendar now says whether it is empty or just has nothing on the days of this When',
      ),
    ],
  },
  {
    version: '0.10.6',
    date: '30 Sep 2026',
    changes: [
      m('A double tap no longer zooms the page'),
      m('Holding a finger down no longer selects text'),
    ],
  },
  {
    version: '0.10.5',
    date: '30 Sep 2026',
    changes: [
      m('Fixed: the welcome screen buttons sometimes did nothing, for example after signing out'),
    ],
  },
  {
    version: '0.10.4',
    date: '30 Sep 2026',
    changes: [m('Dragging a period no longer shows two overlapping labels')],
  },
  {
    version: '0.10.3',
    date: '30 Sep 2026',
    changes: [m('Fixed: the arrows in the day picker now move to later and earlier weeks')],
  },
  {
    version: '0.10.2',
    date: '30 Sep 2026',
    changes: [m('A tidier Calendar section: your calendars first, display options last')],
  },
  {
    version: '0.10.1',
    date: '30 Sep 2026',
    changes: [
      m('Calendar has its own section in the menu, with a Refresh events button'),
      m('Pull down on a When to refresh your calendar and your Whens'),
      m('The calendar also refreshes by itself when you come back to the app'),
    ],
  },
  {
    version: '0.10',
    date: '30 Sep 2026',
    changes: [
      m('Add an Apple, Outlook or any other calendar by pasting its subscription link'),
      m('Settings lists every calendar that was read and how many events each has'),
    ],
  },
  {
    version: '0.9.3',
    date: '30 Sep 2026',
    changes: [
      m('This week, Next week and Weekends are back when planning a When'),
      m('The When shows how many of your calendar events fall on its days'),
      m(
        'Connecting the calendar opens Google’s window straight from the tap, which phones require',
      ),
    ],
  },
  {
    version: '0.9.2',
    date: '30 Sep 2026',
    changes: [m('Signed in with Google: your Whens follow you to every device you sign in on')],
  },
  {
    version: '0.9.1',
    date: '30 Sep 2026',
    changes: [
      m('Connect calendar reads every calendar you keep, not only the main one'),
      m('If the calendar cannot be shown, the app now says why'),
    ],
  },
  {
    version: '0.9',
    date: '30 Sep 2026',
    changes: [
      m('Pro features are on for everyone signed in with Google; the switches are gone'),
      m('Pro features carry a PRO badge; guests see the list greyed out in the menu'),
      m('Connect calendar shows all your events with their names, including all-day ones'),
      m('Settings: choose whether event names and all-day events are shown'),
      m(
        'Book several sessions moved to Settings; defaults use the same compact pickers as the form',
      ),
    ],
  },
  {
    version: '0.8',
    date: '30 Sep 2026',
    changes: [
      m('Connect calendar reads your real busy times from Google Calendar'),
      m(
        '“Send options” is now “Outsource decision”, offered only when there is more than one possible session',
      ),
    ],
  },
  {
    version: '0.7.4',
    date: '30 Sep 2026',
    changes: [m('Planning a When is one page too, the same as changing one')],
  },
  {
    version: '0.7.3',
    date: '30 Sep 2026',
    changes: [
      m('The short guide now appears right after you join a When from a link, and can be skipped'),
    ],
  },
  {
    version: '0.7.2',
    date: '30 Sep 2026',
    changes: [m('Editing a When is one page with everything on it, and Save always in reach')],
  },
  {
    version: '0.7.1',
    date: '30 Sep 2026',
    changes: [
      m('Bigger calendar when picking days; length on its own row'),
      m('“Let someone else pick” is now “Send options”, on the right'),
      m('What’s new has its own page'),
      m('Removed “Fill from my calendar” for now'),
    ],
  },
  {
    version: '0.7',
    date: '30 Sep 2026',
    changes: [
      m('Three languages: English, German and Croatian'),
      m('Switch language at the top of the menu or on the welcome screen'),
      m('Days, months and notifications follow your language'),
    ],
  },
  {
    version: '0.6',
    date: '30 Sep 2026',
    changes: [
      m('Time zones: a When keeps the organiser’s zone and everyone else sees their own time'),
      m('A note at the top says whose time is shown, with one tap to switch'),
      m('Pick your time zone by hand under Date and time in the menu'),
      m('Calendar files and notifications use the right time for each person'),
    ],
  },
  {
    version: '0.5.1',
    date: '30 Sep 2026',
    changes: [
      m('New app icon and browser icon'),
      m('The Book button shows the day and time itself; repeated text around it is gone'),
      m('One booked session per day: booking a day again replaces it'),
      m('“Notify me” is now “Push notifications”'),
    ],
  },
  {
    version: '0.5',
    date: '30 Sep 2026',
    changes: [
      m('Possible sessions are chips: tap one to see notes, pick the start time and book'),
      m('“Let someone else pick” replaces “Ask someone”; sent links can be removed'),
      m('Notifications are one switch in the menu, with a bell at the top of each When'),
      m('New notifications: everyone has answered, session moved or cancelled, answer changed'),
      m('Pro preview: book more than one session'),
      m('History moved into the menu (Pro preview), for any of your Whens'),
      m('This change log, version numbers and a full guide'),
    ],
  },
  {
    version: '0.4',
    date: '30 Sep 2026',
    changes: [
      m('Push notifications when a session is booked and when someone answers a link'),
      m('Welcome screen: continue with Google or as a guest'),
      m('Old Whens are removed after 60 days; daily backups of everything else'),
    ],
  },
  {
    version: '0.3',
    date: '29 Sep 2026',
    changes: [
      m('Creating a When is two short steps that fit on one screen'),
      m('The day picker starts from this week and never shows the past'),
      m('Layout fits an installed phone app: no cut-off buttons, less wasted space'),
      m('Pro preview: fill your free time from your calendar'),
    ],
  },
  {
    version: '0.2',
    date: '29 Sep 2026',
    changes: [
      m('The organiser can book a session, from the list or by tapping a gold band'),
      m('Send a link with only the possible sessions and let someone choose'),
      m('New look with three colour themes, light and dark'),
      m('How-it-works guide on first visit'),
      m('Pro previews: connect calendar, add to calendar, join for part of it, history'),
    ],
  },
  {
    version: '0.1',
    date: '25 Sep 2026',
    changes: [
      m('Create a When, share the link, mark when you are free'),
      m('Everything syncs live; gold bands show when everyone can make it'),
      m('Day-by-day view with copy to other days, notes and free all day'),
      m('Works as an installed app on your phone'),
    ],
  },
];
