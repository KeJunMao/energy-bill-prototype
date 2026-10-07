import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { buildTariffQrPayloads, qrAnnualPeriod, tariffQrImage } from '../src/tariff-qr.ts';
import { defaultDraft, effectiveDraft, mockBill } from '../src/model.ts';

const originalElectricity = 'DE24 0NJ,E.ONnext (E.ON Next Energy Limited)/,Next Flex,,Varying,,1100010005226,,None,,27052024-27052025';
const originalGas = 'DE24 0NJ,/E.ONnext (E.ON Next Energy Limited),,Next Flex,,Varying,,9338700800,,9200,27052024-27052025';

test('the two original image scan results exactly match the user supplied formats', () => {
  for (const [file, expected] of [
    ['image-b3577f5a5404.png', originalElectricity], ['image-87fa3dcbdbd6.png', originalGas],
  ]) {
    const png = PNG.sync.read(readFileSync(new URL(`../public/assets/789559486/images/${file}`, import.meta.url)));
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, expected);
  }
});

test('each fuel preserves its original empty columns, slash placement, and date encoding', () => {
  const result = buildTariffQrPayloads({ postcode: 'DE24 0NJ', electricityPoint: '1100010005226', gasPoint: '9338700800', annualGas: 9200, accountStart: '2024-05-27' });
  assert.equal(result.electricity, originalElectricity);
  assert.equal(result.gas, originalGas);
  assert.equal(result.electricity.split(',').length, 11);
  assert.equal(result.gas.split(',').length, 11);
  assert.deepEqual(result.electricity.split(',').map((value, index) => value === '' ? index : -1).filter(index => index >= 0), [3, 5, 7, 9]);
  assert.deepEqual(result.gas.split(',').map((value, index) => value === '' ? index : -1).filter(index => index >= 0), [2, 4, 6, 8]);
});

test('QR fields follow the effective supply address, settlement date and generated fuel data', () => {
  const raw = { ...defaultDraft(), seed: 42, sameAddress: false, samePeriod: false,
    supply: { street: '7 Supply Road', locality: '', city: 'Leeds', county: '', postcode: 'LS1 1AA' },
    periodStart: '2026-09-01', periodEnd: '2026-09-30', accountStart: '2026-08-31', accountEnd: '2026-09-29', issueDate: '2026-10-01' };
  const draft = effectiveDraft(raw);
  const bill = mockBill(draft);
  const result = buildTariffQrPayloads({ postcode: draft.supply.postcode, accountStart: draft.accountStart, ...bill });
  assert.equal(result.electricity.split(',')[0], 'LS1 1AA');
  assert.equal(result.electricity.split(',')[6], bill.electricityPoint);
  assert.equal(result.gas.split(',')[7], bill.gasPoint);
  assert.equal(result.gas.split(',')[9], String(bill.annualGas));
  assert.equal(result.gas.split(',')[10], '31082026-31082027');
});

test('year anniversary handles leap days and rejects invalid dates and delimiters', () => {
  assert.equal(qrAnnualPeriod('2024-02-29'), '29022024-28022025');
  assert.equal(qrAnnualPeriod('2026-12-31'), '31122026-31122027');
  assert.throws(() => qrAnnualPeriod('2026-02-31'));
  assert.throws(() => buildTariffQrPayloads({ postcode: 'DE24,0NJ', electricityPoint: '1100010005226', gasPoint: '9338700800', annualGas: 9200, accountStart: '2024-05-27' }));
});

test('the library produces scan-readable codes with the exact payload and vector quiet zone', async () => {
  for (const payload of [originalElectricity, originalGas]) {
    const dataUri = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 4, scale: 8 });
    const png = PNG.sync.read(Buffer.from(dataUri.split(',')[1], 'base64'));
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, payload);
    const svg = decodeURIComponent(tariffQrImage(payload).split(',')[1]);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('shape-rendering="crispEdges"'));
    assert.ok(svg.includes('M4 4h1v1h-1z'));
  }
});
