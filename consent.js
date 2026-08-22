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
  var META_PIXEL_ID = "1032721282806447";

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
        "pers&ouml;nliche Profile. Analyse- und Marketing-Dienste mit Cookies (Microsoft&nbsp;Clarity, " +
        "Meta&nbsp;Pixel) laden wir " +
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

  /* Laedt Microsoft Clarity + Meta Pixel. Nur von hier aufgerufen, nur nach Einwilligung.
     Bewusst KEIN <noscript>-Fallback-Pixel im HTML: der wuerde ohne Einwilligung feuern. */
  function loadMarketing() {
    if (window.__mreMarketing) return;
    window.__mreMarketing = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);

    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");

    /* Signal fuer Seiten, die eigene Ereignisse messen (z. B. der Werbe-Check-Funnel):
       Sie sammeln bis hierher in einer Warteschlange und schicken erst nach diesem
       Ereignis los. Ohne Einwilligung wird die Warteschlange schlicht verworfen. */
    try {
      window.dispatchEvent(new CustomEvent("mre:marketing-bereit"));
    } catch (e) { /* aeltere Browser ohne CustomEvent-Konstruktor: kein Nachsenden */ }
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
      var vorher = read();
      var warAktiv = !!(vorher && vorher.marketing);
      save(all);
      banner.hidden = true;

      if (all) { loadMarketing(); return; }

      /* Echter Widerruf: Wer die Einwilligung zurueckzieht, erwartet, dass die
         Messung endet. Die bereits eingehaengten Skripte (Clarity, Meta Pixel) lassen
         sich nicht zuverlaessig entladen, deshalb Cookies loeschen und Seite neu laden. */
      if (warAktiv) {
        loescheMarketingCookies();
        location.reload();
      }
    });
    return banner;
  }

  /* Loescht die von Clarity und dem Meta Pixel gesetzten Cookies auf allen plausiblen
     Domain-/Pfad-Kombinationen. */
  function loescheMarketingCookies() {
    var namen = ["_clck", "_clsk", "CLID", "ANONCHK", "MR", "MUID", "SM", "_fbp", "_fbc"];
    var host = location.hostname;
    var domains = ["", host, "." + host];
    var teile = host.split(".");
    if (teile.length > 2) domains.push("." + teile.slice(-2).join("."));
    namen.forEach(function (n) {
      domains.forEach(function (d) {
        ["/", location.pathname].forEach(function (p) {
          document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=" + p +
            (d ? "; domain=" + d : "") + "; SameSite=Lax";
        });
      });
    });
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
