"""Optional browser QA: uv run --no-project --with playwright --with pymupdf python prototype/tests/verify_browser.py"""
import json
from pathlib import Path

import pymupdf
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1080})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:5173/", wait_until="networkidle")
    def scan_qr_codes(target, selector):
        target.add_script_tag(path=str(ROOT / "node_modules/jsqr/dist/jsQR.js"))
        return target.evaluate("""async (selector) => {
            const doc = selector === 'iframe' ? document.querySelector('#report-preview').contentDocument : document;
            const results = [];
            for (const img of doc.querySelectorAll('img[data-qr-fuel]')) {
                await img.decode();
                const canvas = document.createElement('canvas');
                canvas.width = 1000; canvas.height = 1000;
                const context = canvas.getContext('2d');
                context.drawImage(img, 0, 0, 1000, 1000);
                const pixels = context.getImageData(0, 0, 1000, 1000);
                const decoded = window.jsQR(pixels.data, 1000, 1000);
                results.push({fuel: img.dataset.qrFuel, expected: img.dataset.qrPayload, decoded: decoded?.data});
            }
            return results;
        }""", selector)

    page.locator("#print").wait_for(state="visible")
    page.wait_for_function("!document.querySelector('#print').disabled")
    qr_initial = scan_qr_codes(page, 'iframe')
    assert len(qr_initial) == 2
    assert all(qr['decoded'] == qr['expected'] for qr in qr_initial)
    assert qr_initial[0]['decoded'] != qr_initial[1]['decoded']
    page.screenshot(path=str(OUT / "desktop.png"))
    reference = page.locator("#bill-reference").inner_text()
    total = page.locator("#bill-total").inner_text()
    page.locator("#name").fill("Alexandra Montgomery-Wellington")
    page.locator('[name="mailing.street"]').fill("Apartment 18, 123 Long Meadow Road")
    page.wait_for_timeout(350)
    page.wait_for_function("!document.querySelector('#print').disabled")
    assert page.locator("#bill-total").inner_text() == total
    assert page.locator("#bill-reference").inner_text() == reference
    report_frame = page.frame_locator("#report-preview")
    assert "Alexandra Montgomery-Wellington" in report_frame.locator(".variable-address").inner_text()
    assert report_frame.locator(".variable-supply").count() == 3
    assert all("Long Meadow Road" in text for text in report_frame.locator(".variable-supply").all_inner_texts())
    page.locator("#sameAddress").uncheck()
    page.locator('[name="supply.street"]').fill("7 Separate Supply Road")
    page.locator('[name="supply.city"]').fill("Leeds")
    page.locator('[name="supply.postcode"]').fill("LS1 1AA")
    page.locator("#periodStart").fill("2026-09-01")
    page.locator("#periodEnd").fill("2026-09-15")
    page.locator("#issueDate").fill("2026-10-01")
    page.wait_for_timeout(350)
    page.wait_for_function("!document.querySelector('#print').disabled")
    assert page.locator("#readingEnd").input_value() == "2026-09-16"
    assert page.locator("#day-count").inner_text() == "15 天"
    assert all("Separate Supply Road" in text for text in report_frame.locator(".variable-supply").all_inner_texts())
    fixed_values = {
        'electricityPoint': '1100010005226', 'gasPoint': '9338700800',
        'electricityMeter': '16PTEST0001', 'gasMeter': 'G4PTEST000001',
        'electricityRate': '30.000', 'electricityNightRate': '10.000', 'electricityStandingRate': '50.000',
        'gasRate': '6.000', 'gasStandingRate': '30.000',
        'annualDay': '2000.0', 'annualNight': '1000.0', 'annualGas': '9200',
        'monthlyDirectDebit': '125.50', 'collectionDay': '15',
        'rotaBlockLetter': 'R',
    }
    for key, value in fixed_values.items():
        element = page.locator(f'[name="fixed.{key}"]')
        if key == 'rotaBlockLetter':
            element.select_option(value)
        else:
            element.fill(value)
    page.wait_for_timeout(350)
    page.wait_for_function("!document.querySelector('#print').disabled")
    electricity_text = report_frame.locator('#page-2').inner_text()
    assert '30.000p/kWh' in electricity_text and '10.000p/kWh' in electricity_text
    assert '16PTEST0001' in electricity_text
    assert 'G4PTEST000001' in report_frame.locator('#page-3').inner_text()
    assert '£125.50 CR' in report_frame.locator('#page-1').inner_text()
    assert report_frame.locator('[data-rota-block]').inner_text() == 'R'
    qr_updated = scan_qr_codes(page, 'iframe')
    assert all(qr['decoded'] == qr['expected'] for qr in qr_updated)
    assert all(qr['decoded'].startswith('LS1 1AA,') for qr in qr_updated)
    assert all(qr['decoded'].endswith('01092026-01092027') for qr in qr_updated)
    electricity_fields = qr_updated[0]['decoded'].split(',')
    gas_fields = qr_updated[1]['decoded'].split(',')
    assert electricity_fields[8] == 'None'
    assert electricity_fields[1].endswith('/')
    assert gas_fields[1].startswith('/')
    assert electricity_fields[6] in report_frame.locator('#page-2').inner_text()
    assert gas_fields[7] in report_frame.locator('#page-3').inner_text()
    assert f"{gas_fields[9]} kWh" in report_frame.locator('#page-3').inner_text()
    assert electricity_fields[6] == fixed_values['electricityPoint']
    assert gas_fields[7] == fixed_values['gasPoint'] and gas_fields[9] == fixed_values['annualGas']
    first_reference = page.locator('#bill-reference').inner_text()
    page.locator('#randomize').click()
    page.wait_for_function("!document.querySelector('#print').disabled")
    assert page.locator('#bill-reference').inner_text() != first_reference
    for key, value in fixed_values.items():
        assert page.locator(f'[name="fixed.{key}"]').input_value() == value
    assert scan_qr_codes(page, 'iframe') == qr_updated
    page.locator('[name="fixed.electricityNightRate"]').fill('')
    page.wait_for_timeout(350)
    assert page.locator('#print').is_disabled()
    assert page.locator('[name="fixed.electricityNightRate"]').get_attribute('aria-invalid') == 'true'
    page.locator('[name="fixed.electricityNightRate"]').fill(fixed_values['electricityNightRate'])
    page.locator("#periodEnd").fill("2026-08-31")
    page.wait_for_timeout(350)
    assert page.locator("#print").is_disabled()
    assert page.locator("#preview-error").is_visible()
    page.locator("#periodEnd").fill("2026-09-15")
    page.wait_for_timeout(350)
    page.wait_for_function("!document.querySelector('#print').disabled")
    page.locator("#save").click()
    reference = page.locator("#bill-reference").inner_text()
    total = page.locator("#bill-total").inner_text()
    page.reload(wait_until="networkidle")
    page.wait_for_function("!document.querySelector('#print').disabled")
    assert page.locator("#name").input_value() == "Alexandra Montgomery-Wellington"
    assert page.locator("#bill-reference").inner_text() == reference
    assert page.locator("#bill-total").inner_text() == total
    qr_restored = scan_qr_codes(page, 'iframe')
    assert qr_restored == qr_updated
    for key, value in fixed_values.items():
        assert page.locator(f'[name="fixed.{key}"]').input_value() == value
    report_html = page.locator("#report-preview").evaluate("frame => frame.contentDocument.documentElement.outerHTML")
    document = browser.new_page(viewport={"width": 794, "height": 1123})
    document.set_content(report_html, wait_until="networkidle")
    document.evaluate("document.fonts.ready")
    qr_document = scan_qr_codes(document, 'document')
    assert qr_document == qr_updated
    assert document.locator(".pdf-page").count() == 4
    assert document.evaluate("Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)")
    for number in range(1, 5):
        document.locator(f"#page-{number}").screenshot(path=str(OUT / f"report-page-{number}.png"))
    document.pdf(path=str(OUT / "sample-bill.pdf"), print_background=True, prefer_css_page_size=True)
    pdf = pymupdf.open(OUT / "sample-bill.pdf")
    assert len(pdf) == 4, f"Expected 4 PDF pages, got {len(pdf)}"
    text = "\n".join(p.get_text() for p in pdf)
    assert "Alexandra Montgomery-Wellington" in text
    assert "Separate Supply Road" in text
    assert "Charlotte Bunting" not in text
    assert "SAMPLE" in ''.join(text.split())
    # Decode the actual printed QR area, rasterised from PDF at 300 dpi.
    pdf_qr_results = []
    for page_number, qr in [(1, qr_updated[0]), (2, qr_updated[1])]:
        box = document.locator(f'img[data-qr-fuel="{qr["fuel"]}"]').evaluate("""img => {
            const rect=img.getBoundingClientRect(), page=img.closest('.pdf-page').getBoundingClientRect();
            return [rect.left-page.left, rect.top-page.top, rect.right-page.left, rect.bottom-page.top];
        }""")
        clip = pymupdf.Rect(*(coordinate * .75 for coordinate in box))
        pixmap = pdf[page_number].get_pixmap(matrix=pymupdf.Matrix(300/72, 300/72), clip=clip, alpha=False)
        image_data = [channel for pixel in range(pixmap.width * pixmap.height) for channel in (*pixmap.samples[pixel*3:pixel*3+3], 255)]
        scanned = document.evaluate("""({data,width,height}) => window.jsQR(new Uint8ClampedArray(data), width, height)?.data""", {"data": image_data, "width": pixmap.width, "height": pixmap.height})
        assert scanned == qr['decoded'], f'PDF {qr["fuel"]} QR scan failed'
        pdf_qr_results.append(qr['fuel'])
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.screenshot(path=str(OUT / "mobile.png"), full_page=True)
    assert not errors, errors
    legacy_data = page.evaluate("JSON.parse(localStorage.getItem('energy-bill-prototype-draft-v1')).draft")
    del legacy_data['fixed']
    legacy_page = browser.new_page()
    legacy_page.add_init_script(f"if (location.protocol === 'http:') localStorage.setItem('energy-bill-prototype-draft-v1', JSON.stringify({json.dumps({'version': 1, 'draft': legacy_data})}));")
    legacy_page.goto('http://127.0.0.1:5173/', wait_until='networkidle')
    legacy_page.wait_for_function("!document.querySelector('#print').disabled")
    assert legacy_page.locator('#name').input_value() == legacy_data['name']
    assert legacy_page.locator('#periodStart').input_value() == legacy_data['periodStart']
    assert len(legacy_page.locator('[name^="fixed."]').all()) == 15
    assert all(element.input_value() for element in legacy_page.locator('[name^="fixed."]:not([name="fixed.rotaBlockLetter"])').all())
    (OUT / "browser-checks.json").write_text(json.dumps({"pdf_pages": len(pdf), "runtime_errors": errors, "customer_address_date_sync": "passed", "draft_restore": "passed", "fixed_profile_preserved_when_randomizing": "passed", "manual_day_night_rates": "passed", "legacy_draft_migration": "passed", "responsive_390px": "passed", "qr_codes": qr_updated, "pdf_qr_scans": pdf_qr_results}, indent=2), encoding="utf-8")
    browser.close()
    print("Browser checks passed: fixed customer profile, randomization preserves 15 fields including rota block, separate day/night rates, validation, draft restoration/migration, responsive layout, 4-page PDF and both PDF QR scans.")
