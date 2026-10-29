(function () {
  var cfg = window.SITE_CONFIG;
  var $ = function (id) { return document.getElementById(id); };

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

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

  var usd = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  var num = function (n) { return Math.round(n).toLocaleString("en-US"); };

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
      ? "$" + inputs.monthly.value + " × " + inputs.months.value + " months = " + usd(gift)
      : usd(gift);

    document.querySelectorAll("[data-r]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(+b.dataset.r === Math.round(r * 1000) / 10));
    });

    var C = costPerPensioner(r, fx, payout);
    var warn = $("resWarn");
    if (!isFinite(C)) {
      $("resMain").textContent = "At this yield the model breaks.";
      $("resCost").textContent = "A real yield of " + (r * 100).toFixed(1) + "% doesn't even cover 1% administration and 0.5% payout growth. Nothing could be paid without eating the capital.";
      $("resSmall").textContent = "";
      warn.hidden = true;
      return;
    }

    var N = C / gift;
    $("resMain").innerHTML = N <= 1
      ? "Your gift alone supports <b>" + Math.floor(1 / N) + "</b> pensioner" + (Math.floor(1 / N) > 1 ? "s" : "") + " forever."
      : "<b>" + num(N) + "</b> people giving like you = <b>1 pensioner</b> supported forever.";
    $("resCost").textContent = "Capital for one pensioner, forever: " + usd(C);
    var uah = payout * gift / C;
    $("resSmall").textContent = "Your share: ≈ " + (uah < 10 ? uah.toFixed(1) : num(uah)) + " UAH a month, forever.";

    var base = costPerPensioner(0.05, fx, payout);
    if (r < 0.05) {
      warn.hidden = false;
      warn.textContent = "Honest note: at this yield one person needs ≈ " + (C / base).toFixed(1) + "× more capital than at 5%.";
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
  calc();

  // ---------- Referral ----------
  var params = new URLSearchParams(location.search);
  var refIn = params.get("ref");
  if (refIn && /^[A-Za-z0-9]{4,12}$/.test(refIn)) store("refBy", refIn);
  if (params.get("confirmed") === "1") $("confirmedBanner").hidden = false;

  // ---------- Counter (real number from the sheet only) ----------
  if (cfg.API_URL) {
    fetch(cfg.API_URL + "?action=count")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (typeof d.count === "number") {
          $("counterValue").textContent = d.count.toLocaleString("en-US");
          $("counterLine").hidden = false;
        }
      })
      .catch(function () {});
  }

  // ---------- Countries ----------
  var CODES = "AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BA BW BR BN BG BF BI CV KH CM CA KY CF TD CL CN CO KM CG CD CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KR KP XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NC NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");
  var names;
  try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { names = null; }
  var countries = CODES.map(function (c) { return { code: c, name: names ? names.of(c) : c }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  var sel = $("country");
  sel.innerHTML = '<option value="">Select…</option>' + countries.map(function (c) {
    return '<option value="' + c.code + '">' + c.name + "</option>";
  }).join("");

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
      .finally(function () { $("copyRef").textContent = "Copied"; });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    showError("");
    var fd = new FormData(form);
    var email = (fd.get("email") || "").trim();
    var amount = fd.get("amount");
    if (amount === "other") amount = fd.get("amountOther");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Please enter a valid email.");
    if (!fd.get("country")) return showError("Please choose your country.");
    if (!amount || +amount <= 0) return showError("Please choose a monthly amount.");
    if (!fd.get("consent")) return showError("Please agree to the Privacy Policy.");
    if (!cfg.API_URL) return showError("Sign-ups are not open yet — the form backend isn't connected. Please check back soon.");

    var body = new URLSearchParams({
      email: email,
      country: fd.get("country"),
      amount: amount,
      employer: fd.get("employer") || "",
      bigger: fd.get("bigger") ? "yes" : "",
      source: fd.get("source") || "",
      refBy: store("refBy") || "",
      website: fd.get("website") || ""
    });

    var btn = $("submitBtn");
    btn.disabled = true;
    btn.textContent = "Sending…";
    fetch(cfg.API_URL, { method: "POST", body: body })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || "Something went wrong.");
        showThanks(d.refCode);
      })
      .catch(function (err) {
        showError(err.message || "Network error. Please try again.");
        btn.disabled = false;
        btn.textContent = "Count me in";
      });
  });
})();
