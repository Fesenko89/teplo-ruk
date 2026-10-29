(function () {
  var LANGS = ["uk", "en", "es"];
  var nodes = document.querySelectorAll("[data-i18n]");
  var metaDesc = document.querySelector('meta[name="description"]');

  // Ukrainian is the source text written in index.html.
  var uk = {
    "meta.title": document.title,
    "meta.description": metaDesc.getAttribute("content")
  };
  nodes.forEach(function (el) { uk[el.dataset.i18n] = el.textContent; });
  window.I18N.uk = uk;

  function pickInitial() {
    var fromUrl = new URLSearchParams(location.search).get("lang");
    if (LANGS.indexOf(fromUrl) !== -1) return fromUrl;
    try {
      var saved = localStorage.getItem("lang");
      if (LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    var nav = (navigator.language || "uk").slice(0, 2);
    if (nav === "es") return "es";
    if (nav === "uk" || nav === "ru") return "uk";
    return "en";
  }

  function setLang(lang) {
    var dict = window.I18N[lang];
    nodes.forEach(function (el) {
      var text = dict[el.dataset.i18n];
      if (text) el.textContent = text;
    });
    document.title = dict["meta.title"];
    metaDesc.setAttribute("content", dict["meta.description"]);
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.lang === lang ? "true" : "false");
    });
    try { localStorage.setItem("lang", lang); } catch (e) {}
  }

  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.dataset.lang); });
  });

  var toggle = document.getElementById("menuToggle");
  var nav = document.getElementById("nav");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  nav.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  document.getElementById("year").textContent = new Date().getFullYear();
  setLang(pickInitial());
})();
