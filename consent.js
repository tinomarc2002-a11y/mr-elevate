/* =================================================================
   COOKIE-CONSENT (DSGVO/TTDSG) – seitenuebergreifend
   =================================================================
   Laeuft auf JEDER Seite, damit Besucher, die ueber Google oder Ads
   direkt auf einer Unterseite landen, ihre Einwilligung genauso
   erteilen und widerrufen koennen wie auf der Startseite.

   Opt-in: Microsoft Clarity (Sitzungsaufzeichnung, einwilligungs-
   pflichtig) wird ausschliesslich nach aktiver Zustimmung geladen.
   Vorher verlaesst kein Analyse-Skript den Browser.

   Nicht einwilligungspflichtig und deshalb NICHT hier gesteuert:
   Vercel Analytics, cookielos und ohne personenbezogene Profile.

   Einbindung pro Seite:  <script defer src="/consent.js"></script>
   Widerruf-Link:         <a href="#" data-cc-open>Cookie-Einstellungen</a>
   ================================================================= */
(function () {
  "use strict";

  var KEY = "mre_consent_v1";
  var CLARITY_ID = "xritxdmsli";

  /* --- Styles: nutzen die Design-Tokens der jeweiligen Seite, mit
         Fallbacks fuer Seiten mit reduziertem Token-Satz (404, Rechtstexte). --- */
  var CSS = [
    ".cc{position:fixed;left:16px;right:16px;bottom:16px;z-index:400;max-width:580px;margin-inline:auto;",
    "background:var(--bg-card,#fffdf8);border:1px solid var(--line-strong,#cfc2a8);border-radius:16px;padding:20px 22px;",
    "box-shadow:0 30px 70px -28px rgba(0,0,0,.35);animation:ccIn .5s cubic-bezier(.22,.61,.36,1);",
    "font-family:var(--font-body,'Inter',system-ui,sans-serif);color:var(--fg,#211c17);}",
    ".cc[hidden]{display:none;}",
    "@keyframes ccIn{from{opacity:0;transform:translateY(22px);}to{opacity:1;transform:none;}}",
    ".cc-inner{display:flex;flex-direction:column;gap:16px;}",
    ".cc-text strong{font-family:var(--font-display,'Fraunces',Georgia,serif);font-size:1rem;display:block;margin-bottom:6px;}",
    ".cc-text p{font-size:.86rem;color:var(--fg-muted,#5c5349);line-height:1.55;}",
    ".cc-text a{color:var(--accent,#3e6810);text-decoration:underline;}",
    ".cc-actions{display:flex;gap:10px;}",
    ".btn-cc{flex:1;padding:12px 16px;min-height:46px;border-radius:100px;font-family:var(--font-display,'Fraunces',Georgia,serif);",
    "font-weight:500;font-size:.92rem;cursor:pointer;border:1px solid var(--line-strong,#cfc2a8);",
    "transition:background .18s ease,box-shadow .18s ease,border-color .18s ease,color .18s ease;}",
    ".btn-cc-ghost{background:rgba(0,0,0,.035);color:var(--fg,#211c17);}",
    ".btn-cc-ghost:hover{background:rgba(0,0,0,.07);border-color:var(--fg-dim,#675e51);}",
    ".btn-cc-accept{background:var(--bg-card,#fffdf8);color:var(--accent,#3e6810);border-color:var(--accent,#3e6810);}",
    ".btn-cc-accept:hover{background:var(--accent,#3e6810);color:var(--accent-ink,#f7f3ec);}",
    "@media(min-width:600px){.cc-inner{flex-direction:row;align-items:center;}.cc-actions{flex-shrink:0;width:300px;}}",
    "@media (prefers-reduced-motion:reduce){.cc{animation:none;}}"
  ].join("");

  var MARKUP =
    '<div class="cc-inner">' +
      '<div class="cc-text">' +
        "<strong>Cookies &amp; Datenschutz</strong>" +
        "<p>Wir nutzen nur technisch notwendige Mittel und eine <b>cookielose</b> Reichweitenmessung ohne " +
        "pers&ouml;nliche Profile. Analyse-Dienste mit Cookies (Microsoft&nbsp;Clarity) laden wir " +
        '<b>ausschlie&szlig;lich mit deiner Einwilligung</b>. Mehr in der <a href="/datenschutz">Datenschutzerkl&auml;rung</a>.</p>' +
      "</div>" +
      '<div class="cc-actions">' +
        '<button class="btn-cc btn-cc-ghost" type="button" data-cc="necessary">Nur notwendige</button>' +
        '<button class="btn-cc btn-cc-accept" type="button" data-cc="all">Alle akzeptieren</button>' +
      "</div>" +
    "</div>";

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
  }
  function save(marketing) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ necessary: true, marketing: !!marketing, ts: Date.now() }));
    } catch (e) {}
  }

  /* Laedt Microsoft Clarity. Nur von hier aufgerufen, nur nach Einwilligung. */
  function loadMarketing() {
    if (window.__mreMarketing) return;
    window.__mreMarketing = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);
  }

  var banner = null;
  function ensureBanner() {
    if (banner) return banner;
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    banner = document.createElement("div");
    banner.className = "cc";
    banner.id = "cookieConsent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Hinweis zu Cookies");
    banner.hidden = true;
    banner.innerHTML = MARKUP;
    document.body.appendChild(banner);

    banner.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cc]");
      if (!btn) return;
      var all = btn.getAttribute("data-cc") === "all";
      save(all);
      if (all) loadMarketing();
      banner.hidden = true;
    });
    return banner;
  }

  function init() {
    var saved = read();
    if (saved) {
      if (saved.marketing) loadMarketing();
    } else {
      ensureBanner().hidden = false;
    }
    /* Widerruf bzw. nachtraegliche Einwilligung ueber den Footer-Link */
    document.addEventListener("click", function (e) {
      var opener = e.target.closest("[data-cc-open]");
      if (!opener) return;
      e.preventDefault();
      ensureBanner().hidden = false;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
