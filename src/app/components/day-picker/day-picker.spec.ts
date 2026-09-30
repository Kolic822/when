import { TestBed } from '@angular/core/testing';
import { addDays, startOfWeek, toDateKey } from '../../core/time';
import { DayPicker } from './day-picker';

describe('DayPicker', () => {
  const thisWeek = startOfWeek(toDateKey(new Date()));

  function create(): DayPicker {
    const fixture = TestBed.createComponent(DayPicker);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('starts on the current week', () => {
    expect(create().start()).toBe(thisWeek);
  });

  it('moves four weeks forward and back with the arrows', () => {
    const picker = create();
    picker.shift(1);
    expect(picker.start()).toBe(addDays(thisWeek, 28));
    picker.shift(1);
    expect(picker.start()).toBe(addDays(thisWeek, 56));
    picker.shift(-1);
    expect(picker.start()).toBe(addDays(thisWeek, 28));
  });

  it('never goes back past this week', () => {
    const picker = create();
    picker.shift(-1);
    expect(picker.start()).toBe(thisWeek);
    expect(picker.atStart()).toBe(true);
  });

  it('jumps back to today from the title', () => {
    const picker = create();
    picker.shift(1);
    picker.goToday();
    expect(picker.start()).toBe(thisWeek);
  });
});
