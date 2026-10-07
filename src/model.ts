import { fakerEN_GB as faker } from '@faker-js/faker';

export interface Address {
  street: string;
  locality: string;
  city: string;
  county: string;
  postcode: string;
}

export interface AccountProfile {
  electricityPoint: string;
  gasPoint: string;
  electricityMeter: string;
  gasMeter: string;
  electricityRate: string;
  electricityNightRate: string;
  electricityStandingRate: string;
  gasRate: string;
  gasStandingRate: string;
  annualDay: string;
  annualNight: string;
  annualGas: string;
  monthlyDirectDebit: string;
  collectionDay: string;
  rotaBlockLetter: string;
}

export interface Draft {
  title: string;
  name: string;
  account: string;
  mailing: Address;
  sameAddress: boolean;
  supply: Address;
  issueDate: string;
  periodStart: string;
  periodEnd: string;
  samePeriod: boolean;
  accountStart: string;
  accountEnd: string;
  autoReadings: boolean;
  readingStart: string;
  readingEnd: string;
  fixed: AccountProfile;
  seed: number;
}

export const dateValue = (value: string) => Date.parse(`${value}T00:00:00Z`);
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (value: string, days: number) => isoDate(new Date(dateValue(value) + days * 86400000));
export const periodDays = (start: string, end: string) => Math.round((dateValue(end) - dateValue(start)) / 86400000) + 1;
export const formatDate = (value: string, long = false) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(dateValue(value)));
export const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;
export const balanceText = (pence: number) => `${money(Math.abs(pence))} ${pence < 0 ? 'DR' : 'CR'}`;
export const newSeed = () => Math.floor(Math.random() * 2147483646) + 1;
// SP Energy Networks: 18 load blocks A–U, excluding F, I and O.
export const ROTA_BLOCK_LETTERS = ['A', 'B', 'C', 'D', 'E', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U'] as const;

// Synthetic monthly shares, not a measured weather forecast. Each profile totals 100%.
const ELECTRICITY_MONTHLY_SHARES = [10, 9, 9, 8, 8, 7, 7, 7, 7, 9, 9, 10];
const GAS_MONTHLY_SHARES = [16, 14, 12, 8, 5, 3, 2, 2, 4, 8, 11, 15];

function usageBetween(start: string, endExclusive: string, annualUsage: number, shares: number[]) {
  let cursor = dateValue(start);
  const end = dateValue(endExclusive);
  let usage = 0;
  while (cursor < end) {
    const date = new Date(cursor);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const nextMonth = Date.UTC(year, month + 1, 1);
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const segmentEnd = Math.min(nextMonth, end);
    usage += annualUsage * shares[month] / 100 * ((segmentEnd - cursor) / 86400000) / daysInMonth;
    cursor = segmentEnd;
  }
  return usage;
}

// Integer tenth-units × milli-pence, rounded to whole pence (including .5 ties).
export const usageCharge = (usage: number, rate: number) => Math.floor((Math.round(usage * 10) * Math.round(rate * 1000) + 5000) / 10000);
const vatCharge = (subtotal: number) => Math.floor((subtotal * 5 + 50) / 100);
const annualCost = (usage: number, rate: number, standing: number) => {
  const subtotal = usageCharge(usage, rate) + usageCharge(365, standing);
  return subtotal + vatCharge(subtotal);
};
const annualElectricityCostFor = (day: number, night: number, rate: number, standing: number, nightRate = rate) => {
  const subtotal = usageCharge(day, rate) + usageCharge(night, nightRate) + usageCharge(365, standing);
  return subtotal + vatCharge(subtotal);
};

const MPAN_WEIGHTS = [3, 5, 7, 13, 17, 19, 23, 29, 31, 37, 41, 43];
export function mpanCheckDigit(firstTwelve: string) {
  if (!/^\d{12}$/.test(firstTwelve)) throw new Error('MPAN core requires twelve digits before its check digit');
  return String(firstTwelve.split('').reduce((sum, digit, index) => sum + Number(digit) * MPAN_WEIGHTS[index], 0) % 11 % 10);
}

// Regions for the prototype's bundled sample cities; other addresses retain a sample region.
const SAMPLE_REGIONS: Record<string, string> = { derby: '11', manchester: '16', birmingham: '14', bristol: '22', leeds: '23', london: '12' };

// Only called when creating/migrating a customer, never when changing the bill's sample seed.
export function createAccountProfile(seed: number, city: string): AccountProfile {
  faker.seed(seed);
  const int = (min: number, max: number) => faker.number.int({ min, max });
  const rate = int(23000, 29000) / 1000;
  const electricityStanding = int(48000, 62000) / 1000;
  const gasRate = int(5000, 7200) / 1000;
  const gasStanding = int(26000, 34000) / 1000;
  // Ofgem 2026 multi-register/gas TDCVs; modest variation for the initial sample only.
  const roll = int(1, 100);
  const household = roll <= 25 ? { electricity: 1900, gas: 6000 }
    : roll <= 85 ? { electricity: 3400, gas: 9500 } : { electricity: 6100, gas: 14000 };
  const scale = int(85, 115) / 100;
  const night = Math.round(household.electricity * scale * int(35, 45) / 100 * 10) / 10;
  const day = Math.round((household.electricity * scale - night) * 10) / 10;
  const gas = Math.round(household.gas * scale);
  const annual = annualElectricityCostFor(day, night, rate, electricityStanding) + annualCost(gas, gasRate, gasStanding);
  const monthlyPence = Math.round(annual / 12 * int(95, 105) / 100 / 10) * 10;
  const core = (SAMPLE_REGIONS[city.trim().toLowerCase()] ?? '11') + faker.string.numeric(10);
  return {
    electricityPoint: core + mpanCheckDigit(core), gasPoint: String(int(1000000000, 7999999999)),
    electricityMeter: `16P${faker.string.numeric(7)}`, gasMeter: `G4P${faker.string.numeric(11)}`,
    electricityRate: rate.toFixed(3), electricityNightRate: rate.toFixed(3),
    electricityStandingRate: electricityStanding.toFixed(3), gasRate: gasRate.toFixed(3), gasStandingRate: gasStanding.toFixed(3),
    annualDay: day.toFixed(1), annualNight: night.toFixed(1), annualGas: String(gas),
    monthlyDirectDebit: (monthlyPence / 100).toFixed(2), collectionDay: String(int(1, 28)),
    rotaBlockLetter: '',
  };
}

export function defaultDraft(): Draft {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = isoDate(new Date(Date.UTC(year, month - 1, 1)));
  const end = isoDate(new Date(Date.UTC(year, month, 0)));
  const address = { street: '95 Penzance Road', locality: 'Alvaston', city: 'Derby', county: 'Derbyshire', postcode: 'DE24 0NJ' };
  const seed = newSeed();
  return {
    title: 'Miss', name: 'Charlotte Bunting', account: 'A-03B61D17', mailing: address,
    sameAddress: true, supply: { ...address }, issueDate: isoDate(new Date(Date.UTC(year, month, 1))),
    periodStart: start, periodEnd: end, samePeriod: true, accountStart: start, accountEnd: end,
    autoReadings: true, readingStart: start, readingEnd: addDays(end, 1), fixed: { ...createAccountProfile(seed, address.city), rotaBlockLetter: 'Q' }, seed,
  };
}

export function effectiveDraft(draft: Draft): Draft {
  return {
    ...draft,
    supply: draft.sameAddress ? { ...draft.mailing } : { ...draft.supply },
    accountStart: draft.samePeriod ? draft.periodStart : draft.accountStart,
    accountEnd: draft.samePeriod ? draft.periodEnd : draft.accountEnd,
    readingStart: draft.autoReadings ? draft.periodStart : draft.readingStart,
    readingEnd: draft.autoReadings ? addDays(draft.periodEnd, 1) : draft.readingEnd,
  };
}

export function validateDraft(raw: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  const required = (key: string, value: string, label: string) => { if (!value.trim()) errors[key] = `请填写${label}`; };
  required('name', raw.name, '客户姓名');
  required('account', raw.account, '账户号码');
  if (raw.fixed.rotaBlockLetter !== '' && !ROTA_BLOCK_LETTERS.includes(raw.fixed.rotaBlockLetter as typeof ROTA_BLOCK_LETTERS[number])) {
    errors['fixed.rotaBlockLetter'] = '请选择有效轮换区块字母，未确认时留空';
  }
  for (const group of raw.sameAddress ? ['mailing'] as const : ['mailing', 'supply'] as const) {
    required(`${group}.street`, raw[group].street, '街道地址');
    required(`${group}.city`, raw[group].city, '城市');
    required(`${group}.postcode`, raw[group].postcode, '邮编');
    if (/[\r\n,]/.test(raw[group].postcode)) errors[`${group}.postcode`] = '邮编不能包含逗号或换行';
  }
  if (!/^\d{13}$/.test(raw.fixed.electricityPoint) || mpanCheckDigit(raw.fixed.electricityPoint.slice(0, 12)) !== raw.fixed.electricityPoint.slice(-1)) {
    errors['fixed.electricityPoint'] = '请输入 13 位 MPAN，末位校验需正确';
  }
  if (!/^\d{6,10}$/.test(raw.fixed.gasPoint)) errors['fixed.gasPoint'] = '请输入 6–10 位数字 MPRN';
  for (const key of ['electricityMeter', 'gasMeter'] as const) {
    if (!raw.fixed[key].trim() || raw.fixed[key].length > 32) errors[`fixed.${key}`] = '请输入表号，最长 32 个字符';
  }
  const decimal = (key: keyof AccountProfile, precision: number, maximum: number) => {
    const value = raw.fixed[key];
    const pattern = precision === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`);
    if (!pattern.test(value) || !Number.isFinite(Number(value)) || Number(value) > maximum) {
      errors[`fixed.${key}`] = `请输入 0–${maximum} 的数值${precision ? `，最多 ${precision} 位小数` : '，须为整数'}`;
    }
  };
  for (const key of ['electricityRate', 'electricityNightRate', 'electricityStandingRate', 'gasRate', 'gasStandingRate'] as const) decimal(key, 3, 10000);
  for (const key of ['annualDay', 'annualNight'] as const) decimal(key, 1, 1000000);
  decimal('annualGas', 0, 1000000);
  decimal('monthlyDirectDebit', 2, 100000);
  if (!/^\d{1,2}$/.test(raw.fixed.collectionDay) || Number(raw.fixed.collectionDay) < 1 || Number(raw.fixed.collectionDay) > 28) errors['fixed.collectionDay'] = '扣款日请选择每月 1–28 日';
  const dates = ['issueDate', 'periodStart', 'periodEnd',
    ...(!raw.samePeriod ? ['accountStart', 'accountEnd'] : []),
    ...(!raw.autoReadings ? ['readingStart', 'readingEnd'] : []),
  ] as (keyof Draft)[];
  for (const key of dates) {
    const value = String(raw[key]);
    const timestamp = dateValue(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp)
      || isoDate(new Date(timestamp)) !== value || value < '1900-01-01' || value > '9998-12-31') errors[key] = '请选择有效日期';
  }
  if (Object.keys(errors).some(key => dates.includes(key as keyof Draft))) return errors;
  const draft = effectiveDraft(raw);
  if (draft.periodEnd < draft.periodStart) errors.periodEnd = '计费结束日期不能早于开始日期';
  if (periodDays(draft.periodStart, draft.periodEnd) > 366) errors.periodEnd = '原型支持最长 366 天的计费区间';
  if (!raw.samePeriod && draft.accountEnd < draft.accountStart) errors.accountEnd = '结算结束日期不能早于开始日期';
  if (!raw.samePeriod && periodDays(draft.accountStart, draft.accountEnd) > 366) errors.accountEnd = '原型支持最长 366 天的结算区间';
  if (draft.issueDate < draft.periodEnd || draft.issueDate < draft.accountEnd) errors.issueDate = '出账日期不能早于计费或结算结束日期';
  if (!raw.autoReadings && draft.readingEnd <= draft.readingStart) errors.readingEnd = '结束抄表日期须晚于开始抄表日期';
  if (!raw.autoReadings && periodDays(draft.readingStart, draft.readingEnd) - 1 > 366) errors.readingEnd = '原型支持最长 366 天的抄表区间';
  if (!raw.autoReadings && !errors.readingEnd && !errors.periodEnd
    && periodDays(draft.readingStart, draft.readingEnd) - 1 !== periodDays(draft.periodStart, draft.periodEnd)) errors.readingEnd = '原型中抄表区间天数须与计费天数一致';
  if (!raw.autoReadings && (Math.abs(dateValue(draft.readingStart) - dateValue(draft.periodStart)) > 86400000)) errors.readingStart = '原型中抄表开始日与计费开始日最多相差一天';
  if (draft.readingEnd > draft.issueDate) errors.issueDate = '出账日期不能早于结束抄表日期';
  return errors;
}

export function mockBill(raw: Draft) {
  const draft = effectiveDraft(raw);
  faker.seed(draft.seed);
  const int = (min: number, max: number) => faker.number.int({ min, max });
  const one = (n: number) => Math.round(n * 10) / 10;
  const days = periodDays(draft.periodStart, draft.periodEnd);
  const readingDays = periodDays(draft.readingStart, draft.readingEnd) - 1;
  // Bill-only variation: nearby monthly usage samples, preserving each annual total.
  const sampleShares = (base: number[]) => {
    const weights = base.map(weight => weight * int(90, 110) / 100);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return weights.map(weight => weight * 100 / total);
  };
  const electricityShares = sampleShares(ELECTRICITY_MONTHLY_SHARES);
  const gasShares = sampleShares(GAS_MONTHLY_SHARES);
  const electricityRate = Number(draft.fixed.electricityRate);
  const electricityNightRate = Number(draft.fixed.electricityNightRate);
  const electricityStandingRate = Number(draft.fixed.electricityStandingRate);
  const gasRate = Number(draft.fixed.gasRate);
  const gasStandingRate = Number(draft.fixed.gasStandingRate);
  const annualDay = Number(draft.fixed.annualDay);
  const annualNight = Number(draft.fixed.annualNight);
  const annualElectricity = one(annualDay + annualNight);
  const annualGas = Number(draft.fixed.annualGas);
  const dayStart = int(100000, 280000) / 10;
  const nightStart = int(10000, 60000) / 10;
  const gasStart = int(25000, 80000) / 10;
  const dayUsed = one(usageBetween(draft.readingStart, draft.readingEnd, annualDay, electricityShares));
  const nightUsed = one(usageBetween(draft.readingStart, draft.readingEnd, annualNight, electricityShares));
  const correction = 1.02264;
  const calorific = int(385, 405) / 10;
  const gasTargetKwh = usageBetween(draft.readingStart, draft.readingEnd, annualGas, gasShares);
  const gasUnits = one(gasTargetKwh * 3.6 / (correction * calorific));
  const gasKwh = one(gasUnits * correction * calorific / 3.6);
  // All charges are integer pence. Round line items, then calculate VAT per fuel.
  const dayCharge = usageCharge(dayUsed, electricityRate);
  const nightCharge = usageCharge(nightUsed, electricityNightRate);
  const electricityStanding = usageCharge(days, electricityStandingRate);
  const electricitySubtotal = dayCharge + nightCharge + electricityStanding;
  const electricityVat = vatCharge(electricitySubtotal);
  const electricityTotal = electricitySubtotal + electricityVat;
  const gasCharge = usageCharge(gasKwh, gasRate);
  const gasStanding = usageCharge(days, gasStandingRate);
  const gasSubtotal = gasCharge + gasStanding;
  const gasVat = vatCharge(gasSubtotal);
  const gasTotal = gasSubtotal + gasVat;
  const total = electricityTotal + gasTotal;
  const openingBalance = int(-6000, 12000);
  const annualElectricityCost = annualElectricityCostFor(annualDay, annualNight, electricityRate, electricityStandingRate, electricityNightRate);
  const annualGasCost = annualCost(annualGas, gasRate, gasStandingRate);
  const monthlyDirectDebit = Math.round(Number(draft.fixed.monthlyDirectDebit) * 100);
  const collectionDay = Number(draft.fixed.collectionDay);
  const payments: { date: string; amount: number }[] = [];
  let month = new Date(dateValue(draft.accountStart));
  month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  while (isoDate(month) <= draft.accountEnd) {
    const date = isoDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), collectionDay)));
    if (date >= draft.accountStart && date <= draft.accountEnd && monthlyDirectDebit > 0) payments.push({ date, amount: monthlyDirectDebit });
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  }
  const payment = payments.reduce((sum, record) => sum + record.amount, 0);
  const closingBalance = openingBalance + payment - total;
  const similarElectricityDiscount = int(94, 97) / 100;
  const bestElectricityDiscount = int(94, 97) / 100;
  const similarElectricityRate = Math.floor(electricityRate * 1000 * similarElectricityDiscount) / 1000;
  const bestElectricityRate = Math.floor(similarElectricityRate * 1000 * bestElectricityDiscount) / 1000;
  const similarElectricityNightRate = Math.floor(electricityNightRate * 1000 * similarElectricityDiscount) / 1000;
  const bestElectricityNightRate = Math.floor(similarElectricityNightRate * 1000 * bestElectricityDiscount) / 1000;
  const similarGasRate = Math.floor(gasRate * 1000 * int(94, 97) / 100) / 1000;
  const bestGasRate = Math.floor(similarGasRate * 1000 * int(94, 97) / 100) / 1000;
  const similarAnnualElectricityCost = annualElectricityCostFor(annualDay, annualNight, similarElectricityRate, electricityStandingRate, similarElectricityNightRate);
  const bestAnnualElectricityCost = annualElectricityCostFor(annualDay, annualNight, bestElectricityRate, electricityStandingRate, bestElectricityNightRate);
  const similarAnnualGasCost = annualCost(annualGas, similarGasRate, gasStandingRate);
  const bestAnnualGasCost = annualCost(annualGas, bestGasRate, gasStandingRate);
  return {
    days, readingDays, reference: String(int(100000000, 999999999)),
    electricityPoint: draft.fixed.electricityPoint, gasPoint: draft.fixed.gasPoint,
    electricityMeter: draft.fixed.electricityMeter.trim(), gasMeter: draft.fixed.gasMeter.trim(),
    rotaBlockLetter: draft.fixed.rotaBlockLetter,
    electricityRate, electricityNightRate, electricityStandingRate, gasRate, gasStandingRate,
    dayStart, dayEnd: one(dayStart + dayUsed), nightStart, nightEnd: one(nightStart + nightUsed),
    gasStart, gasEnd: one(gasStart + gasUnits), dayUsed, nightUsed, gasUnits, gasKwh, correction, calorific,
    dayCharge, nightCharge, electricityStanding, electricitySubtotal, electricityVat, electricityTotal,
    gasCharge, gasStanding, gasSubtotal, gasVat, gasTotal, total,
    openingBalance, payment, closingBalance, monthlyDirectDebit, collectionDay, payments,
    householdLevel: annualElectricity < 2500 ? 'low' : annualElectricity < 4500 ? 'medium' : 'high', annualElectricity, annualDay, annualNight, annualGas, annualElectricityCost, annualGasCost,
    similarElectricityRate, bestElectricityRate, similarElectricityNightRate, bestElectricityNightRate, similarGasRate, bestGasRate,
    similarAnnualElectricityCost, bestAnnualElectricityCost, similarAnnualGasCost, bestAnnualGasCost,
    electricitySaving: annualElectricityCost - similarAnnualElectricityCost,
    electricityBestSaving: annualElectricityCost - bestAnnualElectricityCost,
    gasSaving: annualGasCost - similarAnnualGasCost,
    gasBestSaving: annualGasCost - bestAnnualGasCost,
  };
}

export function sampleCustomer() {
  const samples = [
    { street: '24 Willow Crescent', locality: 'Didsbury', city: 'Manchester', county: 'Greater Manchester', postcode: 'M20 6PH' },
    { street: '108 Victoria Road', locality: 'Kings Heath', city: 'Birmingham', county: 'West Midlands', postcode: 'B14 7AB' },
    { street: '7 Meadow Lane', locality: 'Clifton', city: 'Bristol', county: 'Bristol', postcode: 'BS8 2EZ' },
  ];
  faker.seed(newSeed());
  const sex = faker.helpers.arrayElement(['male', 'female'] as const);
  const title = faker.helpers.arrayElement(sex === 'male' ? ['Mr', 'Dr'] : ['Ms', 'Mrs', 'Miss', 'Dr']);
  return {
    title,
    name: `${faker.person.firstName(sex)} ${faker.person.lastName()}`, account: `A-${faker.string.hexadecimal({ length: 8, prefix: '', casing: 'upper' })}`,
    mailing: { ...faker.helpers.arrayElement(samples) },
  };
}
