import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { Auth } from './core/auth';

/** New devices choose how to come in first, then carry on to where they were heading. */
const entered: CanActivateFn = (_route, state) =>
  inject(Auth).user()
    ? true
    : inject(Router).createUrlTree(['/welcome'], { queryParams: { next: state.url } });

export const routes: Routes = [
  {
    path: 'welcome',
    loadComponent: () => import('./pages/welcome/welcome').then((m) => m.Welcome),
  },
  {
    path: '',
    canActivate: [entered],
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'e/:id',
    canActivate: [entered],
    loadComponent: () => import('./pages/event/event').then((m) => m.EventPage),
  },
  {
    path: 'changes',
    loadComponent: () => import('./pages/changes/changes').then((m) => m.Changes),
  },
  {
    path: 'guide',
    loadComponent: () => import('./pages/guide/guide').then((m) => m.Guide),
  },
  // Someone answering an "Outsource decision" link only needs a name, never an account.
  {
    path: 's/:sid',
    loadComponent: () => import('./pages/shortlist/shortlist').then((m) => m.ShortlistPage),
  },
  { path: '**', redirectTo: '' },
];
