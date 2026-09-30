import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppMenu } from '../../components/app-menu/app-menu';
import { WhenDetails, WhenForm } from '../../components/when-form/when-form';
import { EventApi } from '../../core/event-api';
import { t } from '../../core/i18n/i18n';
import { Identity } from '../../core/identity';
import { viewerZone } from '../../core/zone';

/** Plan a new When. */
@Component({
  selector: 'app-home',
  imports: [AppMenu, WhenForm],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  readonly t = t;
  private readonly api = inject(EventApi);
  private readonly identity = inject(Identity);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async create(details: WhenDetails): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { name, ...rest } = details;
      const { event, creatorToken } = await this.api.create({ ...rest, timeZone: viewerZone() });
      this.identity.setCreatorToken(event.id, creatorToken);
      this.identity.setPendingName(event.id, name);
      await this.router.navigate(['/e', event.id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : t('Something went wrong'));
      this.busy.set(false);
    }
  }
}
