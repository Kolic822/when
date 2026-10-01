import { Directive, effect, ElementRef, inject, input, untracked } from '@angular/core';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Folds an element open or shut. The content fades first and the box follows, so nothing
 * reflows mid-animation; while shut, the content is also out of reach for taps and focus.
 * Usage: `<div [appFold]="isOpen()">…</div>`, with the content as the only child.
 */
@Directive({
  selector: '[appFold]',
  host: { '[style.overflow]': '"hidden"' },
})
export class Fold {
  readonly open = input.required<boolean>({ alias: 'appFold' });
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private first = true;
  private running: Animation[] = [];

  constructor() {
    effect(() => {
      const open = this.open();
      untracked(() => this.apply(open));
    });
  }

  private apply(open: boolean): void {
    const el = this.el;
    const inner = el.firstElementChild as HTMLElement | null;
    if (this.first || reducedMotion()) {
      this.first = false;
      el.style.height = open ? '' : '0px';
      el.inert = !open;
      if (inner) inner.style.opacity = open ? '' : '0';
      return;
    }
    for (const a of this.running) a.cancel();
    this.running = [];
    const from = el.getBoundingClientRect().height;
    if (open) {
      el.inert = false;
      el.style.height = '';
      const to = el.scrollHeight;
      el.style.height = `${from}px`;
      if (inner) inner.style.opacity = '0';
      const box = el.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 240,
        easing: EASE,
      });
      const fade = inner?.animate(
        [
          { opacity: 0, transform: 'translateY(-6px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 200, delay: 120, easing: 'ease-out', fill: 'backwards' },
      );
      this.running = fade ? [box, fade] : [box];
      box.finished
        .then(() => {
          el.style.height = '';
        })
        .catch(() => undefined);
      fade?.finished
        .then(() => {
          inner!.style.opacity = '';
        })
        .catch(() => undefined);
    } else {
      el.inert = true;
      const fade = inner?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 120,
        easing: 'ease-in',
        fill: 'forwards',
      });
      const box = el.animate([{ height: `${from}px` }, { height: '0px' }], {
        duration: 220,
        delay: 90,
        easing: EASE,
        fill: 'forwards',
      });
      this.running = fade ? [box, fade] : [box];
      box.finished
        .then(() => {
          el.style.height = '0px';
          if (inner) inner.style.opacity = '0';
          box.cancel();
          fade?.cancel();
        })
        .catch(() => undefined);
    }
  }
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
