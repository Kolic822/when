import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Auth } from '../../core/auth';
import { m, t } from '../../core/i18n/i18n';

/** What When keeps about people, in plain words. Linked from the welcome screen and the menu. */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink, MatIconModule],
  template: `
    <main class="page privacy selectable">
      <nav class="top">
        <a routerLink="/" class="brand">When <span class="tagline">are you free?</span></a>
        <a routerLink="/" class="pill back">
          <mat-icon>close</mat-icon>
          {{ t('Close') }}
        </a>
      </nav>

      <header>
        <h1>{{ t('Privacy') }}</h1>
        <p class="muted">
          {{
            t(
              'When keeps as little about you as it can. This page says what it keeps, why, and for how long.'
            )
          }}
        </p>
      </header>

      @for (s of sections; track s.title) {
        <section class="card">
          <h2>{{ t(s.title) }}</h2>
          <p>{{ t(s.text) }}</p>
        </section>
      }

      <section class="card">
        <h2>{{ t('Your rights') }}</h2>
        <p>{{ t('You can see, change or delete your own data in the app at any time.') }}</p>
        @if (auth.contact(); as contact) {
          <p>
            {{ t('For anything else, write to') }}
            <a [href]="'mailto:' + contact">{{ contact }}</a>
          </p>
        }
      </section>
    </main>
  `,
  styles: `
    .privacy {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 640px;
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 48px;

      .back {
        height: 38px;
        text-decoration: none;
        font-size: 13px;
      }
    }
    h1 {
      margin: 4px 0 0;
      font-size: 26px;
      letter-spacing: -0.02em;
    }
    header p {
      margin: 2px 0 6px;
      font-size: 14px;
    }
    .card {
      padding: 12px 14px 14px;
    }
    h2 {
      margin: 0 0 4px;
      font-size: 16px;
    }
    .card p {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;

      + p {
        margin-top: 6px;
      }
    }
    a {
      color: var(--accent);
    }
  `,
})
export class Privacy {
  readonly t = t;
  readonly auth = inject(Auth);

  readonly sections = [
    {
      title: m('Whens'),
      text: m(
        'A When holds its title, description, days and hours, and for each person their name, the times they marked, their notes and the sessions the organiser booked. Anyone with the link can see it. A When is removed 60 days after its last day; the organiser can delete it earlier from the menu.',
      ),
    },
    {
      title: m('Accounts'),
      text: m(
        'An account holds your email address and username, a salted hash of your password (never the password itself) or, with Google, the id, name and email Google gives us, plus the list of your Whens and your calendar links. You can delete it at the end of the menu; the Whens stay for the others in them.',
      ),
    },
    {
      title: m('Calendar'),
      text: m(
        'With a connected Google Calendar or a calendar link, your events are read only to draw them for you on the days of a When. They are never stored on our server and nobody else sees them. Calendar links are kept with your account so your other devices show them.',
      ),
    },
    {
      title: m('Notifications'),
      text: m(
        'If you switch on push notifications, your browser gives us an address to send them to. It is removed when you switch them off or when the When is removed.',
      ),
    },
    {
      title: m('Technical'),
      text: m(
        'The server keeps your IP address for a short time to slow down abuse, such as too many sign-in attempts. There are no advertising cookies and no analytics; the app keeps your settings in your browser only.',
      ),
    },
    {
      title: m('Where'),
      text: m(
        'Everything runs on Railway, our hosting provider. Backups are kept for 14 days. Emails for confirming your address or resetting a password go through a mail service only when you ask for them.',
      ),
    },
  ];
}
