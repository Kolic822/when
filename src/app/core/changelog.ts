/** What changed in each version, newest first. Shown in the menu under App. */
export interface Release {
  version: string;
  date: string;
  changes: string[];
}

export const VERSION = '0.5';

export const CHANGELOG: Release[] = [
  {
    version: '0.5',
    date: '30 Sep 2026',
    changes: [
      'Possible sessions are chips: tap one to see notes, pick the start time and book',
      '“Let someone else pick” replaces “Ask someone”; sent links can be removed',
      'Notifications are one switch in the menu, with a bell at the top of each When',
      'New notifications: everyone has answered, session moved or cancelled, answer changed',
      'Pro preview: book more than one session',
      'History moved into the menu (Pro preview), for any of your Whens',
      'This change log, version numbers and a full guide',
    ],
  },
  {
    version: '0.4',
    date: '30 Sep 2026',
    changes: [
      'Push notifications when a session is booked and when someone answers a link',
      'Welcome screen: continue with Google or as a guest',
      'Old Whens are removed after 60 days; daily backups of everything else',
    ],
  },
  {
    version: '0.3',
    date: '29 Sep 2026',
    changes: [
      'Creating a When is two short steps that fit on one screen',
      'The day picker starts from this week and never shows the past',
      'Layout fits an installed phone app: no cut-off buttons, less wasted space',
      'Pro preview: fill your free time from your calendar',
    ],
  },
  {
    version: '0.2',
    date: '29 Sep 2026',
    changes: [
      'The organiser can book a session, from the list or by tapping a gold band',
      'Send a link with only the possible sessions and let someone choose',
      'New look with three colour themes, light and dark',
      'How-it-works guide on first visit',
      'Pro previews: connect calendar, add to calendar, join for part of it, history',
    ],
  },
  {
    version: '0.1',
    date: '25 Sep 2026',
    changes: [
      'Create a When, share the link, mark when you are free',
      'Everything syncs live; gold bands show when everyone can make it',
      'Day-by-day view with copy to other days, notes and free all day',
      'Works as an installed app on your phone',
    ],
  },
];
