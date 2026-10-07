import './style.css';
import { addDays, createAccountProfile, dateValue, defaultDraft, effectiveDraft, mockBill, money, newSeed, periodDays, ROTA_BLOCK_LETTERS, sampleCustomer, validateDraft, type Draft } from './model.ts';
import { fitReport, renderReport } from './report.ts';

const STORAGE_KEY = 'energy-bill-prototype-draft-v1';
const initial = defaultDraft();
let draft: Draft = structuredClone(initial);
let restored = false;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  if ([1, 2].includes(saved?.version) && saved.draft) {
    const candidate = saved.draft;
    const legacyLetter = typeof candidate.reportMarker === 'string' ? candidate.reportMarker.toUpperCase() : 'Q';
    if (saved.version === 1 && !candidate.fixed && Number.isSafeInteger(candidate.seed) && candidate.mailing?.city) {
      candidate.fixed = { ...createAccountProfile(candidate.seed, candidate.sameAddress ? candidate.mailing.city : candidate.supply?.city ?? candidate.mailing.city), rotaBlockLetter: legacyLetter };
    }
    if (candidate.fixed && candidate.fixed.rotaBlockLetter === undefined) candidate.fixed.rotaBlockLetter = legacyLetter;
    delete candidate.reportMarker;
    const validShape = Object.keys(initial).every(key => typeof candidate[key] === typeof initial[key as keyof Draft])
      && ['mailing', 'supply'].every(group => Object.keys(initial.mailing).every(key => typeof candidate[group]?.[key] === 'string'))
      && Object.keys(initial.fixed).every(key => typeof candidate.fixed?.[key] === 'string')
      && Number.isSafeInteger(candidate.seed) && candidate.seed > 0;
    if (validShape) { draft = candidate; restored = true; }
  }
} catch { /* An unavailable browser store does not prevent editing. */ }

const icons = {
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  shuffle: '<path d="m17 3 4 4-4 4M3 17h3c5 0 7-10 12-10h3M17 13l4 4-4 4M3 7h3c2 0 3 1 4 3M14 14c1 2 3 3 4 3h3"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6zM18 12h.01"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
};
const icon = (name: keyof typeof icons) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const field = (name: string, label: string, options: { type?: string; placeholder?: string; optional?: boolean; wide?: boolean; max?: number; step?: string; min?: number; limit?: number } = {}) => `
  <div class="field ${options.wide ? 'wide' : ''}" data-field="${name}">
    <label for="${name}">${label}${options.optional ? '<span class="optional">选填</span>' : '<span class="required">*</span>'}</label>
    <input id="${name}" name="${name}" type="${options.type ?? 'text'}" ${options.type === 'date' ? 'min="1900-01-01" max="9998-12-31"' : options.type === 'number' ? `min="${options.min ?? 0}" max="${options.limit ?? 1000000}" step="${options.step ?? '1'}"` : `maxlength="${options.max ?? 80}"`} placeholder="${options.placeholder ?? ''}" autocomplete="off" ${options.optional ? '' : 'required'} aria-describedby="error-${name}" />
    <span class="field-error" id="error-${name}"></span>
  </div>`;
const addressFields = (prefix: string) => `
  ${field(`${prefix}.street`, '街道地址', { placeholder: '门牌号与街道名称', wide: true, max: 100 })}
  ${field(`${prefix}.locality`, '区域 / 地区', { optional: true, placeholder: '如 Alvaston' })}
  ${field(`${prefix}.city`, '城市', { placeholder: '如 Derby' })}
  ${field(`${prefix}.county`, '郡 / 省', { optional: true, placeholder: '如 Derbyshire' })}
  ${field(`${prefix}.postcode`, '邮编', { placeholder: '如 DE24 0NJ', max: 20 })}`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="app-header">
    <a class="brand" href="#" aria-label="账单工作台首页"><span class="brand-mark">${icon('file')}</span><span>账单工作台<small>REPORT STUDIO</small></span></a>
    <div class="header-context"><span class="context-divider"></span><span>能源账单</span><span class="prototype-badge">产品试用版</span></div>
    <div class="header-actions"><span id="save-status" class="save-status"><i></i>${restored ? '已恢复本地草稿' : '尚未保存'}</span><button id="save" class="button secondary">${icon('save')}保存草稿</button><button id="print" class="button primary" disabled>${icon('print')}打印 / 导出 PDF</button></div>
  </header>
  <main class="workspace">
    <aside class="editor">
      <div class="editor-heading"><div class="eyebrow">CREATE A REPORT</div><h1>填写客户资料</h1><p>填好资料，账单就准备好了。</p>
        <nav class="section-nav" aria-label="表单导航"><button data-section="customer" class="active"><span>01</span>客户</button><button data-section="address"><span>02</span>地址</button><button data-section="dates"><span>03</span>日期</button><button data-section="fixed"><span>04</span>供能资料</button></nav>
      </div>
      <div class="form-scroll"><form id="report-form" novalidate>
        <section id="customer" class="form-section"><div class="section-title"><span class="section-icon">${icon('user')}</span><div><h2>客户信息</h2><p>用于账单收件人和账户标识</p></div><button id="sample-customer" type="button" class="text-button">新客户示例 ${icon('arrow')}</button></div>
          <div class="field-grid">
            <div class="field"><label for="title">称谓<span class="optional">选填</span></label><select name="title" id="title"><option value="">无称谓</option><option>Mr</option><option>Ms</option><option>Mrs</option><option>Miss</option><option>Dr</option></select></div>
            ${field('name', '客户姓名', { placeholder: '如 Charlotte Bunting', max: 80 })}
            ${field('account', '账户号码', { placeholder: '如 A-03B61D17', wide: true, max: 32 })}
          </div>
        </section>
        <section id="address" class="form-section"><div class="section-title"><span class="section-icon">${icon('pin')}</span><div><h2>地址信息</h2><p>一次填写，同步更新各页地址</p></div></div>
          <div class="subsection-label">邮寄地址 <span>账单收件地址</span></div><div class="field-grid">${addressFields('mailing')}</div>
          <label class="switch-row"><input type="checkbox" name="sameAddress" id="sameAddress" /><span class="switch"></span><span>供能地址与邮寄地址一致<small>用于电费和燃气明细页</small></span></label>
          <div id="supply-fields"><div class="subsection-label">供能地址 <span>实际使用能源的地址</span></div><div class="field-grid">${addressFields('supply')}</div></div>
        </section>
        <section id="dates" class="form-section"><div class="section-title"><span class="section-icon">${icon('calendar')}</span><div><h2>账单日期</h2><p>日期变更后，费用和用量同步更新</p></div></div>
          <div class="field-grid">${field('issueDate', '出账日期', { type: 'date', wide: true })}${field('periodStart', '计费开始日期', { type: 'date' })}${field('periodEnd', '计费结束日期', { type: 'date' })}</div>
          <div class="date-note"><span id="day-count">—</span><span>计费天数包含开始日与结束日</span></div>
          <label class="switch-row compact"><input type="checkbox" name="samePeriod" id="samePeriod" /><span class="switch"></span><span>账户结算期与计费期一致</span></label>
          <div id="account-fields" class="field-grid">${field('accountStart', '结算开始日期', { type: 'date' })}${field('accountEnd', '结算结束日期', { type: 'date' })}</div>
          <label class="switch-row compact"><input type="checkbox" name="autoReadings" id="autoReadings" /><span class="switch"></span><span>抄表日期自动联动<small>起始为计费开始日，结束为计费结束日次日</small></span></label>
          <div class="field-grid">${field('readingStart', '起始抄表日期', { type: 'date' })}${field('readingEnd', '结束抄表日期', { type: 'date' })}</div>
        </section>
        <section id="fixed" class="form-section"><div class="section-title"><span class="section-icon">${icon('file')}</span><div><h2>供能账户资料</h2><p>随客户保存，不随演示账单刷新</p></div><button id="sample-fixed" type="button" class="text-button">换固定示例 ${icon('shuffle')}</button></div>
          <div class="fixed-note">这些资料已预填示例，可按客户实际数据修改。换表、调价、重新评估年用量或调整扣款约定时再更新。</div>
          <div class="subsection-label">计量点与表号<span>供能地址 / 表计标识</span></div>
          <div class="field-grid">
            ${field('fixed.electricityPoint', '电力计量点 MPAN', { max: 13 })}${field('fixed.gasPoint', '燃气计量点 MPRN', { max: 10 })}
            ${field('fixed.electricityMeter', '电表表号', { max: 32 })}${field('fixed.gasMeter', '燃气表表号', { max: 32 })}
            <div class="field wide" data-field="fixed.rotaBlockLetter"><label for="fixed.rotaBlockLetter">轮换区块字母<span class="optional">选填</span></label>
              <select id="fixed.rotaBlockLetter" name="fixed.rotaBlockLetter" aria-describedby="error-fixed.rotaBlockLetter"><option value="">未确认（留空）</option>${ROTA_BLOCK_LETTERS.map(letter => `<option value="${letter}">${letter}</option>`).join('')}</select>
              <span class="field-error" id="error-fixed.rotaBlockLetter"></span>
            </div>
          </div>
          <p class="fixed-help">对应第一页右上角。按原账单或 <a href="https://www.powercut105.com/findoperator" target="_blank" rel="noopener noreferrer">105 查询结果</a>填写；同一供能点保持稳定，更换地址后需重新核对。</p>
          <div class="subsection-label fixed-subsection">当前套餐费率<span>Next Flex · 未含 VAT</span></div>
          <div class="field-grid">
            ${field('fixed.electricityRate', '日间电价 · p/kWh', { type: 'number', step: '0.001', limit: 10000 })}
            ${field('fixed.electricityNightRate', '夜间电价 · p/kWh', { type: 'number', step: '0.001', limit: 10000 })}
            ${field('fixed.electricityStandingRate', '电力固定费 · p/天', { type: 'number', step: '0.001', limit: 10000 })}
            ${field('fixed.gasRate', '燃气单价 · p/kWh', { type: 'number', step: '0.001', limit: 10000 })}
            ${field('fixed.gasStandingRate', '燃气固定费 · p/天', { type: 'number', step: '0.001', limit: 10000 })}
          </div>
          <div class="subsection-label fixed-subsection">预计年用量<span>评估值 · kWh/年</span></div>
          <div class="field-grid">
            ${field('fixed.annualDay', '日间电力年用量', { type: 'number', step: '0.1' })}
            ${field('fixed.annualNight', '夜间电力年用量', { type: 'number', step: '0.1' })}
            ${field('fixed.annualGas', '燃气年用量', { type: 'number', wide: true })}
          </div>
          <div class="subsection-label fixed-subsection">月度扣款约定<span>Direct Debit</span></div>
          <div class="field-grid">
            ${field('fixed.monthlyDirectDebit', '每月扣款金额 · £', { type: 'number', step: '0.01', limit: 100000 })}
            ${field('fixed.collectionDay', '每月扣款日', { type: 'number', min: 1, limit: 28 })}
          </div>
          <p class="fixed-help">费用与年度预估自动计算。月扣款金额按付款约定保存，调整费率或年用量不会自动改动扣款金额。</p>
        </section>
        <div class="form-footnote"><span class="note-dot"></span><p>预览区“换一组演示数据”仅更换本期账单样例，保留客户信息、日期和供能账户资料。</p></div>
      </form></div>
      <div class="editor-footer"><span id="validation-status">${icon('check')}资料已就绪</span><span>草稿仅保存在本机浏览器</span></div>
    </aside>
    <section class="preview-panel" aria-label="账单预览">
      <div class="preview-heading"><div><div class="eyebrow">LIVE PREVIEW</div><h2>账单预览 <span class="live-dot"></span></h2></div><button id="randomize" class="button secondary">${icon('shuffle')}换一组演示数据</button></div>
      <div class="preview-toolbar"><nav class="page-nav" aria-label="账单页面"><button class="active" data-page="0"><span>01</span>账单总览</button><button data-page="1"><span>02</span>电费明细</button><button data-page="2"><span>03</span>燃气明细</button><button data-page="3"><span>04</span>服务说明</button></nav><div class="zoom-control"><label for="zoom">缩放</label><select id="zoom"><option value="fit">适应宽度</option><option value="0.7">70%</option><option value="0.85">85%</option><option value="1">100%</option></select></div></div>
      <div class="preview-summary"><span><i class="summary-dot"></i>演示账单 · A4 / 4 页</span><span>编号 <b id="bill-reference">—</b></span><span>本期费用 <b id="bill-total">—</b></span></div>
      <div id="preview-error" class="preview-error" role="status" hidden></div>
      <div class="preview-scroll" id="preview-scroll"><div class="paper-container" id="paper-container"><iframe id="report-preview" title="四页能源账单实时预览" sandbox="allow-same-origin allow-modals"></iframe></div><div class="preview-end">— 报表共 4 页 —</div></div>
    </section>
  </main>
  <div id="toast" class="toast" role="status"></div>`;

const form = document.querySelector<HTMLFormElement>('#report-form')!;
const frame = document.querySelector<HTMLIFrameElement>('#report-preview')!;
const printButton = document.querySelector<HTMLButtonElement>('#print')!;
const scroll = document.querySelector<HTMLDivElement>('#preview-scroll')!;
const paper = document.querySelector<HTMLDivElement>('#paper-container')!;
const PAGE_WIDTH = 595.27557373 * 4 / 3;
const PAGE_HEIGHT = 841.889770508 * 4 / 3;
const DOCUMENT_HEIGHT = PAGE_HEIGHT * 4 + 24 * 3;
let scale = .85;
let previewTimer: ReturnType<typeof setTimeout>;
let revision = 0;
let isReady = false;

function toast(message: string) {
  const element = document.querySelector<HTMLDivElement>('#toast')!;
  element.textContent = message;
  element.classList.add('visible');
  setTimeout(() => element.classList.remove('visible'), 3200);
}
function populate() {
  for (const element of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) {
    const [group, key] = element.name.split('.');
    const value = key ? (draft[group as 'mailing' | 'supply' | 'fixed'] as unknown as Record<string, string>)[key] : draft[group as keyof Draft];
    if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = Boolean(value);
    else element.value = String(value);
  }
  syncLinkedFields();
}
function syncLinkedFields() {
  document.querySelector<HTMLElement>('#supply-fields')!.hidden = draft.sameAddress;
  document.querySelector<HTMLElement>('#account-fields')!.hidden = draft.samePeriod;
  for (const element of form.querySelectorAll<HTMLInputElement>('[name^="supply."]')) element.disabled = draft.sameAddress;
  for (const name of ['accountStart', 'accountEnd']) {
    const element = form.elements.namedItem(name) as HTMLInputElement;
    element.disabled = draft.samePeriod;
    element.value = draft.samePeriod ? draft[name === 'accountStart' ? 'periodStart' : 'periodEnd'] : draft[name as 'accountStart' | 'accountEnd'];
  }
  for (const name of ['readingStart', 'readingEnd']) {
    const element = form.elements.namedItem(name) as HTMLInputElement;
    element.disabled = draft.autoReadings;
    element.value = draft.autoReadings
      ? name === 'readingStart' ? draft.periodStart : Number.isFinite(dateValue(draft.periodEnd)) ? addDays(draft.periodEnd, 1) : ''
      : draft[name as 'readingStart' | 'readingEnd'];
  }
}
function displayValidation() {
  const errors = validateDraft(draft);
  for (const element of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) {
    const error = errors[element.name];
    element.setAttribute('aria-invalid', String(Boolean(error)));
    const errorElement = document.getElementById(`error-${element.name}`);
    if (errorElement) errorElement.textContent = error ?? '';
  }
  const count = Object.keys(errors).length;
  const status = document.querySelector<HTMLElement>('#validation-status')!;
  status.classList.toggle('invalid', count > 0);
  status.innerHTML = count ? `<span class="note-dot"></span>${count} 项资料待完善` : `${icon('check')}资料已就绪`;
  const banner = document.querySelector<HTMLElement>('#preview-error')!;
  banner.hidden = count === 0;
  banner.textContent = count ? '请检查左侧标记的字段。预览暂时保留上一次有效内容。' : '';
  document.querySelector<HTMLElement>('#day-count')!.textContent = !errors.periodStart && !errors.periodEnd
    ? `${periodDays(draft.periodStart, draft.periodEnd)} 天` : '—';
  return count === 0;
}
function resizePreview() {
  const zoom = document.querySelector<HTMLSelectElement>('#zoom')!.value;
  scale = zoom === 'fit' ? Math.min(1, Math.max(.25, (scroll.clientWidth - 64) / PAGE_WIDTH)) : Number(zoom);
  paper.style.width = `${PAGE_WIDTH * scale}px`;
  paper.style.height = `${DOCUMENT_HEIGHT * scale}px`;
  frame.style.width = `${PAGE_WIDTH}px`;
  frame.style.height = `${DOCUMENT_HEIGHT}px`;
  frame.style.transform = `scale(${scale})`;
}
function updatePreview() {
  isReady = false;
  printButton.disabled = true;
  if (!displayValidation()) return;
  const bill = mockBill(draft);
  document.querySelector<HTMLElement>('#bill-reference')!.textContent = bill.reference;
  document.querySelector<HTMLElement>('#bill-total')!.textContent = money(bill.total);
  frame.srcdoc = renderReport(draft);
  resizePreview();
}
frame.addEventListener('load', async () => {
  const currentRevision = revision;
  await fitReport(frame);
  if (currentRevision === revision && Object.keys(validateDraft(draft)).length === 0) {
    isReady = true;
    printButton.disabled = false;
  }
});
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', event => {
  const element = event.target as HTMLInputElement;
  if (!element.name) return;
  const [group, key] = element.name.split('.');
  if (key) (draft[group as 'mailing' | 'supply' | 'fixed'] as unknown as Record<string, string>)[key] = element.value;
  else if (element.type === 'checkbox') {
    // Keep the currently visible linked values when switching to manual editing.
    if (!element.checked && ['sameAddress', 'samePeriod', 'autoReadings'].includes(group) && Object.keys(validateDraft(draft)).length === 0) {
      const effective = effectiveDraft(draft);
      if (group === 'sameAddress') draft.supply = { ...effective.supply };
      if (group === 'samePeriod') { draft.accountStart = effective.accountStart; draft.accountEnd = effective.accountEnd; }
      if (group === 'autoReadings') { draft.readingStart = effective.readingStart; draft.readingEnd = effective.readingEnd; }
    }
    (draft as unknown as Record<string, unknown>)[group] = element.checked;
    if (!element.checked && group === 'sameAddress') populate();
  } else (draft as unknown as Record<string, unknown>)[group] = element.value;
  revision++;
  isReady = false;
  printButton.disabled = true;
  document.querySelector<HTMLElement>('#save-status')!.innerHTML = '<i class="unsaved"></i>有未保存修改';
  syncLinkedFields();
  displayValidation();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, 180);
});
document.querySelector<HTMLButtonElement>('#sample-customer')!.addEventListener('click', () => {
  const customer = sampleCustomer();
  draft = { ...draft, ...customer, fixed: createAccountProfile(newSeed(), draft.sameAddress ? customer.mailing.city : draft.supply.city) };
  revision++;
  populate(); updatePreview();
  document.querySelector<HTMLElement>('#save-status')!.innerHTML = '<i class="unsaved"></i>有未保存修改';
  toast('已填入新客户及其供能资料，日期保持不变');
});
document.querySelector<HTMLButtonElement>('#sample-fixed')!.addEventListener('click', () => {
  draft.fixed = createAccountProfile(newSeed(), draft.sameAddress ? draft.mailing.city : draft.supply.city);
  revision++; populate(); updatePreview();
  document.querySelector<HTMLElement>('#save-status')!.innerHTML = '<i class="unsaved"></i>有未保存修改';
  toast('已更换供能资料示例，客户信息和日期保持不变');
});
document.querySelector<HTMLButtonElement>('#randomize')!.addEventListener('click', () => {
  draft.seed = newSeed(); revision++;
  updatePreview();
  document.querySelector<HTMLElement>('#save-status')!.innerHTML = '<i class="unsaved"></i>有未保存修改';
  toast('已切换本期账单样例，客户及供能资料保持不变');
});
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, draft, savedAt: new Date().toISOString() }));
    document.querySelector<HTMLElement>('#save-status')!.innerHTML = '<i></i>已保存到本机';
    toast('草稿已保存，刷新页面后会自动恢复');
  } catch { toast('浏览器未能保存草稿，请检查本地存储设置'); }
}
document.querySelector<HTMLButtonElement>('#save')!.addEventListener('click', save);
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); } });
printButton.addEventListener('click', () => {
  if (!isReady || !displayValidation()) return;
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-section]')) {
  button.addEventListener('click', () => {
    document.getElementById(button.dataset.section!)!.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('[data-section]').forEach(item => item.classList.toggle('active', item === button));
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-page]')) {
  button.addEventListener('click', () => {
    scroll.scrollTo({ top: Number(button.dataset.page) * (PAGE_HEIGHT + 24) * scale, behavior: 'smooth' });
  });
}
scroll.addEventListener('scroll', () => {
  const index = Math.min(3, Math.floor((scroll.scrollTop + 80) / ((PAGE_HEIGHT + 24) * scale)));
  document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(button => button.classList.toggle('active', Number(button.dataset.page) === index));
});
document.querySelector<HTMLSelectElement>('#zoom')!.addEventListener('change', resizePreview);
new ResizeObserver(resizePreview).observe(scroll);
populate();
updatePreview();
