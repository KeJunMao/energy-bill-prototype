import QRCode from 'qrcode';

export interface TariffQrInput {
  postcode: string;
  electricityPoint: string;
  gasPoint: string;
  annualGas: number;
  accountStart: string;
}

// The original images use the settlement start date and its anniversary, DDMMYYYY.
export function qrAnnualPeriod(start: string) {
  const [year, month, day] = start.split('-').map(Number);
  const date = new Date(`${start}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) {
    throw new Error('A valid settlement start date is required for the tariff QR code');
  }
  const endDay = Math.min(day, new Date(Date.UTC(year + 1, month, 0)).getUTCDate());
  const packed = (y: number, m: number, d: number) => `${String(d).padStart(2, '0')}${String(m).padStart(2, '0')}${String(y).padStart(4, '0')}`;
  return `${packed(year, month, day)}-${packed(year + 1, month, endDay)}`;
}

export function buildTariffQrPayloads(input: TariffQrInput) {
  const postcode = input.postcode.trim();
  if (/[\r\n,]/.test(postcode)) throw new Error('Postcode cannot contain QR field delimiters');
  const period = qrAnnualPeriod(input.accountStart);
  // Keep the different slash locations AND blank column positions from each original image.
  const electricity = [postcode, 'E.ONnext (E.ON Next Energy Limited)/', 'Next Flex', '', 'Varying', '',
    input.electricityPoint, '', 'None', '', period].join(',');
  const gas = [postcode, '/E.ONnext (E.ON Next Energy Limited)', '', 'Next Flex', '', 'Varying', '',
    input.gasPoint, '', String(input.annualGas), period].join(',');
  return { electricity, gas };
}

export function tariffQrImage(payload: string) {
  const code = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const quietZone = 4;
  const size = code.modules.size + quietZone * 2;
  const cells: string[] = [];
  for (let row = 0; row < code.modules.size; row++) {
    for (let column = 0; column < code.modules.size; column++) {
      if (code.modules.get(row, column)) cells.push(`M${column + quietZone} ${row + quietZone}h1v1h-1z`);
    }
  }
  // The library owns QR encoding; a vector image preserves sharp cells in the exported PDF.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1000" height="1000" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#000" d="${cells.join('')}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
