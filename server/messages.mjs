/** Notification texts in the languages the app speaks. `{name}` placeholders are filled in. */
const TEXTS = {
  en: {
    everyone: 'Everyone has answered · {title}',
    possible_one: '{n} possible session. Time to book one.',
    possible_other: '{n} possible sessions. Time to book one.',
    none_fit: 'No session fits everyone yet.',
    booked: '{title} is booked',
    moved: '{title} moved',
    now: 'Now {session}',
    another: '{title}: another session booked',
    unbooked: '{title} is no longer booked',
    cancelled_body: 'The organiser cancelled the session.',
    one_cancelled: '{title}: a session was cancelled',
    answered: '{name} answered · {title}',
    changed: '{name} changed their answer · {title}',
    withdrew: '{name} withdrew their answer · {title}',
    works: 'Works for them: {sessions}',
    none_work: 'None of the sessions work for them.',
    planned_with: 'Planned with When: {url}',
  },
  de: {
    everyone: 'Alle haben geantwortet · {title}',
    possible_one: '{n} möglicher Termin. Zeit, einen festzulegen.',
    possible_other: '{n} mögliche Termine. Zeit, einen festzulegen.',
    none_fit: 'Noch passt kein Termin für alle.',
    booked: '{title} ist festgelegt',
    moved: '{title} wurde verschoben',
    now: 'Jetzt {session}',
    another: '{title}: ein weiterer Termin festgelegt',
    unbooked: '{title} ist nicht mehr festgelegt',
    cancelled_body: 'Der Organisator hat den Termin abgesagt.',
    one_cancelled: '{title}: ein Termin wurde abgesagt',
    answered: '{name} hat geantwortet · {title}',
    changed: '{name} hat die Antwort geändert · {title}',
    withdrew: '{name} hat die Antwort zurückgezogen · {title}',
    works: 'Passt: {sessions}',
    none_work: 'Keiner der Termine passt.',
    planned_with: 'Geplant mit When: {url}',
  },
  hr: {
    everyone: 'Svi su odgovorili · {title}',
    possible_one: '{n} mogući termin. Vrijeme je da se jedan potvrdi.',
    possible_few: '{n} moguća termina. Vrijeme je da se jedan potvrdi.',
    possible_other: '{n} mogućih termina. Vrijeme je da se jedan potvrdi.',
    none_fit: 'Još nijedan termin ne odgovara svima.',
    booked: '{title}: termin je potvrđen',
    moved: '{title}: termin je pomaknut',
    now: 'Sada {session}',
    another: '{title}: potvrđen još jedan termin',
    unbooked: '{title}: termin više nije potvrđen',
    cancelled_body: 'Organizator je otkazao termin.',
    one_cancelled: '{title}: jedan termin je otkazan',
    answered: '{name}: stigao je odgovor · {title}',
    changed: '{name}: odgovor je promijenjen · {title}',
    withdrew: '{name}: odgovor je povučen · {title}',
    works: 'Odgovara: {sessions}',
    none_work: 'Nijedan termin ne odgovara.',
    planned_with: 'Planirano uz When: {url}',
  },
};

const LOCALES = { en: 'en-GB', de: 'de-DE', hr: 'hr-HR' };

export const cleanLang = (lang) => (lang in TEXTS ? lang : 'en');
export const localeOf = (lang) => LOCALES[cleanLang(lang)];

/** A text in the given language; `count` picks the grammatical form when the key has several. */
export function say(lang, key, params = {}, count) {
  const texts = TEXTS[cleanLang(lang)];
  let text = texts[key];
  if (count !== undefined) {
    const form = new Intl.PluralRules(localeOf(lang)).select(count);
    text = texts[`${key}_${form}`] ?? texts[`${key}_other`];
  }
  return (text ?? key).replace(/\{(\w+)\}/g, (whole, name) => String(params[name] ?? whole));
}
