import { inject, Service, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter } from 'rxjs';

export type UpdateStatus = 'unsupported' | 'idle' | 'checking' | 'uptodate' | 'ready' | 'error';

/**
 * Keeps the installed PWA fresh: checks for a new build on launch, whenever the
 * app comes back to the foreground and every few minutes, then offers a reload.
 */
@Service()
export class Updates {
  private readonly sw = inject(SwUpdate);
  private readonly snack = inject(MatSnackBar);

  readonly status = signal<UpdateStatus>(this.sw.isEnabled ? 'idle' : 'unsupported');

  constructor() {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.offerReload());

    // A broken cache (e.g. a file missing after a deploy) is fixed by reloading.
    this.sw.unrecoverable.subscribe(() => location.reload());

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.check();
    });
    setInterval(() => this.check(), 5 * 60_000);
    this.check();
  }

  /** Asks the service worker to look for a new build. Resolves true when one was found. */
  async check(): Promise<boolean> {
    if (!this.sw.isEnabled) return false;
    this.status.set('checking');
    try {
      const found = await this.sw.checkForUpdate();
      this.status.set(found ? 'ready' : 'uptodate');
      return found;
    } catch {
      this.status.set('error');
      return false;
    }
  }

  reload(): void {
    location.reload();
  }

  private offerReload(): void {
    this.status.set('ready');
    this.snack
      .open('A new version of When is ready', 'Reload', { duration: 0 })
      .onAction()
      .subscribe(() => this.reload());
  }
}
