/* =================================================================
   FX-LAYER – seitenuebergreifende Premium-Interaktionen
   =================================================================
   Ergaenzt die Inline-Effekte der Startseite (Spotlight, Magnetic auf
   [data-magnetic]) um Effekte fuer ALLE Seiten:

   - [data-parallax=N]  sanfter Parallax-Versatz beim Scrollen (max N px)
   - .art-card/.kpi-card  Maus-Spotlight wie auf der Startseite
   - .nav-links         Scrollspy: aktiver Abschnitt wird markiert

   Alles deaktiviert bei prefers-reduced-motion; Zeigereffekte nur bei
   echter Maus (pointer:fine), nie auf Touch.
   ================================================================= */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  var fine = window.matchMedia("(pointer:fine)").matches;

  /* ---------- injizierte Styles ---------- */
  var css = [
    "[data-tilt]{position:relative;transform-style:preserve-3d;will-change:transform;}",
    ".fx-glare{position:absolute;inset:0;pointer-events:none;border-radius:inherit;opacity:0;",
    "transition:opacity .35s ease;mix-blend-mode:soft-light;z-index:3;",
    "background:radial-gradient(340px circle at var(--gx,50%) var(--gy,50%),rgba(255,255,255,.45),transparent 62%);}",
    "[data-tilt]:hover .fx-glare{opacity:1;}",
    ".fxspot{position:relative;}",
    ".fxspot::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;",
    "opacity:0;transition:opacity .45s ease;z-index:1;",
    "background:radial-gradient(320px circle at var(--mx,50%) var(--my,50%),rgba(62,104,16,.07),transparent 65%);}",
    ".fxspot:hover::before{opacity:1;}",
    ".nav-links a.aktiv{color:var(--fg);}",
    ".nav-links a.aktiv::after{width:100%;}"
  ].join("");
  var tag = document.createElement("style");
  tag.textContent = css;
  document.head.appendChild(tag);

  function init() {

    /* ---------- Scrollspy (laeuft auch bei reduced motion, ist nur Zustand) ---------- */
    (function () {
      var links = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
      var paare = [];
      links.forEach(function (a) {
        var h = a.getAttribute("href") || "";
        var i = h.indexOf("#");
        if (i < 0) return;
        var ziel = document.getElementById(h.slice(i + 1));
        if (ziel) paare.push([ziel, a]);
      });
      if (!paare.length || !("IntersectionObserver" in window)) return;
      var io = new IntersectionObserver(function (eintraege) {
        eintraege.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (a) { a.classList.remove("aktiv"); });
          paare.forEach(function (p) { if (p[0] === e.target) p[1].classList.add("aktiv"); });
        });
      }, { rootMargin: "-35% 0px -55% 0px" });
      paare.forEach(function (p) { io.observe(p[0]); });
    })();

    if (reduce) return; /* ab hier nur Bewegung */

    /* ---------- Parallax ---------- */
    (function () {
      var els = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));
      if (!els.length) return;
      var ticking = false;
      function anwenden() {
        ticking = false;
        var y = window.scrollY;
        els.forEach(function (el) {
          var max = parseFloat(el.getAttribute("data-parallax")) || 40;
          var h = el.closest("header,section") ? el.closest("header,section").offsetHeight : window.innerHeight;
          var t = Math.min(Math.max(y / h, 0), 1);
          el.style.transform = "translate3d(0," + (-t * max).toFixed(1) + "px,0)";
        });
      }
      window.addEventListener("scroll", function () {
        if (!ticking) { ticking = true; requestAnimationFrame(anwenden); }
      }, { passive: true });
      anwenden();
    })();

    if (!fine) return; /* ab hier nur echte Maus */

    /* ---------- Spotlight auf Karten (Unterseiten) ---------- */
    (function () {
      var karten = document.querySelectorAll(".art-card,.kpi-card");
      if (!karten.length) return;
      karten.forEach(function (el) { el.classList.add("fxspot"); });
      document.addEventListener("pointermove", function (e) {
        var t = e.target.closest(".fxspot");
        if (!t) return;
        var r = t.getBoundingClientRect();
        t.style.setProperty("--mx", (e.clientX - r.left) + "px");
        t.style.setProperty("--my", (e.clientY - r.top) + "px");
      }, { passive: true });
    })();

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
