import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { Welcome } from './welcome';

describe('Welcome', () => {
  let navigated: string[];

  function create(next: string | undefined) {
    navigated = [];
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(JSON.stringify({ googleClientId: '' }))),
    );
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockImplementation((url) => {
      navigated.push(String(url));
      return Promise.resolve(true);
    });
    const fixture = TestBed.createComponent(Welcome);
    // The router passes the query parameter, or undefined when there is none.
    fixture.componentRef.setInput('next', next);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('continues to the app as a guest when there is nowhere else to go', () => {
    create(undefined).guest();
    expect(TestBed.inject(Auth).user()).toEqual({ kind: 'guest' });
    expect(navigated).toEqual(['/']);
  });

  it('continues to the When the person was heading to', () => {
    create('/e/abc123').guest();
    expect(navigated).toEqual(['/e/abc123']);
  });

  it('does not leave the app or loop back to itself', () => {
    create('//evil.example').guest();
    create('/welcome?next=%2F').guest();
    expect(navigated).toEqual(['/']);
  });
});
