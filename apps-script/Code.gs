/**
 * Warm Hands (Teplo Ruk) – sign-up backend.
 * Google Apps Script bound to a Google Sheet. See SETUP.md.
 *
 *   POST /exec               → new sign-up, sends a confirmation email
 *   GET  /exec?action=count  → { count } of confirmed sign-ups
 *   GET  /exec?action=confirm&token=…  → confirms a sign-up (link from the email)
 */

// Public address of the site (no trailing slash).
var SITE_URL = 'https://fesenko89.github.io/teplo-ruk';
var SHEET_NAME = 'Signups';
var HEADERS = ['created_at', 'email', 'country', 'amount_usd', 'employer', 'open_to_larger',
  'source', 'ref_by', 'ref_code', 'token', 'confirmed', 'confirmed_at', 'emails_sent', 'lang'];
var TEXT = {
  en: {
    subject: 'Please confirm your sign-up',
    hi: 'Hi,',
    thanks: 'Thanks for saying you would support <b>Warm Hands</b> – a permanent fund for Ukrainian pensioners.',
    button: 'Confirm my sign-up',
    note: 'Only confirmed sign-ups are counted. We do not accept money: the charity is not registered yet. We will email you only if the fund launches.',
    ignore: "If you didn't sign up, just ignore this email.",
    privacy: 'Privacy Policy',
    okTitle: "Thank you – you're confirmed.", okText: 'Your sign-up now counts.',
    badTitle: 'This link is not valid.', badText: 'Please sign up again on the site.',
    back: 'Back to the site', brand: 'Warm Hands'
  },
  uk: {
    subject: 'Підтвердіть, будь ласка, вашу заявку',
    hi: 'Вітаємо!',
    thanks: 'Дякуємо, що готові підтримати <b>«Тепло рук»</b> – вічний фонд для українських пенсіонерів.',
    button: 'Підтвердити заявку',
    note: 'Зараховуються лише підтверджені заявки. Гроші ми не приймаємо: фонд ще не зареєстровано. Ми напишемо вам лише тоді, коли фонд запуститься.',
    ignore: 'Якщо ви не залишали заявку, просто проігноруйте цей лист.',
    privacy: 'Політика конфіденційності',
    okTitle: 'Дякуємо – заявку підтверджено.', okText: 'Тепер вона зарахована.',
    badTitle: 'Посилання недійсне.', badText: 'Будь ласка, залиште заявку на сайті ще раз.',
    back: 'Повернутися на сайт', brand: 'Тепло рук'
  },
  es: {
    subject: 'Confirma tu inscripción',
    hi: 'Hola:',
    thanks: 'Gracias por decirnos que apoyarías <b>Manos Cálidas</b>, un fondo permanente para pensionistas ucranianos.',
    button: 'Confirmar mi inscripción',
    note: 'Solo se cuentan las inscripciones confirmadas. No aceptamos dinero: la fundación aún no está registrada. Solo te escribiremos si el fondo se pone en marcha.',
    ignore: 'Si no te has inscrito, ignora este email.',
    privacy: 'Política de privacidad',
    okTitle: 'Gracias: inscripción confirmada.', okText: 'Tu inscripción ya cuenta.',
    badTitle: 'Este enlace no es válido.', badText: 'Vuelve a inscribirte en la web.',
    back: 'Volver a la web', brand: 'Manos Cálidas'
  }
};
function text_(lang) { return TEXT[lang] || TEXT.en; }

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
  var data = sheet_().getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < data.length; i++) if (data[i][COL.confirmed] === true) n++;
  cache.put('count', String(n), 60);
  return n;
}

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'count') return json_({ count: confirmedCount_() });
  if (action === 'confirm') return confirm_(e.parameter.token);
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
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][COL.email] === email) {
        var row = data[i];
        // Already signed up: resend the confirmation (at most 3 emails per address).
        if (row[COL.confirmed] !== true && row[COL.emails_sent] < 3) {
          sendConfirmation_(email, row[COL.token], row[COL.lang]);
          sh.getRange(i + 1, COL.emails_sent + 1).setValue(row[COL.emails_sent] + 1);
        }
        return json_({ ok: true, refCode: row[COL.ref_code], already: row[COL.confirmed] === true });
      }
    }

    var refBy = /^[A-Z0-9]{4,12}$/i.test(p.refBy || '') ? String(p.refBy).toUpperCase() : '';
    var refCode = randomCode_(6);
    var token = Utilities.getUuid();
    var lang = TEXT[p.lang] ? p.lang : 'en';
    sh.appendRow([
      new Date(), email, p.country, amount, clean_(p.employer, 120), p.bigger === 'yes',
      clean_(p.source, 60), refBy, refCode, token, false, '', 1, lang
    ]);
    sendConfirmation_(email, token, lang);
    return json_({ ok: true, refCode: refCode });
  } finally {
    lock.releaseLock();
  }
}

function sendConfirmation_(email, token, lang) {
  var T = text_(lang);
  var url = ScriptApp.getService().getUrl() + '?action=confirm&token=' + encodeURIComponent(token);
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
      '<p style="color:#777;font-size:12px">' + T.privacy + ': ' + SITE_URL + '/privacy.html?lang=' + (TEXT[lang] ? lang : 'en') + '</p>'
  });
}

function confirm_(token) {
  var sh = sheet_();
  var data = sh.getDataRange().getValues();
  var row = null;
  for (var i = 1; i < data.length; i++) {
    if (token && data[i][COL.token] === token) {
      row = data[i];
      if (row[COL.confirmed] !== true) {
        sh.getRange(i + 1, COL.confirmed + 1, 1, 2).setValues([[true, new Date()]]);
        CacheService.getScriptCache().remove('count');
      }
      break;
    }
  }
  var lang = row && TEXT[row[COL.lang]] ? row[COL.lang] : 'en';
  var T = text_(lang);
  var back = SITE_URL + '/?confirmed=1&lang=' + lang + '#top';
  var html = row
    ? '<h2>' + T.okTitle + '</h2><p>' + T.okText + '</p>'
    : '<h2>' + T.badTitle + '</h2><p>' + T.badText + '</p>';
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;text-align:center">' +
    html + '<p><a target="_top" href="' + back + '" style="background:#ffc94a;color:#15192b;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">' + T.back + '</a></p></div>'
  ).setTitle(T.brand).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Menu: Warm Hands → Refresh referral stats. Writes a "Referrals" sheet. */
function refreshReferralStats() {
  var data = sheet_().getDataRange().getValues();
  var owner = {}, stats = {};
  for (var i = 1; i < data.length; i++) owner[data[i][COL.ref_code]] = data[i][COL.email];
  for (var j = 1; j < data.length; j++) {
    var by = data[j][COL.ref_by];
    if (!by) continue;
    stats[by] = stats[by] || { all: 0, confirmed: 0 };
    stats[by].all++;
    if (data[j][COL.confirmed] === true) stats[by].confirmed++;
  }
  var rows = Object.keys(stats).map(function (code) {
    return [code, owner[code] || '(unknown)', stats[code].confirmed, stats[code].all];
  }).sort(function (a, b) { return b[2] - a[2]; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = ss.getSheetByName('Referrals') || ss.insertSheet('Referrals');
  out.clear();
  out.appendRow(['ref_code', 'owner_email', 'confirmed_signups', 'all_signups']);
  if (rows.length) out.getRange(2, 1, rows.length, 4).setValues(rows);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Warm Hands')
    .addItem('Refresh referral stats', 'refreshReferralStats')
    .addToUi();
}
