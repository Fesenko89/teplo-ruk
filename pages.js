// Language switching for the secondary pages (principles, privacy).
// Each page holds one <article data-page-lang="xx"> per language.
(function () {
  var BRAND = { en: "Warm Hands", uk: "Тепло рук", es: "Manos Cálidas" };
  var BACK = { en: "← Back to the site", uk: "← Повернутися на сайт", es: "← Volver a la web" };

  var gcCode = window.SITE_CONFIG.GOATCOUNTER_CODE;
  if (gcCode) {
    var gc = document.createElement("script");
    gc.async = true;
    gc.src = "https://gc.zgo.at/count.js";
    gc.dataset.goatcounter = "https://" + gcCode + ".goatcounter.com/count";
    document.head.appendChild(gc);
    document.querySelectorAll(".if-analytics").forEach(function (el) { el.hidden = false; });
  }

  document.querySelectorAll(".contact-email").forEach(function (a) {
    a.href = "mailto:" + window.SITE_CONFIG.CONTACT_EMAIL;
    a.textContent = window.SITE_CONFIG.CONTACT_EMAIL;
  });

  function setLang(lang) {
    var article;
    document.querySelectorAll("[data-page-lang]").forEach(function (el) {
      el.hidden = el.dataset.pageLang !== lang;
      if (!el.hidden) article = el;
    });
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    });
    document.querySelector(".brand-name").textContent = BRAND[lang];
    document.querySelectorAll(".back-link").forEach(function (a) { a.textContent = BACK[lang]; });
    document.title = article.querySelector("h1").textContent + " – " + BRAND[lang];
    document.documentElement.lang = lang;
    try { localStorage.setItem("lang", lang); } catch (e) {}
  }

  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.dataset.lang); });
  });

  var saved = null;
  try { saved = localStorage.getItem("lang"); } catch (e) {}
  var fromUrl = new URLSearchParams(location.search).get("lang");
  setLang(BRAND[fromUrl] ? fromUrl : BRAND[saved] ? saved : "en");
})();
