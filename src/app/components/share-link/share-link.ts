import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { t } from '../../core/i18n/i18n';
import { canShare, shareOrCopy } from '../../core/share';

@Component({
  selector: 'app-share-link',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (compact()) {
      @if (canShare) {
        <button type="button" class="pill copy" (click)="share()" [title]="t('Share link')">
          <mat-icon>ios_share</mat-icon>
          {{ t('Share') }}
        </button>
      } @else {
        <button
          type="button"
          class="pill copy"
          (click)="copy()"
          [title]="t('Copy the link to this When')"
        >
          <mat-icon>content_copy</mat-icon>
          {{ t('Copy link') }}
        </button>
      }
    } @else {
      <div class="share">
        <mat-icon class="muted">link</mat-icon>
        <button type="button" class="url" (click)="copy()" [title]="t('Copy link')">
          {{ url() }}
        </button>
        <button mat-flat-button type="button" (click)="copy()">
          <mat-icon>content_copy</mat-icon>
          {{ t('Copy') }}
        </button>
        @if (canShare) {
          <button
            mat-icon-button
            type="button"
            (click)="share()"
            [attr.aria-label]="t('Share link')"
          >
            <mat-icon>ios_share</mat-icon>
          </button>
        }
      </div>
    }
  `,
  styles: `
    .share {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--when-surface);
      border: 1px solid var(--when-border);
      border-radius: 999px;
      padding: 6px 6px 6px 14px;
    }
    /* A button, not an input: tapping it never focuses a text field, so phones don't zoom. */
    .url {
      flex: 1;
      min-width: 0;
      border: 0;
      padding: 0;
      background: transparent;
      font: inherit;
      color: var(--when-muted);
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        border-radius: 4px;
      }
    }
    button[mat-flat-button] {
      border-radius: 999px;
    }
    .copy {
      color: var(--mat-sys-primary);
      height: 38px;
    }
  `,
})
export class ShareLink {
  readonly t = t;
  readonly url = input.required<string>();
  readonly title = input('When');
  /** Only the copy button, for tight spots like the title row. */
  readonly compact = input(false);
  private readonly snack = inject(MatSnackBar);
  readonly canShare = canShare;

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.snack.open(t('Link copied – send it to your group'), undefined, { duration: 2500 });
    } catch {
      this.snack.open(t('Could not copy. Long-press the link to copy it.'), undefined, {
        duration: 3000,
      });
    }
  }

  async share(): Promise<void> {
    const done = await shareOrCopy({
      title: this.title(),
      text: t('When are you free? Mark your times here:'),
      url: this.url(),
    });
    if (done === 'copied') {
      this.snack.open(t('Link copied – send it to your group'), undefined, { duration: 2500 });
    }
  }
}
