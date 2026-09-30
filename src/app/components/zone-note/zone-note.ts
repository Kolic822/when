import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  eventZone,
  setZoneMode,
  viewerZone,
  zoneCity,
  zoneDiffers,
  zoneMode,
  zoneOffset,
} from '../../core/zone';
import { t } from '../../core/i18n/i18n';

/**
 * Shown only to someone whose clock differs from the When's: says whose time is
 * on screen and lets them flip between their own and the organiser's.
 */
@Component({
  selector: 'app-zone-note',
  imports: [MatIconModule],
  template: `
    @if (info(); as i) {
      <div class="zone" role="group" [attr.aria-label]="t('Time zone')">
        <mat-icon>public</mat-icon>
        <span class="text">
          {{ i.mine ? t('Shown in your time') : t('Shown in {city} time', { city: i.eventCity }) }}
          <span class="muted">· {{ i.mine ? i.myCity : i.gap }}</span>
        </span>
        <button type="button" class="switch" (click)="flip()">
          {{ i.mine ? t('{city} time', { city: i.eventCity }) : t('My time') }}
        </button>
      </div>
    }
  `,
  styles: `
    .zone {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 6px 6px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      font-size: 13px;

      mat-icon {
        flex: none;
        color: var(--accent);
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .text {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .switch {
      flex: none;
      margin-left: auto;
      height: 30px;
      padding: 0 12px;
      border: 0;
      border-radius: 999px;
      background: var(--when-surface);
      color: var(--accent);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
    }
  `,
})
export class ZoneNote {
  readonly t = t;
  /** The days of the When, to tell whether the clocks differ on any of them. */
  readonly dates = input.required<string[]>();

  readonly info = computed(() => {
    const zone = eventZone();
    const dates = this.dates();
    if (!zone || !dates.length || !zoneDiffers(dates)) return null;
    const hours = (zoneOffset(viewerZone(), dates[0]) - zoneOffset(zone, dates[0])) / 60;
    const amount = `${Math.abs(hours)} h`;
    return {
      mine: zoneMode() === 'mine',
      myCity: zoneCity(viewerZone()),
      eventCity: zoneCity(zone),
      gap:
        hours > 0 ? t('{amount} behind you', { amount }) : t('{amount} ahead of you', { amount }),
    };
  });

  flip(): void {
    setZoneMode(zoneMode() === 'mine' ? 'event' : 'mine');
  }
}
