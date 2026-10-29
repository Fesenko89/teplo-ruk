/**
 * Warm Hands (Teplo Ruk) – sign-up backend.
 * Google Apps Script bound to a Google Sheet. See SETUP.md.
 *
 *   POST /exec                          → new sign-up, sends a confirmation email
 *   GET  /exec?action=count             → { count } of confirmed sign-ups
 *   GET  /exec?action=confirm&token=…   → confirms a sign-up (link from the email)
 *   GET  /exec?action=delete&token=…    → asks, then deletes the sign-up (link from the email)
 *
 * Gmail allows about 100 emails a day. When the quota runs out, new sign-ups are
 * saved with emails_sent = 0 and processQueue() (hourly trigger) sends them later.
 */

// Public address of the site (no trailing slash).
var SITE_URL = 'https://fesenko89.github.io/teplo-ruk';
var SHEET_NAME = 'Signups';
var HEADERS = ['created_at', 'email', 'country', 'amount_usd', 'employer', 'open_to_larger',
  'source', 'ref_by', 'ref_code', 'token', 'confirmed', 'confirmed_at', 'emails_sent', 'lang',
  'utm_source', 'utm_campaign'];
var TEXT = {
  en: {
    subject: 'Please confirm your sign-up',
    hi: 'Hi,',
    thanks: 'Thanks for saying you would support <b>Warm Hands</b> – a permanent fund for Ukrainian pensioners.',
    button: 'Confirm my sign-up',
    note: 'Only confirmed sign-ups are counted. We do not accept money: the charity is not registered yet. We will email you only if the fund launches.',
    ignore: "If you didn't sign up, just ignore this email.",
    changed: 'Changed your mind?', deleteLink: 'Delete my data',
    privacy: 'Privacy Policy',
    okTitle: "Thank you – you're confirmed.", okText: 'Your sign-up now counts.',
    badTitle: 'This link is not valid.', badText: 'Please sign up again on the site.',
    delAsk: 'Delete your sign-up and all your data?', delBtn: 'Yes, delete',
    delDone: 'Your data has been deleted.', delGone: 'There is no data for this link. It may already be deleted.',
    back: 'Back to the site', brand: 'Warm Hands'
  },
  uk: {
    subject: 'Підтвердіть, будь ласка, вашу заявку',
    hi: 'Вітаємо!',
    thanks: 'Дякуємо, що готові підтримати <b>«Тепло рук»</b> – вічний фонд для українських пенсіонерів.',
    button: 'Підтвердити заявку',
    note: 'Зараховуються лише підтверджені заявки. Гроші ми не приймаємо: фонд ще не зареєстровано. Ми напишемо вам лише тоді, коли фонд запуститься.',
    ignore: 'Якщо ви не залишали заявку, просто проігноруйте цей лист.',
    changed: 'Передумали?', deleteLink: 'Видалити мої дані',
    privacy: 'Політика конфіденційності',
    okTitle: 'Дякуємо – заявку підтверджено.', okText: 'Тепер вона зарахована.',
    badTitle: 'Посилання недійсне.', badText: 'Будь ласка, залиште заявку на сайті ще раз.',
    delAsk: 'Видалити вашу заявку та всі ваші дані?', delBtn: 'Так, видалити',
    delDone: 'Ваші дані видалено.', delGone: 'За цим посиланням даних немає. Можливо, їх уже видалено.',
    back: 'Повернутися на сайт', brand: 'Тепло рук'
  },
  es: {
    subject: 'Confirma tu inscripción',
    hi: 'Hola:',
    thanks: 'Gracias por decirnos que apoyarías <b>Manos Cálidas</b>, un fondo permanente para pensionistas ucranianos.',
    button: 'Confirmar mi inscripción',
    note: 'Solo se cuentan las inscripciones confirmadas. No aceptamos dinero: la fundación aún no está registrada. Solo te escribiremos si el fondo se pone en marcha.',
    ignore: 'Si no te has inscrito, ignora este email.',
    changed: '¿Has cambiado de opinión?', deleteLink: 'Eliminar mis datos',
    privacy: 'Política de privacidad',
    okTitle: 'Gracias: inscripción confirmada.', okText: 'Tu inscripción ya cuenta.',
    badTitle: 'Este enlace no es válido.', badText: 'Vuelve a inscribirte en la web.',
    delAsk: '¿Eliminar tu inscripción y todos tus datos?', delBtn: 'Sí, eliminar',
    delDone: 'Tus datos se han eliminado.', delGone: 'No hay datos para este enlace. Puede que ya se hayan eliminado.',
    back: 'Volver a la web', brand: 'Manos Cálidas'
  }
};
function text_(lang) { return TEXT[lang] || TEXT.en; }
function lang_(lang) { return TEXT[lang] ? lang : 'en'; }

var COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i; });

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < HEADERS.length) {
    // Sheet created by an older version of this script: add new columns.
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

function rows_(sh) {
  return sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), HEADERS.length).getValues();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function randomCode_(len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = '';
  for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function clean_(v, max) {
  return String(v || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max || 200)
    // Stop the value being read as a formula when the sheet is opened.
    .replace(/^[=+\-@]/, "'$&");
}

function confirmedCount_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('count');
  if (cached !== null) return Number(cached);
  var data = rows_(sheet_());
  var n = 0;
  for (var i = 1; i < data.length; i++) if (data[i][COL.confirmed] === true) n++;
  cache.put('count', String(n), 60);
  return n;
}

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'count') return json_({ count: confirmedCount_() });
  if (action === 'confirm') return confirm_(e.parameter.token);
  if (action === 'delete') return delete_(e.parameter.token, e.parameter.sure === 'yes');
  return json_({ ok: false, error: 'Unknown action' });
}

function doPost(e) {
  var p = e.parameter;
  if (p.website) return json_({ ok: true, refCode: randomCode_(6) }); // honeypot: pretend success

  var email = String(p.email || '').trim().toLowerCase();
  var amount = Number(p.amount);
  if (!/^[^\s@=+\-][^\s@]*@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return json_({ ok: false, error: 'Please enter a valid email.' });
  if (!/^[A-Z]{2}$/.test(p.country || '')) return json_({ ok: false, error: 'Please choose your country.' });
  if (!(amount > 0 && amount <= 100000)) return json_({ ok: false, error: 'Please choose a monthly amount.' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_();
    var data = rows_(sh);
    for (var i = 1; i < data.length; i++) {
      if (data[i][COL.email] === email) {
        var row = data[i];
        // Already signed up: resend the confirmation (at most 3 emails per address).
        if (row[COL.confirmed] !== true && row[COL.emails_sent] < 3 && trySend_(email, row[COL.token], row[COL.lang])) {
          sh.getRange(i + 1, COL.emails_sent + 1).setValue(Number(row[COL.emails_sent]) + 1);
        }
        return json_({ ok: true, refCode: row[COL.ref_code], already: row[COL.confirmed] === true });
      }
    }

    var refBy = /^[A-Z0-9]{4,12}$/i.test(p.refBy || '') ? String(p.refBy).toUpperCase() : '';
    var refCode = randomCode_(6);
    var token = Utilities.getUuid();
    var lang = lang_(p.lang);
    var sent = trySend_(email, token, lang);
    sh.appendRow([
      new Date(), email, p.country, amount, clean_(p.employer, 120), p.bigger === 'yes',
      clean_(p.source, 60), refBy, refCode, token, false, '', sent ? 1 : 0, lang,
      clean_(p.utmSource, 60), clean_(p.utmCampaign, 60)
    ]);
    return json_({ ok: true, refCode: refCode });
  } finally {
    lock.releaseLock();
  }
}

// Sends the confirmation if today's Gmail quota allows it. Returns false if it was queued instead.
function trySend_(email, token, lang) {
  if (MailApp.getRemainingDailyQuota() < 1) return false;
  try {
    sendConfirmation_(email, token, lang);
    return true;
  } catch (err) {
    return false; // most likely the quota; processQueue() will retry
  }
}

function sendConfirmation_(email, token, lang) {
  lang = lang_(lang);
  var T = text_(lang);
  var base = ScriptApp.getService().getUrl();
  var url = base + '?action=confirm&token=' + encodeURIComponent(token);
  var del = base + '?action=delete&token=' + encodeURIComponent(token);
  MailApp.sendEmail({
    to: email,
    name: T.brand + ' – One Dollar. Forever.',
    subject: T.subject,
    htmlBody:
      '<p>' + T.hi + '</p>' +
      '<p>' + T.thanks + '</p>' +
      '<p><a href="' + url + '" style="background:#ffc94a;color:#15192b;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">' + T.button + '</a></p>' +
      '<p>' + T.note + '</p>' +
      '<p>' + T.ignore + '</p>' +
      '<p style="color:#777;font-size:12px">' + T.changed + ' <a href="' + del + '" style="color:#777">' + T.deleteLink + '</a> · ' +
      '<a href="' + SITE_URL + '/privacy.html?lang=' + lang + '" style="color:#777">' + T.privacy + '</a></p>'
  });
}

/** Hourly trigger: sends confirmations that were queued because of the Gmail quota. */
function processQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var sh = sheet_();
    var data = rows_(sh);
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[COL.email] && row[COL.confirmed] !== true && Number(row[COL.emails_sent]) === 0) {
        if (!trySend_(row[COL.email], row[COL.token], row[COL.lang])) break; // quota used up, try next hour
        sh.getRange(i + 1, COL.emails_sent + 1).setValue(1);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function findRow_(sh, token) {
  if (!token) return null;
  var data = rows_(sh);
  for (var i = 1; i < data.length; i++) {
    if (data[i][COL.token] === token) return { index: i + 1, row: data[i] };
  }
  return null;
}

function page_(T, lang, body, withBack) {
  var btn = 'background:#ffc94a;color:#15192b;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 16px;text-align:center">' + body +
    (withBack ? '<p><a target="_top" href="' + SITE_URL + '/?lang=' + lang + '" style="' + btn + '">' + T.back + '</a></p>' : '') +
    '</div>'
  ).setTitle(T.brand).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function confirm_(token) {
  var sh = sheet_();
  var found = findRow_(sh, token);
  if (found && found.row[COL.confirmed] !== true) {
    sh.getRange(found.index, COL.confirmed + 1, 1, 2).setValues([[true, new Date()]]);
    CacheService.getScriptCache().remove('count');
  }
  var lang = lang_(found && found.row[COL.lang]);
  var T = text_(lang);
  if (!found) return page_(T, lang, '<h2>' + T.badTitle + '</h2><p>' + T.badText + '</p>', true);
  var btn = 'background:#ffc94a;color:#15192b;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block';
  return page_(T, lang, '<h2>' + T.okTitle + '</h2><p>' + T.okText + '</p>' +
    '<p><a target="_top" href="' + SITE_URL + '/?confirmed=1&lang=' + lang + '#top" style="' + btn + '">' + T.back + '</a></p>', false);
}

// Two steps (ask, then delete) so that email link scanners can't delete data by opening the link.
function delete_(token, sure) {
  var sh = sheet_();
  var found = findRow_(sh, token);
  var lang = lang_(found && found.row[COL.lang]);
  var T = text_(lang);
  if (!found) return page_(T, lang, '<h2>' + T.delGone + '</h2>', true);
  if (!sure) {
    var url = ScriptApp.getService().getUrl() + '?action=delete&sure=yes&token=' + encodeURIComponent(token);
    return page_(T, lang, '<h2>' + T.delAsk + '</h2><p><a target="_top" href="' + url +
      '" style="background:#c0392b;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block">' +
      T.delBtn + '</a></p>', true);
  }
  sh.deleteRow(found.index);
  CacheService.getScriptCache().remove('count');
  return page_(T, lang, '<h2>' + T.delDone + '</h2>', true);
}

/** Menu: Warm Hands → Refresh stats. Writes the "Summary" and "Referrals" sheets. */
function refreshStats() {
  var data = rows_(sheet_()).slice(1).filter(function (r) { return r[COL.email]; });
  var confirmed = data.filter(function (r) { return r[COL.confirmed] === true; });
  var amounts = confirmed.map(function (r) { return Number(r[COL.amount_usd]) || 0; }).sort(function (a, b) { return a - b; });
  var total = amounts.reduce(function (s, a) { return s + a; }, 0);
  var median = amounts.length ? amounts[Math.floor((amounts.length - 1) / 2)] : 0;

  function countBy(rows, fn) {
    var m = {};
    rows.forEach(function (r) { var k = fn(r) || '(none)'; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function bucket(r) {
    var a = Number(r[COL.amount_usd]);
    return [5, 10, 25, 50].indexOf(a) !== -1 ? '$' + a : 'other';
  }

  var out = [
    ['Updated', new Date()],
    ['Confirmed sign-ups', confirmed.length],
    ['All sign-ups', data.length],
    ['Waiting for email (Gmail quota)', data.filter(function (r) { return Number(r[COL.emails_sent]) === 0 && r[COL.confirmed] !== true; }).length],
    ['Pledged $ per month (confirmed)', total],
    ['Average $ per month', amounts.length ? Math.round(total / amounts.length * 100) / 100 : 0],
    ['Median $ per month', median],
    ['Open to a larger or company gift (confirmed)', confirmed.filter(function (r) { return r[COL.open_to_larger] === true; }).length],
    ['', '']
  ];
  [['Amount (confirmed)', countBy(confirmed, bucket)],
   ['Country (confirmed)', countBy(confirmed, function (r) { return r[COL.country]; })],
   ['utm_source (confirmed)', countBy(confirmed, function (r) { return r[COL.utm_source]; })],
   ['utm_campaign (confirmed)', countBy(confirmed, function (r) { return r[COL.utm_campaign]; })],
   ['How they heard (confirmed)', countBy(confirmed, function (r) { return r[COL.source]; })],
   ['Language (confirmed)', countBy(confirmed, function (r) { return r[COL.lang]; })]
  ].forEach(function (t) {
    out.push([t[0], 'count']);
    t[1].forEach(function (row) { out.push(row); });
    out.push(['', '']);
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sum = ss.getSheetByName('Summary') || ss.insertSheet('Summary');
  sum.clear();
  sum.getRange(1, 1, out.length, 2).setValues(out);
  sum.getRange(1, 1, 8, 1).setFontWeight('bold');

  // Referrals: confirmed sign-ups that came through each person's invite link.
  var owner = {}, stats = {};
  data.forEach(function (r) { owner[r[COL.ref_code]] = r[COL.email]; });
  data.forEach(function (r) {
    var by = r[COL.ref_by];
    if (!by) return;
    stats[by] = stats[by] || { all: 0, confirmed: 0 };
    stats[by].all++;
    if (r[COL.confirmed] === true) stats[by].confirmed++;
  });
  var refs = Object.keys(stats).map(function (code) {
    return [code, owner[code] || '(unknown)', stats[code].confirmed, stats[code].all];
  }).sort(function (a, b) { return b[2] - a[2]; });
  var ref = ss.getSheetByName('Referrals') || ss.insertSheet('Referrals');
  ref.clear();
  ref.appendRow(['ref_code', 'owner_email', 'confirmed_signups', 'all_signups']);
  if (refs.length) ref.getRange(2, 1, refs.length, 4).setValues(refs);
}

/** Run once from the editor after pasting this code: grants permissions and starts the email queue. */
function setup() {
  sheet_();
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'processQueue'; });
  if (!exists) ScriptApp.newTrigger('processQueue').timeBased().everyHours(1).create();
  Logger.log('Ready. Emails left today: ' + MailApp.getRemainingDailyQuota());
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Warm Hands')
    .addItem('Refresh stats', 'refreshStats')
    .addItem('Send queued emails now', 'processQueue')
    .addToUi();
}
