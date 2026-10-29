(function () {
  var cfg = window.SITE_CONFIG;
  var I18N = window.I18N;
  var LANGS = ["en", "uk", "es"];
  var LOCALE = { en: "en-US", uk: "uk-UA", es: "es-ES" };
  var $ = function (id) { return document.getElementById(id); };

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  // ---------- Language ----------
  // English is the source text in index.html; collect it once.
  var textNodes = document.querySelectorAll("[data-i18n]");
  var htmlNodes = document.querySelectorAll("[data-i18n-html]");
  var phNodes = document.querySelectorAll("[data-i18n-placeholder]");
  textNodes.forEach(function (el) { I18N.en[el.dataset.i18n] = el.textContent; });
  htmlNodes.forEach(function (el) { I18N.en[el.dataset.i18nHtml] = el.innerHTML; });
  phNodes.forEach(function (el) { I18N.en[el.dataset.i18nPlaceholder] = el.placeholder; });

  var lang = "en";
  function t(key, vars) {
    var s = I18N[lang][key] || I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  function pickInitial() {
    var fromUrl = new URLSearchParams(location.search).get("lang");
    if (LANGS.indexOf(fromUrl) !== -1) return fromUrl;
    var saved = store("lang");
    if (LANGS.indexOf(saved) !== -1) return saved;
    var nav = (navigator.language || "en").slice(0, 2);
    if (nav === "uk" || nav === "ru") return "uk";
    if (nav === "es") return "es";
    return "en";
  }

  function setLang(next) {
    lang = next;
    textNodes.forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    htmlNodes.forEach(function (el) { el.innerHTML = t(el.dataset.i18nHtml); });
    phNodes.forEach(function (el) { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.title = t("meta.title");
    document.querySelector('meta[name="description"]').setAttribute("content", t("meta.description"));
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    });
    store("lang", lang);
    fillCountries();
    calc();
    if (counterValue !== null) $("counterValue").textContent = fmt(counterValue);
  }

  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.dataset.lang); });
  });

  var fmt = function (n) { return Math.round(n).toLocaleString(LOCALE[lang]); };
  var usd = function (n) { return "$" + fmt(n); };

  // ---------- Links ----------
  var reddit = "https://www.reddit.com/user/" + cfg.REDDIT_USER;
  $("redditLink").href = reddit;
  $("redditProfile").href = reddit;
  $("contactLink").href = "mailto:" + cfg.CONTACT_EMAIL;

  // ---------- Calculator ----------
  var ADMIN = 0.01, GROWTH = 0.005, FUNERAL = 1.25, OPS = 0.90, FEES = 0.965;

  // Capital (in $) needed to support one pensioner forever.
  function costPerPensioner(r, fx, payout) {
    var w = r - ADMIN - GROWTH;
    if (w <= 0) return Infinity;
    var P = 12 * payout / fx;
    return P * (1 + FUNERAL * w) / w / (OPS * FEES);
  }

  var mode = "monthly";
  var inputs = {
    monthly: $("monthlyAmt"), months: $("months"), once: $("onceAmt"),
    r: $("r"), fx: $("fx"), payout: $("payout")
  };
  inputs.r.value = cfg.DEFAULT_REAL_YIELD;
  inputs.fx.value = cfg.DEFAULT_FX;
  inputs.payout.value = cfg.DEFAULT_PAYOUT;

  function calc() {
    var gift = mode === "monthly"
      ? +inputs.monthly.value * +inputs.months.value
      : +inputs.once.value;
    var r = (+inputs.r.value || 0) / 100;
    var fx = +inputs.fx.value || cfg.DEFAULT_FX;
    var payout = +inputs.payout.value || cfg.DEFAULT_PAYOUT;

    $("monthlyOut").textContent = "$" + inputs.monthly.value;
    $("monthsOut").textContent = inputs.months.value;
    $("onceOut").textContent = usd(+inputs.once.value);
    $("giftTotal").textContent = mode === "monthly"
      ? t("calc.giftMonthly", { a: "$" + inputs.monthly.value, n: inputs.months.value, t: usd(gift) })
      : usd(gift);

    document.querySelectorAll("[data-r]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(+b.dataset.r === Math.round(r * 1000) / 10));
    });

    var C = costPerPensioner(r, fx, payout);
    var warn = $("resWarn");
    if (!isFinite(C)) {
      $("resMain").textContent = t("calc.breaks");
      $("resCost").textContent = t("calc.breaksDetail", { r: (r * 100).toLocaleString(LOCALE[lang], { maximumFractionDigits: 1 }) });
      $("resSmall").textContent = "";
      warn.hidden = true;
      return;
    }

    var N = C / gift;
    $("resMain").innerHTML = N <= 1
      ? t("calc.alone", { k: Math.floor(1 / N) })
      : t("calc.people", { n: fmt(N) });
    $("resCost").textContent = t("calc.cost", { c: usd(C) });
    var uah = payout * gift / C;
    $("resSmall").textContent = t("calc.share", {
      u: uah < 10 ? uah.toLocaleString(LOCALE[lang], { maximumFractionDigits: 1 }) : fmt(uah)
    });

    if (r < 0.05) {
      var ratio = C / costPerPensioner(0.05, fx, payout);
      warn.hidden = false;
      warn.textContent = t("calc.warn", { x: ratio.toLocaleString(LOCALE[lang], { maximumFractionDigits: 1 }) });
    } else {
      warn.hidden = true;
    }
  }

  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      document.querySelectorAll("[data-show]").forEach(function (el) {
        el.hidden = el.dataset.show !== mode;
      });
      calc();
    });
  });
  document.querySelectorAll("[data-r]").forEach(function (b) {
    b.addEventListener("click", function () { inputs.r.value = b.dataset.r; calc(); });
  });
  Object.keys(inputs).forEach(function (k) { inputs[k].addEventListener("input", calc); });

  // ---------- Referral ----------
  var params = new URLSearchParams(location.search);
  var refIn = params.get("ref");
  if (refIn && /^[A-Za-z0-9]{4,12}$/.test(refIn)) store("refBy", refIn);
  if (params.get("confirmed") === "1") $("confirmedBanner").hidden = false;

  // ---------- Counter (real number from the sheet only) ----------
  var counterValue = null;
  if (cfg.API_URL) {
    fetch(cfg.API_URL + "?action=count")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (typeof d.count === "number") {
          counterValue = d.count;
          $("counterValue").textContent = fmt(d.count);
          $("counterLine").hidden = false;
        }
      })
      .catch(function () {});
  }

  // ---------- Countries ----------
  var CODES = "AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BA BW BR BN BG BF BI CV KH CM CA KY CF TD CL CN CO KM CG CD CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KR KP XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NC NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");
  var sel = $("country");
  function fillCountries() {
    var names;
    try { names = new Intl.DisplayNames([lang], { type: "region" }); } catch (e) { names = null; }
    var chosen = sel.value;
    var countries = CODES.map(function (c) { return { code: c, name: names ? names.of(c) : c }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, lang); });
    sel.innerHTML = '<option value="">' + t("form.selectCountry") + "</option>" + countries.map(function (c) {
      return '<option value="' + c.code + '">' + c.name + "</option>";
    }).join("");
    sel.value = chosen;
  }

  // ---------- Form ----------
  var form = $("signupForm");
  var other = $("amountOther");
  form.addEventListener("change", function (e) {
    if (e.target.name === "amount") {
      other.hidden = e.target.value !== "other";
      if (!other.hidden) other.focus();
    }
  });

  function showError(msg) {
    var el = $("formError");
    el.textContent = msg;
    el.hidden = !msg;
  }

  function showThanks(refCode) {
    form.hidden = true;
    $("thanks").hidden = false;
    $("refLink").value = location.origin + location.pathname + "?ref=" + refCode;
  }

  $("copyRef").addEventListener("click", function () {
    var link = $("refLink");
    link.select();
    (navigator.clipboard ? navigator.clipboard.writeText(link.value) : Promise.reject())
      .catch(function () { document.execCommand("copy"); })
      .finally(function () { $("copyRef").textContent = t("thanks.copied"); });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showError("");
    var fd = new FormData(form);
    var email = (fd.get("email") || "").trim();
    var amount = fd.get("amount");
    if (amount === "other") amount = fd.get("amountOther");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(t("err.email"));
    if (!fd.get("country")) return showError(t("err.country"));
    if (!amount || +amount <= 0) return showError(t("err.amount"));
    if (!fd.get("consent")) return showError(t("err.consent"));
    if (!cfg.API_URL) return showError(t("err.closed"));

    var body = new URLSearchParams({
      email: email,
      country: fd.get("country"),
      amount: amount,
      employer: fd.get("employer") || "",
      bigger: fd.get("bigger") ? "yes" : "",
      source: fd.get("source") || "",
      refBy: store("refBy") || "",
      lang: lang,
      website: fd.get("website") || ""
    });

    var btn = $("submitBtn");
    btn.disabled = true;
    btn.textContent = t("form.sending");
    fetch(cfg.API_URL, { method: "POST", body: body })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || t("err.network"));
        showThanks(d.refCode);
      })
      .catch(function (err) {
        showError(err.message || t("err.network"));
        btn.disabled = false;
        btn.textContent = t("form.submit");
      });
  });

  setLang(pickInitial());
})();
