import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CHANGELOG, VERSION } from '../../core/changelog';
import { t } from '../../core/i18n/i18n';

/** What changed in each version. Reached from the menu under App. */
@Component({
  selector: 'app-changes',
  imports: [RouterLink, MatIconModule],
  template: `
    <main class="page changes selectable">
      <nav class="top">
        <a routerLink="/" class="brand"
          >{{ t('When') }} <span class="tagline">{{ t('are you free?') }}</span></a
        >
        <a routerLink="/" class="pill back">
          <mat-icon>close</mat-icon>
          {{ t('Close') }}
        </a>
      </nav>

      <header>
        <h1>{{ t('What’s new') }}</h1>
        <p class="muted">{{ t('You have version {version}.', { version }) }}</p>
      </header>

      @for (r of releases; track r.version) {
        <section class="card release" [class.current]="r.version === version">
          <h2>
            <span class="v">v{{ r.version }}</span>
            <span class="muted date">{{ r.date }}</span>
          </h2>
          <ul>
            @for (c of r.changes; track c) {
              <li>{{ t(c) }}</li>
            }
          </ul>
        </section>
      }
    </main>
  `,
  styles: `
    .changes {
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
    .release {
      padding: 12px 14px 14px;

      &.current {
        border: 1.5px solid var(--accent);
      }
    }
    h2 {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin: 0 0 6px;
      font-size: 17px;
    }
    .v {
      color: var(--accent);
    }
    .date {
      font-family: var(--font-body);
      font-size: 13px;
      font-weight: 400;
    }
    ul {
      margin: 0;
      padding-left: 18px;
      font-size: 14px;
      line-height: 1.45;
    }
    li + li {
      margin-top: 4px;
    }
  `,
})
export class Changes {
  readonly t = t;
  readonly version = VERSION;
  readonly releases = CHANGELOG;
}
