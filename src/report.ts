import template from './bill-template.html?raw';
import { balanceText, effectiveDraft, formatDate, mockBill, money, usageCharge, type Address, type Draft } from './model.ts';
import { buildTariffQrPayloads, tariffQrImage } from './tariff-qr.ts';

const addressText = (address: Address) => Object.values(address).map(value => value.trim()).filter(Boolean).join(', ');
const escaped = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function renderReport(raw: Draft): string {
  const draft = effectiveDraft(raw);
  const bill = mockBill(draft);
  const doc = new DOMParser().parseFromString(template, 'text/html');
  doc.title = `${draft.name} — ${bill.reference} — Sample energy bill`;
  const base = doc.createElement('base');
  base.href = new URL(import.meta.env.BASE_URL, location.href).href;
  doc.head.prepend(base);
  const range = `${formatDate(draft.periodStart)} - ${formatDate(draft.periodEnd)}`;
  const accountRange = `${formatDate(draft.accountStart)} - ${formatDate(draft.accountEnd)}`;
  const paymentDate = bill.payments.length === 0 ? '—'
    : bill.payments.length === 1 ? formatDate(bill.payments[0].date)
    : `${formatDate(bill.payments[0].date)} - ${formatDate(bill.payments.at(-1)!.date)}`;
  const mapping: Record<string, string> = {
    'Miss Charlotte Bunting': [draft.title, draft.name.trim()].filter(Boolean).join(' '),
    ': A-03B61D17': `: ${draft.account.trim()}`,
    ': 182649689': `: ${bill.reference}`,
    ': 27 June 2024': `: ${formatDate(draft.issueDate, true)}`,
    '27 May 2024 - 26 Jun 2024': accountRange,
    '26 May 2024 - 25 Jun 2024': range,
    'Next Flex (26th May 2024 - 25th June 2024)': `Next Flex (${range})`,
    '26 May 2024': formatDate(draft.readingStart),
    '26 Jun 2024': formatDate(draft.readingEnd),
    'Direct Debit collection': bill.payments.length === 0 ? 'No collection in this period'
      : bill.payments.length === 1 ? 'Direct Debit collection' : `Direct Debit collections (${bill.payments.length})`,
    '3 Jun 2024': paymentDate,
    'On 27 May 2024 your previous balance was': `On ${formatDate(draft.accountStart)} your previous balance was`,
    'On 26 Jun 2024 your new balance was': `On ${formatDate(draft.accountEnd)} your new balance was`,
    '£29.01 CR': balanceText(bill.openingBalance),
    '£115.00 CR': bill.payment === 0 ? money(0) : `${money(bill.payment)} CR`,
    '£61.70 CR': balanceText(bill.closingBalance),
    '£60.76 DR': `${money(bill.electricityTotal)} DR`,
    '£21.55 DR': `${money(bill.gasTotal)} DR`,
    '£737.05': money(bill.annualElectricityCost),
    '£656.14': money(bill.annualGasCost),
    '1100010005226': bill.electricityPoint,
    '9338700800': bill.gasPoint,
    ' (on meter point 1100010005226)': ` (on meter point ${bill.electricityPoint})`,
    ' (on meter point 9338700800)': ` (on meter point ${bill.gasPoint})`,
    'Electricity charges for meter 16P2172071': `Electricity charges for meter ${bill.electricityMeter}`,
    'Gas charges for meter G4P21488551700': `Gas charges for meter ${bill.gasMeter}`,
    '14053.8 Smart meter reading': `${bill.dayStart.toFixed(1)} Smart meter reading`,
    '14212.8 Smart meter reading': `${bill.dayEnd.toFixed(1)} Smart meter reading`,
    '1857.1 Smart meter reading': `${bill.nightStart.toFixed(1)} Smart meter reading`,
    '1880.7 Smart meter reading': `${bill.nightEnd.toFixed(1)} Smart meter reading`,
    '5289.9 Smart meter reading': `${bill.gasStart.toFixed(1)} Smart meter reading`,
    '5308.0 Smart meter reading': `${bill.gasEnd.toFixed(1)} Smart meter reading`,
    '22.640p/kWh': `${bill.electricityRate.toFixed(3)}p/kWh`,
    '5.617p/kWh': `${bill.gasRate.toFixed(3)}p/kWh`,
    '159.1 kWh @ 22.640p/kWh': `${bill.dayUsed.toFixed(1)} kWh @ ${bill.electricityRate.toFixed(3)}p/kWh`,
    '23.6 kWh @ 22.640p/kWh': `${bill.nightUsed.toFixed(1)} kWh @ ${bill.electricityNightRate.toFixed(3)}p/kWh`,
    '201.9 kWh @ 5.617p/kWh': `${bill.gasKwh.toFixed(1)} kWh @ ${bill.gasRate.toFixed(3)}p/kWh`,
    '53.334p/day (£194.67/year)': `${bill.electricityStandingRate.toFixed(3)}p/day (${money(usageCharge(365, bill.electricityStandingRate))}/year)`,
    '29.627p/day (£108.14/year)': `${bill.gasStandingRate.toFixed(3)}p/day (${money(usageCharge(365, bill.gasStandingRate))}/year)`,
    '31 days @ 53.334p/day': `${bill.days} days @ ${bill.electricityStandingRate.toFixed(3)}p/day`,
    '31 days @ 29.627p/day': `${bill.days} days @ ${bill.gasStandingRate.toFixed(3)}p/day`,
    '£36.01': money(bill.dayCharge), '£5.33': money(bill.nightCharge),
    '£16.53': money(bill.electricityStanding), '£57.87': money(bill.electricitySubtotal),
    '£2.89': money(bill.electricityVat), '£60.76': money(bill.electricityTotal),
    '£11.34': money(bill.gasCharge), '£9.18': money(bill.gasStanding),
    '£20.52': money(bill.gasSubtotal), '£1.03': money(bill.gasVat), '£21.55': money(bill.gasTotal),
    '£78.39': money(bill.electricitySubtotal + bill.gasSubtotal),
    '£3.92': money(bill.electricityVat + bill.gasVat), '£82.31': money(bill.total),
    '2017.3 kWh': `${bill.annualDay.toFixed(1)} kWh`, '223.4 kWh': `${bill.annualNight.toFixed(1)} kWh`,
    '9200 kWh': `${bill.annualGas} kWh`,
    '£20.74': money(bill.electricitySaving), '£26.04': money(bill.electricityBestSaving),
    '£19.99': money(bill.gasSaving), '£30.93': money(bill.gasBestSaving),
    '5.89 kWh/day': `${((bill.dayUsed + bill.nightUsed) / bill.days).toFixed(2)} kWh/day`,
    '6.51 kWh/day': `${(bill.gasKwh / bill.days).toFixed(2)} kWh/day`,
  };

  // Reflow the variable-length address regions inside the original page layout.
  const fullOriginalAddress = '95 Penzance Road, Alvaston, Derby, Derbyshire, DE24 0NJ';
  for (const block of doc.querySelectorAll<HTMLElement>('.pdf-block')) {
    const spans = [...block.querySelectorAll<HTMLElement>('.pdf-run')];
    const texts = spans.map(span => span.textContent ?? '');
    if (texts.includes('Miss Charlotte Bunting')) {
      block.style.width = '250pt';
      block.style.height = '120pt';
      block.classList.add('variable-address');
      block.innerHTML = [mapping['Miss Charlotte Bunting'], ...Object.values(draft.mailing).filter(value => value.trim())]
        .map(value => `<span>${escaped(value)}</span>`).join('');
    } else if (texts.includes('Get in touch with us') && texts.includes('Q')) {
      const marker = spans.find(span => span.textContent === 'Q')!;
      marker.textContent = bill.rotaBlockLetter;
      marker.dataset.rotaBlock = 'true';
      marker.title = 'Rota Block Letter · 轮换区块字母';
      // Centre any letter in the existing box instead of using Q's original glyph width.
      marker.style.transform = 'translate(172.913391113pt,1.9999823pt) scale(0.013333333)';
      marker.style.width = '19.842529297pt';
      marker.style.textAlign = 'center';
    } else if (texts.includes(fullOriginalAddress)) {
      const hasLabel = texts.includes('Supply address:');
      block.style.width = '282pt';
      block.style.height = hasLabel ? '30pt' : '24pt';
      block.classList.add('variable-supply');
      block.innerHTML = `${hasLabel ? '<strong>Supply address:</strong><br>' : ''}${escaped(addressText(draft.supply))}`;
    } else if (texts.includes('Consumption')) {
      const value = spans[1];
      value.textContent = `${bill.gasUnits.toFixed(1)} m³`;
      spans.slice(2).forEach(span => span.remove());
    } else if (texts.includes('For you:')) {
      block.style.width = '228pt';
      block.classList.add('variable-formula');
      block.innerHTML = `<strong>For you:</strong><br>${bill.gasUnits.toFixed(1)} × ${bill.correction} × ${bill.calorific.toFixed(1)} ÷ 3.6 = ${bill.gasKwh.toFixed(1)} kWh`;
    } else if (texts.includes('Unit rate (night)')) {
      spans[1].textContent = `${bill.electricityNightRate.toFixed(3)}p/kWh`;
      spans[1].dataset.bound = 'true';
    } else if (texts.length === 3 && texts.join(',') === '2,811,3') {
      spans[0].textContent = '02';
      spans[2].textContent = '003';
      // A padded LLFC needs three character widths in the right-most cell.
      block.style.width = '86pt';
    }
  }
  for (const span of doc.querySelectorAll<HTMLElement>('.pdf-run')) {
    const old = span.textContent ?? '';
    if (!span.dataset.bound && old in mapping) span.textContent = mapping[old];
    const size = Number(span.dataset.size);
    const position = span.style.transform.match(/translate\(\s*([-.\de+]+)pt,\s*([-.\de+]+)pt\)/i);
    if (position) {
      span.style.transform = `translate(${position[1]}pt,${position[2]}pt)`;
      span.style.fontSize = `${size}pt`;
      span.dataset.x = position[1];
      span.dataset.originalSize = String(size);
    }
  }
  const qr = buildTariffQrPayloads({
    postcode: draft.supply.postcode, electricityPoint: bill.electricityPoint,
    gasPoint: bill.gasPoint, annualGas: bill.annualGas, accountStart: draft.accountStart,
  });
  for (const img of doc.querySelectorAll<HTMLImageElement>('img[alt*="QR code"]')) {
    const fuel = img.alt.startsWith('Electricity') ? 'electricity' : 'gas';
    img.src = tariffQrImage(qr[fuel]);
    img.dataset.qrFuel = fuel;
    img.dataset.qrPayload = qr[fuel];
    img.title = qr[fuel];
  }
  for (const page of doc.querySelectorAll('.pdf-page')) {
    const badge = doc.createElement('div');
    badge.className = 'sample-label';
    badge.textContent = 'SAMPLE · PROTOTYPE';
    page.append(badge);
  }
  const style = doc.createElement('style');
  style.textContent = `
    html, body { background:#e9ecef; } body { padding:0; }
    .document { min-width:0; width:210mm; gap:24px; }
    .pdf-page { box-shadow:none; }
    .pdf-run { font-size:10pt; }
    .variable-address { font-size:10pt; line-height:12pt; color:#36164a; overflow-wrap:anywhere; }
    .variable-address > span { display:block; }
    .variable-supply { font-size:8.5pt; line-height:10pt; color:#36164a; overflow-wrap:anywhere; }
    .variable-formula { font-size:7pt; line-height:9pt; color:#36164a; }
    .sample-label { position:absolute; top:14pt; left:34pt; color:#84718f; font:6pt Arial,sans-serif; letter-spacing:1.2pt; }
    @media print { html,body { background:white; } .document {gap:0;} }
  `;
  doc.head.append(style);
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

export async function fitReport(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc) return;
  await doc.fonts.ready;
  if (frame.contentDocument !== doc) return;
  for (const block of doc.querySelectorAll<HTMLElement>('.variable-address,.variable-supply')) {
    const originalSize = block.classList.contains('variable-address') ? 10 : 8.5;
    const originalLine = block.classList.contains('variable-address') ? 12 : 10;
    for (let size = originalSize; size >= 6; size -= .25) {
      block.style.fontSize = `${size}pt`;
      block.style.lineHeight = `${originalLine * size / originalSize}pt`;
      if (block.scrollHeight <= block.clientHeight + 1) break;
    }
  }
  // Fit each positioned run to its next neighbour; keep monetary columns right aligned.
  for (const block of doc.querySelectorAll<HTMLElement>('.pdf-block')) {
    const groups = new Map<string, HTMLElement[]>();
    for (const span of block.querySelectorAll<HTMLElement>('.pdf-run')) {
      const baseline = span.dataset.baseline ?? '';
      groups.set(baseline, [...(groups.get(baseline) ?? []), span]);
    }
    for (const spans of groups.values()) {
      spans.sort((a, b) => Number(a.dataset.x) - Number(b.dataset.x));
      for (let i = 0; i < spans.length; i++) {
        const span = spans[i];
        if (span.dataset.rotaBlock) continue;
        const x = Number(span.dataset.x);
        const limit = i < spans.length - 1 ? Number(spans[i + 1].dataset.x) - x : parseFloat(block.style.width) - x;
        if (limit <= 0 || !span.textContent?.trim()) continue;
        const available = limit * 4 / 3;
        const width = span.getBoundingClientRect().width;
        const size = Number(span.dataset.originalSize);
        if (width > available) span.style.fontSize = `${size * available / width}pt`;
        if (/^£[\d,.]+(?: CR| DR)?$/.test(span.textContent)) {
          span.style.width = `${limit}pt`;
          span.style.textAlign = 'right';
        }
      }
    }
  }
}
