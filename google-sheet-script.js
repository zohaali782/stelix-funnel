// Paste this into your Google Sheet: Extensions > Apps Script.
// Change SECRET below to your ADMIN_KEY (the same value you put on Render).
const SECRET = 'stelix-leads-2026-zoha';

function doPost(e) {
  const data = JSON.parse(e.postData.contents || '{}');
  if (data.secret !== SECRET) return reply({ ok: false, error: 'wrong secret' });

  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName('Leads') || book.insertSheet('Leads');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date', 'Name', 'Email', 'Phone', 'Source']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // the leading ' keeps phone numbers like +92... as text and blocks formula tricks
  const safe = (v) => "'" + String(v || '').slice(0, 160);
  sheet.appendRow([new Date(), safe(data.name), safe(data.email), safe(data.phone), safe(data.source)]);
  return reply({ ok: true });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
