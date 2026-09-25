import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
  { path: 'e/:id', loadComponent: () => import('./pages/event/event').then((m) => m.EventPage) },
  { path: '**', redirectTo: '' },
];
