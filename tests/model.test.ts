import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, balanceText, createAccountProfile, defaultDraft, effectiveDraft, mockBill, mpanCheckDigit, periodDays, ROTA_BLOCK_LETTERS, usageCharge, validateDraft } from '../src/model.ts';

function fixture(seed = 42) {
  return { ...defaultDraft(), periodStart: '2026-09-01', periodEnd: '2026-09-30', issueDate: '2026-10-01', fixed: createAccountProfile(seed, 'Derby'), seed };
}

test('the same saved draft reproduces exactly the same mock bill', () => {
  const draft = fixture();
  assert.deepEqual(mockBill(draft), mockBill(structuredClone(draft)));
  assert.deepEqual(mockBill(draft), mockBill({ ...draft, name: 'New Customer', mailing: { ...draft.mailing, street: 'New Street' } }));
  assert.notDeepEqual(mockBill(draft), mockBill({ ...draft, seed: 43 }));
});

test('line items, VAT, fuel totals and account balance reconcile across varied seeds', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const bill = mockBill(fixture(seed));
    assert.equal(bill.electricitySubtotal, bill.dayCharge + bill.nightCharge + bill.electricityStanding);
    assert.equal(bill.gasSubtotal, bill.gasCharge + bill.gasStanding);
    assert.equal(bill.total, bill.electricitySubtotal + bill.gasSubtotal + bill.electricityVat + bill.gasVat);
    assert.equal(bill.closingBalance - bill.openingBalance, bill.payment - bill.total);
    assert.ok(Math.abs(bill.dayEnd - bill.dayStart - bill.dayUsed) < 1e-8);
    assert.ok(Math.abs(bill.nightEnd - bill.nightStart - bill.nightUsed) < 1e-8);
    assert.ok(Math.abs(bill.gasEnd - bill.gasStart - bill.gasUnits) < 1e-8);
    assert.ok(Math.abs(bill.gasKwh - bill.gasUnits * bill.correction * bill.calorific / 3.6) <= .05);
    assert.ok([bill.dayCharge, bill.nightCharge, bill.electricityVat, bill.gasVat, bill.total].every(Number.isInteger));
  }
});

test('linked dates support inclusive billing, leap years and year boundaries', () => {
  assert.equal(periodDays('2024-02-01', '2024-02-29'), 29);
  assert.equal(periodDays('2026-09-01', '2026-09-01'), 1);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const draft = effectiveDraft(fixture());
  assert.equal(draft.readingStart, '2026-09-01');
  assert.equal(draft.readingEnd, '2026-10-01');
  assert.equal(draft.accountStart, draft.periodStart);
  assert.equal(mockBill(fixture()).days, 30);
  assert.equal(mockBill(fixture()).readingDays, 30);
});

test('manual addresses and date intervals remain independent', () => {
  const draft = effectiveDraft({ ...fixture(), sameAddress: false, supply: { street: '7 New Road', locality: '', city: 'Leeds', county: '', postcode: 'LS1 1AA' },
    samePeriod: false, accountStart: '2026-08-31', accountEnd: '2026-09-29', autoReadings: false, readingStart: '2026-08-31', readingEnd: '2026-09-30' });
  assert.equal(draft.supply.city, 'Leeds');
  assert.equal(draft.mailing.city, 'Derby');
  assert.equal(draft.accountStart, '2026-08-31');
  assert.equal(draft.readingEnd, '2026-09-30');
  assert.deepEqual(validateDraft(draft), {});
});

test('invalid dates and missing required fields prevent report generation', () => {
  assert.deepEqual(validateDraft(fixture()), {});
  assert.ok(validateDraft({ ...fixture(), name: ' ' }).name);
  assert.ok(validateDraft({ ...fixture(), periodEnd: '2026-08-30' }).periodEnd);
  assert.ok(validateDraft({ ...fixture(), issueDate: '2026-09-29' }).issueDate);
  assert.ok(validateDraft({ ...fixture(), periodStart: '' }).periodStart);
  assert.ok(validateDraft({ ...fixture(), periodStart: '2026-02-31' }).periodStart);
  assert.ok(validateDraft({ ...fixture(), autoReadings: false, readingStart: '2026-09-01', readingEnd: '2026-09-01' }).readingEnd);
  assert.ok(validateDraft({ ...fixture(), periodStart: '2024-01-01' }).periodEnd);
  assert.ok(validateDraft({ ...fixture(), sameAddress: false, supply: { ...fixture().supply, city: '' } })['supply.city']);
  assert.ok(validateDraft({ ...fixture(), issueDate: '2026-09-30' }).issueDate);
  assert.ok(validateDraft({ ...fixture(), autoReadings: false, readingStart: '2026-09-01', readingEnd: '2026-09-20' }).readingEnd);
  assert.ok(validateDraft({ ...fixture(), autoReadings: false, readingStart: '2026-10-01', readingEnd: '2026-10-31' }).readingStart);
  assert.ok(validateDraft({ ...fixture(), samePeriod: false, accountStart: '2024-01-01', accountEnd: '2026-09-30' }).accountEnd);
});

test('a full calendar year matches annual usage, including leap years', () => {
  for (const year of [2024, 2026]) {
    const bill = mockBill({ ...fixture(), periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`, issueDate: `${year + 1}-01-01` });
    assert.ok(Math.abs(bill.dayUsed - bill.annualDay) < 1e-8);
    assert.ok(Math.abs(bill.nightUsed - bill.annualNight) < 1e-8);
    if (year === 2026) assert.equal(bill.electricityTotal, bill.annualElectricityCost);
    // Meter resolution introduces at most half a cubic tenth metre of gas conversion error.
    assert.ok(Math.abs(bill.gasKwh - bill.annualGas) <= .65);
  }
});

test('winter gas usage exceeds summer for the same household, with stable rates and identity', () => {
  const winter = mockBill({ ...fixture(), periodStart: '2026-01-01', periodEnd: '2026-01-31', issueDate: '2026-02-01' });
  const summer = mockBill({ ...fixture(), periodStart: '2026-07-01', periodEnd: '2026-07-31', issueDate: '2026-08-01' });
  assert.ok(winter.gasKwh > summer.gasKwh * 5);
  assert.equal(winter.annualGas, summer.annualGas);
  assert.equal(winter.gasRate, summer.gasRate);
  assert.equal(winter.monthlyDirectDebit, summer.monthlyDirectDebit);
  assert.equal(winter.reference, summer.reference);
  assert.equal(winter.electricityPoint, summer.electricityPoint);
});

test('monthly deductions are scheduled within the settlement period, and reconcile', () => {
  const draft = fixture();
  const full = mockBill({ ...draft, periodStart: '2026-01-01', periodEnd: '2026-12-31', issueDate: '2027-01-01' });
  assert.equal(full.payments.length, 12);
  assert.equal(full.payment, full.monthlyDirectDebit * 12);
  for (const payment of full.payments) {
    assert.equal(Number(payment.date.slice(-2)), full.collectionDay);
    assert.equal(payment.amount, full.monthlyDirectDebit);
  }
  const monthly = mockBill(draft);
  assert.equal(monthly.payments.length, 1);
  const onlyDay = `${draft.periodStart.slice(0, 8)}${String(monthly.collectionDay).padStart(2, '0')}`;
  const onDay = mockBill({ ...draft, periodStart: onlyDay, periodEnd: onlyDay });
  assert.equal(onDay.payment, monthly.monthlyDirectDebit);
  const offDay = monthly.collectionDay === 1 ? '2026-09-02' : '2026-09-01';
  const noPayment = mockBill({ ...draft, periodStart: offDay, periodEnd: offDay });
  assert.equal(noPayment.payments.length, 0);
  assert.equal(noPayment.payment, 0);
});

test('varied seeds cover low/high households, credit/debit and actual tariff savings', () => {
  const levels = new Set<string>();
  const balanceSigns = new Set<number>();
  for (let seed = 1; seed <= 500; seed++) {
    const bill = mockBill(fixture(seed));
    levels.add(bill.householdLevel);
    balanceSigns.add(Math.sign(bill.closingBalance));
    assert.ok(bill.annualElectricity >= 1615 && bill.annualElectricity <= 7015);
    assert.ok(bill.annualGas >= 5100 && bill.annualGas <= 16100);
    assert.ok(bill.similarElectricityRate < bill.electricityRate);
    assert.ok(bill.bestElectricityRate < bill.similarElectricityRate);
    assert.equal(bill.electricitySaving, bill.annualElectricityCost - bill.similarAnnualElectricityCost);
    assert.equal(bill.electricityBestSaving, bill.annualElectricityCost - bill.bestAnnualElectricityCost);
    assert.equal(bill.gasSaving, bill.annualGasCost - bill.similarAnnualGasCost);
    assert.equal(bill.gasBestSaving, bill.annualGasCost - bill.bestAnnualGasCost);
    assert.ok(bill.electricityBestSaving > bill.electricitySaving && bill.gasBestSaving > bill.gasSaving);
    assert.ok(Math.abs(bill.monthlyDirectDebit * 12 / (bill.annualElectricityCost + bill.annualGasCost) - 1) <= .051);
  }
  assert.deepEqual([...levels].sort(), ['high', 'low', 'medium']);
  assert.ok(balanceSigns.has(-1) && balanceSigns.has(1));
  assert.equal(balanceText(-1234), '£12.34 DR');
  assert.equal(balanceText(1234), '£12.34 CR');
  assert.equal(balanceText(0), '£0.00 CR');
});

test('MPAN check digits and numeric formats match the sample regions', () => {
  assert.equal(mpanCheckDigit('110001000522'), '6');
  for (let seed = 1; seed <= 100; seed++) {
    const bill = mockBill(fixture(seed));
    assert.match(bill.electricityPoint, /^11\d{11}$/);
    assert.equal(mpanCheckDigit(bill.electricityPoint.slice(0, 12)), bill.electricityPoint.slice(-1));
    assert.match(bill.gasPoint, /^[1-7]\d{9}$/);
  }
  const manchester = mockBill({ ...fixture(), fixed: createAccountProfile(42, 'Manchester'), mailing: { ...fixture().mailing, city: 'Manchester' } });
  assert.equal(manchester.electricityPoint.slice(0, 2), '16');
});

test('penny rounding uses the displayed precision and rounds half-pence upward', () => {
  assert.equal(usageCharge(0.1, 24.999), 2);
  assert.equal(usageCharge(0.1, 25), 3);
  assert.equal(usageCharge(0.1, 25.001), 3);
  assert.equal(usageCharge(201.9, 5.617), 1134);
});

test('changing the bill seed preserves all customer supply and payment settings', () => {
  const draft = fixture();
  const original = structuredClone(draft.fixed);
  const first = mockBill(draft);
  const second = mockBill({ ...draft, seed: 12345 });
  const stable = ['electricityPoint', 'gasPoint', 'electricityMeter', 'gasMeter', 'electricityRate', 'electricityNightRate',
    'electricityStandingRate', 'gasRate', 'gasStandingRate', 'annualDay', 'annualNight', 'annualGas', 'monthlyDirectDebit', 'collectionDay',
    'annualElectricityCost', 'annualGasCost', 'rotaBlockLetter'] as const;
  for (const key of stable) assert.equal(first[key], second[key], key);
  assert.notEqual(first.reference, second.reference);
  assert.notEqual(first.dayStart, second.dayStart);
  assert.notEqual(first.openingBalance, second.openingBalance);
  assert.deepEqual(draft.fixed, original);
});

test('manual day/night rates and usage drive charges but do not alter the agreed payment', () => {
  const draft = fixture();
  draft.fixed = { ...draft.fixed, electricityRate: '30.000', electricityNightRate: '10.000',
    electricityStandingRate: '50.000', gasRate: '6.000', gasStandingRate: '30.000',
    annualDay: '2000.0', annualNight: '1000.0', annualGas: '9200', monthlyDirectDebit: '125.50', collectionDay: '15' };
  assert.deepEqual(validateDraft(draft), {});
  const bill = mockBill(draft);
  assert.equal(bill.dayCharge, usageCharge(bill.dayUsed, 30));
  assert.equal(bill.nightCharge, usageCharge(bill.nightUsed, 10));
  assert.equal(bill.monthlyDirectDebit, 12550);
  assert.deepEqual(bill.payments, [{ date: '2026-09-15', amount: 12550 }]);
  const changed = mockBill({ ...draft, fixed: { ...draft.fixed, electricityRate: '35.000' } });
  assert.ok(changed.total > bill.total);
  assert.ok(changed.annualElectricityCost > bill.annualElectricityCost);
  assert.equal(changed.monthlyDirectDebit, bill.monthlyDirectDebit);
});

test('supply field validation catches incomplete values, incorrect identifiers and precision', () => {
  const draft = fixture();
  for (const key of Object.keys(draft.fixed)) {
    if (key === 'rotaBlockLetter') continue;
    const errors = validateDraft({ ...draft, fixed: { ...draft.fixed, [key]: '' } });
    assert.ok(errors[`fixed.${key}`], key);
  }
  assert.ok(validateDraft({ ...draft, fixed: { ...draft.fixed, electricityPoint: '1100010005227' } })['fixed.electricityPoint']);
  assert.ok(validateDraft({ ...draft, fixed: { ...draft.fixed, gasPoint: 'ABC12345' } })['fixed.gasPoint']);
  assert.ok(validateDraft({ ...draft, fixed: { ...draft.fixed, electricityNightRate: '12.3456' } })['fixed.electricityNightRate']);
  assert.ok(validateDraft({ ...draft, fixed: { ...draft.fixed, annualGas: '9200.5' } })['fixed.annualGas']);
  assert.ok(validateDraft({ ...draft, fixed: { ...draft.fixed, monthlyDirectDebit: '-1' } })['fixed.monthlyDirectDebit']);
  assert.ok(validateDraft({ ...draft, fixed: { ...draft.fixed, collectionDay: '29' } })['fixed.collectionDay']);
});

test('rota block is a supply-point setting, supports unknown, and only accepts valid block letters', () => {
  const draft = fixture();
  assert.equal(createAccountProfile(42, 'Manchester').rotaBlockLetter, '');
  assert.equal(defaultDraft().fixed.rotaBlockLetter, 'Q');
  for (const letter of [...ROTA_BLOCK_LETTERS, '']) {
    assert.deepEqual(validateDraft({ ...draft, fixed: { ...draft.fixed, rotaBlockLetter: letter } }), {});
  }
  for (const letter of ['F', 'I', 'O', 'V', 'Z', 'AA']) {
    assert.ok(validateDraft({ ...draft, fixed: { ...draft.fixed, rotaBlockLetter: letter } })['fixed.rotaBlockLetter']);
  }
  const fixed = { ...draft.fixed, rotaBlockLetter: 'R' };
  assert.equal(mockBill({ ...draft, fixed }).rotaBlockLetter, 'R');
  assert.equal(mockBill({ ...draft, fixed, seed: 100 }).rotaBlockLetter, 'R');
});
