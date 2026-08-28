/* =================================================================
   COOKIE-CONSENT (DSGVO / TDDDG) – seitenuebergreifend
   =================================================================
   Laeuft auf JEDER Seite, damit Besucher, die ueber Google oder Ads
   direkt auf einer Unterseite landen, ihre Einwilligung genauso
   erteilen und widerrufen koennen wie auf der Startseite.

   Zwei getrennte Zwecke, zwei getrennte Schalter:
     Statistik  = Microsoft Clarity (Sitzungsaufzeichnung, Heatmaps)
     Marketing  = Meta Pixel (Zielgruppen, Conversion-Messung)
   Vorher hingen beide an einem einzigen Ja/Nein. Eine Einwilligung
   muss sich aber auf einen bestimmten Zweck beziehen, sonst traegt
   sie nicht. Deshalb die Ebene "Einstellungen" mit Schaltern.

   Ablehnen ist genauso leicht wie Annehmen: beide Knoepfe stehen auf
   derselben Ebene und sehen gleich wichtig aus. Nichts ist vorab
   angekreuzt. Der Widerruf ist ueber den Keks-Knopf unten links
   jederzeit erreichbar, also genauso einfach wie die Erteilung.

   Nicht einwilligungspflichtig und deshalb NICHT hier gesteuert:
   Vercel Analytics, cookielos und ohne personenbezogene Profile.

   Einbindung pro Seite:  <script defer src="/consent.js"></script>
   Widerruf-Link:         <a href="#" data-cc-open>Cookie-Einstellungen</a>
   ================================================================= */
(function () {
  "use strict";

  var KEY = "mre_consent_v2";
  var ALT_KEY = "mre_consent_v1";
  var CLARITY_ID = "xritxdmsli";
  var META_PIXEL_ID = "1032721282806447";

  /* --- Styles: nutzen die Design-Tokens der jeweiligen Seite, mit
         Fallbacks fuer Seiten mit reduziertem Token-Satz (404, Rechtstexte). --- */
  var CSS = [
    /* ---------- Dialog ---------- */
    ".cc{position:fixed;left:16px;right:16px;bottom:16px;z-index:400;max-width:600px;margin-inline:auto;",
    "background:var(--bg-card,#fffdf8);border:1px solid var(--line-strong,#cfc2a8);border-radius:16px;padding:20px 22px;",
    "box-shadow:0 30px 70px -28px rgba(0,0,0,.35);animation:ccIn .5s cubic-bezier(.22,.61,.36,1);",
    "font-family:var(--font-body,'Inter',system-ui,sans-serif);color:var(--fg,#211c17);}",
    ".cc[hidden]{display:none;}",
    "@keyframes ccIn{from{opacity:0;transform:translateY(22px);}to{opacity:1;transform:none;}}",
    /* Mit aufgeklappten Schaltern wird der Dialog hoch. Auf kleinen Displays
       waeren sonst die Knoepfe unten aus dem Bild geschoben und die Auswahl
       nicht mehr abschliessbar. Deshalb scrollt die Zweckliste in sich,
       die Knopfzeile bleibt immer sichtbar. */
    /* overflow-y:auto statt hidden: bei sehr flachen Fenstern (Handy quer)
       reicht selbst die geschrumpfte Liste nicht mehr, dann scrollt der
       Kasten als Ganzes und die Knoepfe bleiben erreichbar. */
    ".cc{max-height:calc(100vh - 32px);overflow-y:auto;overscroll-behavior:contain;display:flex;}",
    "@supports(height:100dvh){.cc{max-height:calc(100dvh - 32px);}}",
    ".cc-inner{display:flex;flex-direction:column;gap:16px;min-height:0;flex:1;}",
    /* Text und Knopfzeile behalten ihre Hoehe, die Zweckliste gibt nach und
       scrollt. So bleiben "Nur notwendige" und "Alle akzeptieren" auch auf
       kleinen Displays im Bild, wo die Knoepfe zusaetzlich umbrechen. */
    ".cc-text,.cc-actions{flex-shrink:0;}",
    ".cc-detail{overscroll-behavior:contain;}",
    ".cc-text strong{font-family:var(--font-display,'Fraunces',Georgia,serif);font-size:1rem;display:block;margin-bottom:6px;}",
    ".cc-text p{font-size:.86rem;color:var(--fg-muted,#5c5349);line-height:1.55;}",
    ".cc-text a{color:var(--accent,#3e6810);text-decoration:underline;}",
    ".cc-actions{display:flex;gap:10px;flex-wrap:wrap;}",
    ".btn-cc{flex:1 1 140px;padding:12px 14px;min-height:46px;border-radius:100px;",
    "font-family:var(--font-display,'Fraunces',Georgia,serif);font-weight:500;font-size:.9rem;cursor:pointer;",
    "border:1px solid var(--line-strong,#cfc2a8);background:rgba(0,0,0,.035);color:var(--fg,#211c17);",
    "transition:background .18s ease,border-color .18s ease,color .18s ease;}",
    ".btn-cc:hover{background:rgba(0,0,0,.07);border-color:var(--fg-dim,#675e51);}",
    ".btn-cc:focus-visible{outline:2px solid var(--accent,#3e6810);outline-offset:2px;}",
    /* Annehmen und Ablehnen bewusst gleich gewichtet: gleiche Groesse,
       gleicher Kontrast. Nur die Umrandung unterscheidet sie. */
    ".btn-cc-accept{background:var(--bg-card,#fffdf8);color:var(--accent,#3e6810);border-color:var(--accent,#3e6810);}",
    ".btn-cc-accept:hover{background:var(--accent,#3e6810);color:var(--accent-ink,#f7f3ec);border-color:var(--accent,#3e6810);}",

    /* ---------- Ebene 2: Schalter je Zweck ---------- */
    ".cc-detail{display:none;flex-direction:column;gap:2px;margin-top:2px;",
    "border-top:1px solid var(--line,#e6dcc9);padding-top:14px;",
    "overflow-y:auto;flex:1 1 auto;min-height:118px;max-height:340px;}",
    ".cc.is-offen .cc-detail{display:flex;}",
    ".cc-zweck{display:flex;gap:14px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--line,#e6dcc9);}",
    ".cc-zweck:last-child{border-bottom:0;}",
    ".cc-zweck-text{flex:1;min-width:0;}",
    ".cc-zweck-text b{display:block;font-size:.88rem;font-family:var(--font-display,'Fraunces',Georgia,serif);font-weight:600;}",
    ".cc-zweck-text span{display:block;font-size:.78rem;color:var(--fg-muted,#5c5349);line-height:1.5;margin-top:3px;}",
    /* Schalter: echtes <input type=checkbox>, damit Tastatur und
       Screenreader ohne Zusatzarbeit funktionieren. Optisch ein Kippschalter. */
    ".cc-schalter{position:relative;flex-shrink:0;width:44px;height:26px;margin-top:2px;}",
    ".cc-schalter input{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:pointer;}",
    ".cc-schalter input:disabled{cursor:not-allowed;}",
    ".cc-spur{position:absolute;inset:0;border-radius:100px;background:rgba(0,0,0,.14);",
    "border:1px solid var(--line-strong,#cfc2a8);transition:background .18s ease,border-color .18s ease;pointer-events:none;}",
    ".cc-knauf{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;",
    "background:var(--bg-card,#fffdf8);box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .18s ease;pointer-events:none;}",
    ".cc-schalter input:checked ~ .cc-spur{background:var(--accent,#3e6810);border-color:var(--accent,#3e6810);}",
    ".cc-schalter input:checked ~ .cc-knauf{transform:translateX(18px);}",
    ".cc-schalter input:disabled ~ .cc-spur{opacity:.55;}",
    ".cc-schalter input:focus-visible ~ .cc-spur{outline:2px solid var(--accent,#3e6810);outline-offset:2px;}",

    /* ---------- Keks-Knopf unten links ---------- */
    ".cc-keks{position:fixed;left:16px;bottom:16px;z-index:399;width:44px;height:44px;border-radius:50%;",
    "display:grid;place-items:center;cursor:pointer;background:var(--bg-card,#fffdf8);",
    "border:1px solid var(--line-strong,#cfc2a8);color:var(--fg-muted,#5c5349);",
    "box-shadow:0 10px 26px -12px rgba(0,0,0,.45);transition:color .18s ease,border-color .18s ease,transform .18s ease;}",
    ".cc-keks:hover{color:var(--accent,#3e6810);border-color:var(--accent,#3e6810);transform:translateY(-2px);}",
    ".cc-keks:focus-visible{outline:2px solid var(--accent,#3e6810);outline-offset:2px;}",
    ".cc-keks[hidden]{display:none;}",
    /* Bei geoeffnetem Mobilmenue wuerde der Knopf sonst ueber der Navigation
       schweben. Beide sind direkte Kinder von <body>, deshalb reicht der
       Geschwisterselektor ohne zusaetzliches JavaScript. */
    ".mobile-menu.open ~ .cc-keks{display:none;}",
    "@media(max-width:600px){.cc-keks{width:40px;height:40px;left:12px;bottom:12px;}}",
    "@media print{.cc,.cc-keks{display:none !important;}}",

    "@media(min-width:640px){.cc-actions .btn-cc{flex:1 1 0;}}",
    "@media (prefers-reduced-motion:reduce){.cc{animation:none;}.cc-knauf,.cc-keks{transition:none;}}"
  ].join("");

  var ZWECKE = [
    {
      id: "necessary", pflicht: true,
      titel: "Notwendig",
      text: "Halten deine Auswahl auf dieser Seite fest und sorgen dafür, dass Formulare funktionieren. Ohne sie läuft die Seite nicht."
    },
    {
      id: "statistik", pflicht: false,
      titel: "Statistik",
      text: "Microsoft Clarity zeichnet anonymisiert auf, wie Seiten genutzt werden, damit ich sehe, wo Besucher hängen bleiben."
    },
    {
      id: "marketing", pflicht: false,
      titel: "Marketing",
      text: "Meta Pixel misst, welche Anzeige zu einer Anfrage geführt hat, und erlaubt es, Anzeigen passender auszuspielen."
    }
  ];

  function zweckMarkup(z, an) {
    return '<div class="cc-zweck">' +
        '<div class="cc-zweck-text"><b>' + z.titel + "</b><span>" + z.text + "</span></div>" +
        '<span class="cc-schalter">' +
          '<input type="checkbox" data-zweck="' + z.id + '"' +
            (an ? " checked" : "") + (z.pflicht ? " checked disabled" : "") +
            ' aria-label="' + z.titel + (z.pflicht ? ", immer aktiv" : "") + '">' +
          '<span class="cc-spur"></span><span class="cc-knauf"></span>' +
        "</span>" +
      "</div>";
  }

  function markup(stand) {
    return '<div class="cc-inner">' +
        '<div class="cc-text">' +
          "<strong>Cookies &amp; Datenschutz</strong>" +
          "<p>Technisch notwendige Mittel und eine <b>cookielose</b> Reichweitenmessung ohne persönliche " +
          "Profile laufen immer. Alles darüber hinaus nur, wenn du zustimmst. Du kannst einzeln auswählen " +
          'und deine Auswahl jederzeit unten links ändern. Mehr in der <a href="/datenschutz">Datenschutzerklärung</a>.</p>' +
        "</div>" +
        '<div class="cc-detail">' + ZWECKE.map(function (z) {
          return zweckMarkup(z, z.pflicht ? true : !!(stand && stand[z.id]));
        }).join("") + "</div>" +
        '<div class="cc-actions">' +
          '<button class="btn-cc" type="button" data-cc="necessary">Nur notwendige</button>' +
          '<button class="btn-cc" type="button" data-cc="detail" aria-expanded="false">Einstellungen</button>' +
          '<button class="btn-cc btn-cc-accept" type="button" data-cc="all">Alle akzeptieren</button>' +
        "</div>" +
      "</div>";
  }

  /* ---------- Speicher ---------- */
  function read() {
    try {
      var neu = JSON.parse(localStorage.getItem(KEY));
      if (neu && typeof neu === "object") return neu;
      /* Aus der alten Fassung uebernehmen: dort deckte ein einziges Ja
         beide Zwecke ab, ein Nein keinen. Das bleibt inhaltlich richtig,
         deshalb wird nicht erneut gefragt. */
      var alt = JSON.parse(localStorage.getItem(ALT_KEY));
      if (alt && typeof alt === "object") {
        return { necessary: true, statistik: !!alt.marketing, marketing: !!alt.marketing, ts: alt.ts || Date.now(), aus_v1: true };
      }
    } catch (e) {}
    return null;
  }
  function save(stand) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        necessary: true,
        statistik: !!stand.statistik,
        marketing: !!stand.marketing,
        ts: Date.now()
      }));
    } catch (e) {}
  }

  /* ---------- Dienste ---------- */
  function ladeClarity() {
    if (window.__mreStatistik) return;
    window.__mreStatistik = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);
  }

  function ladeMetaPixel() {
    if (window.__mreMarketing) return;
    window.__mreMarketing = true;
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

  function wendeAn(stand) {
    if (stand.statistik) ladeClarity();
    if (stand.marketing) ladeMetaPixel();
  }

  /* Loescht die von Clarity und dem Meta Pixel gesetzten Cookies auf allen plausiblen
     Domain-/Pfad-Kombinationen. */
  function loescheCookies(welche) {
    var namen = [];
    if (welche.statistik) namen = namen.concat(["_clck", "_clsk", "CLID", "ANONCHK", "MR", "MUID", "SM"]);
    if (welche.marketing) namen = namen.concat(["_fbp", "_fbc"]);
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

  /* ---------- Oberflaeche ---------- */
  var banner = null, keks = null;

  function ensureStyles() {
    if (document.getElementById("ccStyles")) return;
    var style = document.createElement("style");
    style.id = "ccStyles";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function ensureKeks() {
    if (keks) return keks;
    ensureStyles();
    keks = document.createElement("button");
    keks.type = "button";
    keks.className = "cc-keks";
    keks.id = "ccKeks";
    keks.hidden = true;
    keks.setAttribute("aria-label", "Cookie-Einstellungen ändern");
    keks.setAttribute("title", "Cookie-Einstellungen");
    keks.innerHTML = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" aria-hidden="true">' +
      '<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5Z"/>' +
      '<circle cx="9" cy="10" r="1.15" fill="currentColor" stroke="none"/>' +
      '<circle cx="14" cy="15" r="1.15" fill="currentColor" stroke="none"/>' +
      '<circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none"/>' +
      "</svg>";
    keks.addEventListener("click", function () { oeffne(true); });
    document.body.appendChild(keks);
    return keks;
  }

  function ensureBanner() {
    if (banner) return banner;
    ensureStyles();
    banner = document.createElement("div");
    banner.className = "cc";
    banner.id = "cookieConsent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Cookie-Einstellungen");
    banner.hidden = true;
    banner.innerHTML = markup(read());
    document.body.appendChild(banner);

    banner.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cc]");
      if (!btn) return;
      var was = btn.getAttribute("data-cc");

      if (was === "detail") {
        var offen = banner.classList.toggle("is-offen");
        btn.setAttribute("aria-expanded", offen ? "true" : "false");
        btn.textContent = offen ? "Auswahl speichern" : "Einstellungen";
        if (!offen) uebernehmen(ausSchaltern());
        return;
      }
      if (was === "all") return uebernehmen({ statistik: true, marketing: true });
      uebernehmen({ statistik: false, marketing: false });
    });
    return banner;
  }

  function ausSchaltern() {
    var stand = { statistik: false, marketing: false };
    Array.prototype.forEach.call(banner.querySelectorAll("[data-zweck]"), function (i) {
      var id = i.getAttribute("data-zweck");
      if (id !== "necessary") stand[id] = i.checked;
    });
    return stand;
  }

  function uebernehmen(neu) {
    var vorher = read() || { statistik: false, marketing: false };
    save(neu);
    banner.hidden = true;
    banner.classList.remove("is-offen");
    ensureKeks().hidden = false;

    /* Echter Widerruf: Wer eine Einwilligung zurueckzieht, erwartet, dass die
       Messung endet. Die bereits eingehaengten Skripte lassen sich nicht
       zuverlaessig entladen, deshalb Cookies loeschen und Seite neu laden. */
    var entzogen = {
      statistik: !!vorher.statistik && !neu.statistik,
      marketing: !!vorher.marketing && !neu.marketing
    };
    if (entzogen.statistik || entzogen.marketing) {
      loescheCookies(entzogen);
      location.reload();
      return;
    }
    wendeAn(neu);
  }

  function oeffne(mitDetails) {
    var b = ensureBanner();
    /* Schalter auf den gespeicherten Stand setzen, damit der Dialog zeigt,
       was gerade tatsaechlich gilt. */
    var stand = read() || {};
    Array.prototype.forEach.call(b.querySelectorAll("[data-zweck]"), function (i) {
      var id = i.getAttribute("data-zweck");
      if (id !== "necessary") i.checked = !!stand[id];
    });
    var knopf = b.querySelector('[data-cc="detail"]');
    if (mitDetails) {
      b.classList.add("is-offen");
      knopf.setAttribute("aria-expanded", "true");
      knopf.textContent = "Auswahl speichern";
    } else {
      b.classList.remove("is-offen");
      knopf.setAttribute("aria-expanded", "false");
      knopf.textContent = "Einstellungen";
    }
    b.hidden = false;
  }

  function init() {
    var stand = read();
    if (stand) {
      wendeAn(stand);
      ensureKeks().hidden = false;
      /* Wer noch die alte Ja/Nein-Einwilligung hat, bekommt sie in der neuen
         Form gespeichert, damit ab jetzt beide Zwecke einzeln gefuehrt werden. */
      if (stand.aus_v1) save(stand);
    } else {
      oeffne(false);
    }

    /* Widerruf bzw. nachtraegliche Einwilligung ueber den Footer-Link */
    document.addEventListener("click", function (e) {
      var opener = e.target.closest("[data-cc-open]");
      if (!opener) return;
      e.preventDefault();
      oeffne(true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
