// Vercel Serverless Function (Node) – kein Build-Step, ruft die Brevo REST API direkt per fetch auf.
//
// Diese Datei ist die EINZIGE Quelle für Scoring, Disqualifizierung und Empfehlungstexte. Das Ergebnis
// wird bewusst nie auf der Website angezeigt (index.html kennt nur Fragetexte/Optionen fürs Rendering),
// sondern ausschließlich per E-Mail verschickt. Wird eine Frage in index.html geändert (Text, Reihenfolge
// der Optionen), muss die Tabelle unten entsprechend nachgezogen werden – die Antwort wird als
// Options-Index pro Frage-ID übertragen.
//
// Benötigte Vercel-Umgebungsvariablen (siehe SETUP.md):
//   BREVO_API_KEY       – API-Key von brevo.com (Transactional → API-Keys)
//   AGENCY_NOTIFY_EMAIL – Postfach, an das die interne Lead-Benachrichtigung geht
//   RESULT_FROM_EMAIL   – Absenderadresse (muss in Brevo als Absender verifiziert sein)
//   RESULT_FROM_NAME    – optional, Absendername (Default: "Werbe-Check")
//   BREVO_LIST_ID       – optional, Brevo-Kontaktlisten-ID; wenn gesetzt, wird der Lead zusätzlich
//                         als Kontakt in Brevo angelegt/aktualisiert (für spätere Automationen/Follow-ups)
//   GOOGLE_SHEET_WEBHOOK_URL – optional, Apps-Script-Webhook-URL; wenn gesetzt, wird jeder Lead
//                         zusätzlich als Zeile in eine Google Tabelle geschrieben (siehe SETUP.md)

const QUESTIONS = [
  { id: 'budget', text: 'Monatliches Werbebudget', gate: 'budget', options: [
    { label: 'Unter 500 €', disqualifies: true },
    { label: '500 – 1.500 €', bucket: 1 },
    { label: '1.500 – 5.000 €', bucket: 2 },
    { label: 'Über 5.000 €', bucket: 3 }
  ]},
  { id: 'margin', text: 'Ø Gewinn pro Neukunde', gate: 'margin', options: [
    { label: 'Unter 500 €', disqualifies: true },
    { label: '500 – 2.000 €' },
    { label: '2.000 – 10.000 €' },
    { label: 'Über 10.000 € oder wiederkehrend/Abo' }
  ]},
  { id: 'branche', text: 'Angebotstyp', options: [
    { label: 'Lokale Dienstleistung (z. B. Handwerk, Praxis, Beratung vor Ort)' },
    { label: 'Online-Shop / E-Commerce' },
    { label: 'B2B-Dienstleistung oder Beratung' },
    { label: 'Sonstiges' }
  ]},
  { id: 'ziel', text: 'Werbeziel', scored: true, shortTitle: 'Euer Werbeziel', options: [
    { label: 'Schnell konkrete Anfragen, wir haben freie Kapazitäten', meta: 1, google: 5, insight: 'Wer jetzt Anfragen braucht, holt sie am schnellsten bei Menschen ab, die bereits aktiv suchen, genau dort setzt Google Ads an.' },
    { label: 'Planbar und dauerhaft neue Kunden gewinnen', meta: 3, google: 3, insight: 'Für planbaren Kundenzufluss ist die Kombination ideal: Google fängt die bestehende Nachfrage ab, Meta baut kontinuierlich neue auf.' },
    { label: 'Bekannter werden und unsere Marke aufbauen', meta: 5, google: 1, insight: 'Bekanntheit entsteht bei Menschen, die euch noch nicht suchen, genau die erreicht ihr über Meta, nicht über Suchanzeigen.' },
    { label: 'Ein neues Angebot am Markt testen', meta: 4, google: 2, insight: 'Ein neues Angebot braucht Reichweite und schnelles Feedback, über Meta testet ihr das günstiger als mit Suchanzeigen auf noch unbekannte Begriffe.' }
  ]},
  { id: 'website', text: 'Zielseite', scored: true, shortTitle: 'Eure Zielseite', options: [
    { label: 'Professionelle Website mit klarer Anfrage-Möglichkeit', meta: 2, google: 4, insight: 'Eine starke Zielseite ist die halbe Miete, besonders Google-Klicks verwandeln sich dort direkt in Anfragen.' },
    { label: 'Website vorhanden, aber in die Jahre gekommen', meta: 2, google: 2, insight: 'Bevor Budget fließt, lohnt ein Blick auf die Zielseite, sonst bezahlt ihr für Klicks, die auf einer schwachen Seite versanden.' },
    { label: 'Nur Social-Media-Profile (Instagram, Facebook & Co.)', meta: 4, google: 0, insight: 'Ohne eigene Website spielt Meta seinen Vorteil aus: Lead-Anzeigen mit Formular funktionieren dort ganz ohne Zielseite.' },
    { label: 'Noch nichts davon, müsste erst entstehen', meta: 2, google: 0, insight: 'Solange keine Zielseite existiert, sind Meta-Lead-Anzeigen der praktikable Start, für Google Ads braucht es erst eine Seite, auf der Klicks landen können.' }
  ]},
  { id: 'suche', text: 'Suchintention', scored: true, shortTitle: 'Suchintention', options: [
    { label: 'Ja, sehr konkret (z. B. „Notdienst XY in [Stadt]“)', meta: 0, google: 5, insight: 'Wird aktiv und konkret nach eurem Angebot gesucht, kann Google Ads genau in diesem Moment einspringen, das ist die stärkste Kaufabsicht, die es gibt.' },
    { label: 'Eher ja, aber mit allgemeineren Begriffen', meta: 1, google: 4, insight: 'Es wird gesucht, aber mit breiteren Begriffen. Google Ads funktioniert gut, braucht aber etwas mehr Streuung als bei sehr spezifischen Suchanfragen.' },
    { label: 'Eher nein, die meisten kennen unser Angebot noch nicht', meta: 4, google: 1, insight: 'Wenn kaum aktiv gesucht wird, bringt die beste Suchanzeige nichts, hier muss die Nachfrage erst geweckt werden, und genau das kann Meta besonders gut.' },
    { label: 'Nein, wir müssen die Nachfrage erst wecken', meta: 5, google: 0, insight: 'Ohne bestehende Suchnachfrage ist Meta der richtige Hebel: Ihr zeigt euer Angebot Menschen, die noch gar nicht danach gesucht haben, aber zur Zielgruppe passen.' }
  ]},
  { id: 'entscheidung', text: 'Entscheidungsart', scored: true, shortTitle: 'Entscheidungsart', options: [
    { label: 'Spontaner Impuls-/Wunschkauf', meta: 5, google: 0, insight: 'Impulskäufe entstehen durch einen guten Anstoß im richtigen Moment, das ist die Stärke von Meta-Anzeigen im Feed.' },
    { label: 'Meistens spontan, aber mit kurzem Vergleich', meta: 3, google: 2, insight: 'Ein kurzer Vergleich vor dem Kauf spricht für eine Mischung aus Impuls (Meta) und punktueller Suche (Google).' },
    { label: 'Meist recherchiert, aber überschaubar', meta: 2, google: 3, insight: 'Etwas Recherche vor dem Kauf verschiebt den Vorteil leicht Richtung Google. Nutzer suchen aktiv nach Optionen und Bewertungen.' },
    { label: 'Immer gut recherchiert & verglichen, geplante Anschaffung', meta: 0, google: 5, insight: 'Bei geplanten, gut verglichenen Anschaffungen erwischt ihr Interessenten am besten genau im Sucherlebnis auf Google, dort, wo verglichen wird.' }
  ]},
  { id: 'ansprache', text: 'Zielgruppen-Ansprache', scored: true, shortTitle: 'Zielgruppen-Ansprache', options: [
    { label: 'Sehr gut über Interessen, Hobbys oder demografische Merkmale eingrenzbar', meta: 5, google: 0, insight: 'Eine klar eingrenzbare Zielgruppe nach Interessen/Demografie ist der Kern-Vorteil von Meta-Targeting.' },
    { label: 'Teils über Interessen, teils über Suchbegriffe', meta: 3, google: 2, insight: 'Eure Zielgruppe lässt sich auf beiden Wegen erreichen, ein Mix aus Interessen-Targeting und Suchbegriffen ist realistisch.' },
    { label: 'Eher über konkrete Suchbegriffe fassbar', meta: 1, google: 4, insight: 'Ohne klare demografische Eingrenzung, aber mit klaren Suchbegriffen, ist Google Ads der treffsicherere Kanal.' },
    { label: 'Nur über sehr spezifische Fachbegriffe/Suchanfragen fassbar', meta: 0, google: 5, insight: 'Eine sehr spezifische Nische lässt sich über Suchbegriffe auf Google punktgenau treffen, über Interessen-Targeting kaum.' }
  ]},
  { id: 'visuell', text: 'Visuelle Präsentierbarkeit', scored: true, shortTitle: 'Visuelle Präsentierbarkeit', options: [
    { label: 'Ja, sehr gut: starke Fotos/Videos, emotional zeigbar', meta: 5, google: 1, insight: 'Ein visuell starkes Angebot ist wie gemacht für Meta. Bild und Video sind dort der wichtigste Hebel für Aufmerksamkeit.' },
    { label: 'Teilweise, geht mit guten Produktbildern', meta: 3, google: 2, insight: 'Solide Bildsprache hilft auf Meta, ist aber kein Muss, auch textbasierte Google-Anzeigen funktionieren bei euch.' },
    { label: 'Eher schwierig, wenig visuell darstellbar', meta: 1, google: 3, insight: 'Ohne starke visuelle Wirkung verliert Meta einen Teil seiner Stärke. Text-/Leistungsanzeigen auf Google performen dann oft besser.' },
    { label: 'Nein, reine Text-/Fachleistung', meta: 0, google: 5, insight: 'Eine reine Fach- oder Textleistung lässt sich kaum emotional bebildern, hier zieht die klare, textbasierte Google-Suchanzeige klar vor.' }
  ]},
  { id: 'einzugsgebiet', text: 'Einzugsgebiet', scored: true, shortTitle: 'Einzugsgebiet', options: [
    { label: 'Sehr lokal begrenzt (ein Ort/Landkreis)', meta: 1, google: 4, insight: '„In der Nähe“-Suchen sind bei lokal begrenzten Angeboten extrem stark. Google Ads holt genau diese Nutzer im richtigen Moment ab.' },
    { label: 'Regional (mehrere Städte/Bundesland)', meta: 2, google: 3, insight: 'Auf regionaler Ebene bleibt Google leicht im Vorteil, Meta lässt sich aber gut zur Ergänzung für Reichweite nutzen.' },
    { label: 'Deutschlandweit', meta: 3, google: 2, insight: 'Bei deutschlandweiter Reichweite lohnt sich Meta zunehmend, um Bekanntheit und Nachfrage überhaupt erst aufzubauen.' },
    { label: 'International / mehrsprachig', meta: 3, google: 2, insight: 'International lässt sich mit Meta oft kosteneffizienter Reichweite über Ländergrenzen hinweg aufbauen als rein über Suchanzeigen.' }
  ]},
  { id: 'alter', text: 'Zielgruppen-Alter', scored: true, shortTitle: 'Zielgruppen-Alter', options: [
    { label: 'Überwiegend jünger (18–34)', meta: 4, google: 2, insight: 'Eine jüngere Zielgruppe ist auf Instagram & Facebook besonders gut und günstig erreichbar.' },
    { label: 'Gemischt, alle Altersgruppen', meta: 2, google: 3, insight: 'Bei einer breit gemischten Altersgruppe sind beide Plattformen relevant, die Suchintention gibt hier oft den Ausschlag.' },
    { label: 'Überwiegend 35–54', meta: 2, google: 3, insight: 'In dieser Altersgruppe wird viel aktiv recherchiert und verglichen, ein leichter Vorteil für Google.' },
    { label: 'Überwiegend 55+', meta: 1, google: 4, insight: 'Ältere Zielgruppen suchen gezielter und aktiver über Google, statt sich von Social-Ads überraschen zu lassen.' }
  ]},
  { id: 'zielgruppe', text: 'B2B oder B2C', scored: true, shortTitle: 'B2B oder B2C', options: [
    { label: 'Privatpersonen (B2C)', meta: 3, google: 2, insight: 'Bei Privatpersonen funktioniert emotionales, visuelles Meta-Targeting oft besonders gut, ergänzt um Suchanzeigen für die aktive Nachfrage.' },
    { label: 'Kleine Unternehmen / Selbstständige', meta: 2, google: 3, insight: 'Kleinunternehmer und Selbstständige suchen oft gezielt und kurzfristig nach Lösungen, ein Vorteil für Google.' },
    { label: 'Mittelständische oder größere Unternehmen', meta: 1, google: 4, insight: 'Bei größeren Unternehmen mit mehreren Entscheidern läuft die Recherche meist sehr gezielt über Suchmaschinen.' },
    { label: 'Gemischt / beides', meta: 2, google: 2, insight: 'Eine gemischte Zielgruppe spricht für eine ausgewogene Mischung aus beiden Plattformen.' }
  ]}
];

function computeResult(answers) {
  answers = answers || {};
  let metaTotal = 0, googleTotal = 0;
  let qualified = true;
  const reasons = [];
  const readable = [];
  const scoredAnswers = [];

  QUESTIONS.forEach(q => {
    // Freitext hat keine Optionen und kein Scoring – nur den eingegebenen Text übernehmen.
    if (q.freitext) {
      const text = String(answers[q.id] || '').trim().slice(0, 150);
      readable.push({ frage: q.text, antwort: text || '— (keine Angabe)' });
      return;
    }

    const idx = answers[q.id];
    const opt = (typeof idx === 'number' && q.options[idx]) ? q.options[idx] : null;

    if (!opt) {
      readable.push({ frage: q.text, antwort: '— (keine Angabe)' });
      return;
    }

    readable.push({ frage: q.text, antwort: opt.label });

    if (q.gate && opt.disqualifies) {
      qualified = false;
      if (q.gate === 'budget') reasons.push('Mit einem Werbebudget unter 500 €/Monat lässt sich in den meisten Branchen kein aussagekräftiger Test fahren, das Budget verpufft eher in der Lernphase der Werbeplattformen, bevor sich etwas rechnet.');
      if (q.gate === 'margin') reasons.push('Bei einem Gewinn von unter 500 € pro neuem Kunden ist das Risiko hoch, dass die Werbekosten eure Marge auffressen, bevor sich eine Kampagne überhaupt rechnet.');
    }

    if (q.scored) {
      metaTotal += opt.meta || 0;
      googleTotal += opt.google || 0;
      scoredAnswers.push({ shortTitle: q.shortTitle, opt, diff: Math.abs((opt.meta || 0) - (opt.google || 0)) });
    }
  });

  const total = metaTotal + googleTotal;
  const metaPct = total > 0 ? Math.round((metaTotal / total) * 100) : 50;
  const googlePct = 100 - metaPct;

  const budgetIdx = answers['budget'];
  const budgetOpt = (typeof budgetIdx === 'number') ? QUESTIONS[0].options[budgetIdx] : null;
  const budgetBucket = budgetOpt ? (budgetOpt.bucket || 0) : 0;

  const topInsights = scoredAnswers.sort((a, b) => b.diff - a.diff).slice(0, 3);

  // zielgruppeIdx: 0=B2C, 1=Kleinunternehmen/Selbstständige, 2=Mittelstand/größere Unternehmen, 3=gemischt
  const zielgruppeIdx = answers['zielgruppe'];
  // alterIdx: 0=jünger 18–34, 1=gemischt, 2=35–54, 3=55+
  const alterIdx = answers['alter'];
  const extraChannels = buildExtraChannels({ zielgruppeIdx, alterIdx, budgetBucket });

  return { qualified, reasons, metaPct, googlePct, budgetBucket, topInsights, readable, extraChannels };
}

// LinkedIn und TikTok laufen bewusst NICHT als dritter/vierter Posten im Meta/Google-Prozent-Split mit:
// LinkedIns Zielgruppe ist im Kern eine Teilmenge dessen, was man auch über Meta erreicht (nur mit
// präziserem B2B-Filter wie Jobtitel/Branche/Senioritätslevel) – ein eigener Prozentanteil würde das
// verzerren. Stattdessen werden beide als ergänzende Kanalempfehlung ausgegeben, wenn die Signale klar
// genug sind (B2B-Zielgruppe → LinkedIn, junge Zielgruppe → TikTok).
function buildExtraChannels({ zielgruppeIdx, alterIdx, budgetBucket }) {
  const channels = [];

  if (zielgruppeIdx === 2) {
    channels.push({
      name: 'LinkedIn Ads',
      text: budgetBucket >= 2
        ? 'Ihr sprecht Unternehmen mit mehreren Entscheidern an, dafür ist LinkedIn besonders stark: Ihr könnt gezielt nach Jobtitel, Branche und Senioritätslevel targetieren. Die Menschen, die ihr dort erreicht, erreicht ihr technisch auch über Meta. LinkedIn punktet aber mit der präziseren B2B-Filterung, ist dafür pro Klick spürbar teurer. Bei eurem Budget würde ich LinkedIn ergänzend zu eurem Hauptkanal einplanen.'
        : 'Ihr sprecht Unternehmen mit mehreren Entscheidern an, eigentlich ideales LinkedIn-Terrain (präzises Jobtitel-Targeting). LinkedIn-Klicks sind aber deutlich teurer als auf Google oder Meta. Bei eurem aktuellen Budget würde ich zuerst mit eurem Hauptkanal starten und LinkedIn ergänzen, sobald das Budget wächst.'
    });
  } else if (zielgruppeIdx === 1) {
    channels.push({
      name: 'LinkedIn Ads',
      text: 'Als Kleinunternehmen oder Selbstständige könnte LinkedIn interessant sein, wenn eure Kunden selbst Entscheider in Unternehmen sind, die Klickpreise liegen dort aber deutlich über Google oder Meta. Für den Einstieg würde ich mich zunächst auf euren Hauptkanal konzentrieren und LinkedIn bei Bedarf ergänzen.'
    });
  }

  if (alterIdx === 0) {
    channels.push({
      name: 'TikTok Ads',
      text: 'Eure Zielgruppe ist überwiegend jung (18–34). TikTok ist dort aktuell einer der günstigsten Wege, Aufmerksamkeit und Reichweite aufzubauen, wenn ihr unterhaltsamen, authentischen Video-Content liefern könnt. Ich würde TikTok ergänzend zu eurem Hauptkanal testen.'
    });
  }

  return channels;
}

// Empfehlungstext und Budget-Vorschlag müssen zwingend dieselbe Aussage treffen (sonst steht im
// Fließtext "konzentriert euch auf einen Kanal", während die Budget-Tabelle splittet). Deshalb wird
// die Entscheidung genau hier einmal getroffen und von beiden Bausteinen verwendet.
function decideStrategy(metaPct, googlePct, budgetBucket) {
  const diff = Math.abs(metaPct - googlePct);
  const dominant = metaPct > googlePct ? 'Meta' : 'Google';
  if (diff >= 40) return { mode: 'focus', dominant, reason: 'clear-winner' };
  if (budgetBucket >= 2) return { mode: 'mix', dominant, reason: 'balanced' };
  return { mode: 'focus', dominant, reason: 'budget-too-small-to-split' };
}

function buildRecommendation(metaPct, googlePct, budgetBucket) {
  const diff = Math.abs(metaPct - googlePct);
  const dominant = metaPct > googlePct ? 'Meta' : 'Google';
  const dominantPct = Math.max(metaPct, googlePct);

  if (diff >= 40) {
    if (dominant === 'Google') {
      return {
        title: 'Klare Empfehlung: Google Ads',
        text: `Bei euch dominiert die Suchabsicht ganz klar: ${googlePct}% Google gegen ${metaPct}% Meta. Ich würde das komplette Budget zu Beginn auf Google Ads konzentrieren, statt es zu splitten, das bringt in eurem Fall die schnellsten, günstigsten Anfragen.`
      };
    }
    return {
      title: 'Klare Empfehlung: Meta Ads',
      text: `Bei euch überwiegt ganz klar die Meta-Eignung: ${metaPct}% Meta gegen ${googlePct}% Google. Ich würde das komplette Budget zu Beginn auf Meta Ads (Facebook & Instagram) konzentrieren, ihr müsst die Nachfrage erst wecken, und genau das kann Meta besonders gut.`
    };
  }

  if (budgetBucket >= 2) {
    return {
      title: `Empfehlung: Mix aus Google (${googlePct}%) & Meta (${metaPct}%)`,
      text: `Bei euch sprechen beide Plattformen an. Ich würde das Budget entsprechend aufteilen: ca. ${googlePct}% Google Ads und ca. ${metaPct}% Meta Ads, so deckt ihr sowohl die aktive Suche als auch das Wecken neuer Nachfrage ab.`
    };
  }

  return {
    title: `Tendenz: ${dominant} Ads (${dominantPct}%). Budget aktuell noch zu knapp zum Splitten`,
    text: `Euer Ergebnis ist relativ ausgeglichen (${googlePct}% Google / ${metaPct}% Meta). Bei eurem aktuellen Budget würde ich mich trotzdem zunächst auf einen Kanal konzentrieren (${dominant} Ads), damit genug Budget pro Tag für aussagekräftige Daten zusammenkommt. Sobald ihr skaliert, lohnt sich der Mix.`
  };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

// Rechenbeispiele pro Budget-Stufe. Bewusst ein konkreter Beispielwert statt der Spanne – eine Zahl,
// die man direkt nachvollziehen kann, wirkt deutlich greifbarer als "irgendwas zwischen X und Y".
const BUDGET_INFO = {
  1: { label: '500 – 1.500 €', example: 1000 },
  2: { label: '1.500 – 5.000 €', example: 3000 },
  3: { label: 'über 5.000 €', example: 6000 }
};

function euro(n) {
  return (Math.round(n / 10) * 10).toLocaleString('de-DE') + ' €';
}

function h3(text) {
  return `<h3 style="color:#14203A;font-size:17px;margin:28px 0 8px;">${text}</h3>`;
}

// Erklärt in Alltagssprache, was der empfohlene Kanal überhaupt tut – inklusive der jeweiligen
// Schattenseite. Ein Lead, der die Mechanik versteht, stellt im Erstgespräch die besseren Fragen.
function buildChannelExplainer(metaPct, googlePct) {
  const google = `<p style="margin:0 0 12px;"><strong>Google Ads</strong> setzt an der bestehenden Nachfrage an: Eure Anzeige erscheint genau dann, wenn jemand aktiv nach eurer Leistung sucht. Ihr zahlt pro Klick, nicht pro Einblendung. Der große Vorteil: Diese Menschen haben ihr Problem bereits erkannt und suchen nach einer Lösung, der Weg zur Anfrage ist kurz. Die Grenze: Ihr könnt die Nachfrage nicht vergrößern, sondern immer nur den Teil abschöpfen, der ohnehin schon sucht.</p>`;
  const meta = `<p style="margin:0 0 12px;"><strong>Meta Ads</strong> (Facebook & Instagram) funktioniert andersherum: Eure Anzeige erscheint im Feed von Menschen, die gerade überhaupt nicht nach euch suchen, aber zu eurem Zielgruppenprofil passen. Der große Vorteil: Ihr könnt Nachfrage aktiv erzeugen und Reichweite über die bestehende Suchnachfrage hinaus aufbauen. Der Preis dafür: Ihr unterbrecht die Leute, das verlangt gutes Bild- oder Videomaterial und etwas mehr Geduld, bis eine Anzeige zündet.</p>`;

  if (googlePct >= metaPct + 15) return google + meta;
  if (metaPct >= googlePct + 15) return meta + google;
  return google + meta;
}

function buildBudgetPlan({ metaPct, googlePct, budgetBucket }) {
  const info = BUDGET_INFO[budgetBucket];
  if (!info) return '';

  const strategy = decideStrategy(metaPct, googlePct, budgetBucket);
  const daily = info.example / 30;

  if (strategy.mode === 'mix') {
    return `<p style="margin:0;">Zur Einordnung ein Rechenbeispiel für euren Rahmen (${info.label}): Bei <strong>${euro(info.example)} im Monat</strong> würde ich etwa <strong>${euro(info.example * googlePct / 100)} auf Google Ads</strong> und <strong>${euro(info.example * metaPct / 100)} auf Meta Ads</strong> geben, zusammen rund ${euro(daily)} Tagesbudget.</p>`;
  }

  return `<p style="margin:0;">Zur Einordnung ein Rechenbeispiel für euren Rahmen (${info.label}): Bei <strong>${euro(info.example)} im Monat</strong> würde ich zunächst das <strong>gesamte Budget auf ${strategy.dominant} Ads</strong> konzentrieren, also rund ${euro(daily)} Tagesbudget. Ein Kanal mit ausreichend Budget schlägt zwei Kanäle, die beide zu dünn laufen, die Plattformen brauchen eine Mindestmenge an Daten, um überhaupt sinnvoll auszusteuern.</p>`;
}

function buildNextSteps() {
  const steps = [
    ['Tracking zuerst', 'Bevor der erste Euro fließt, muss messbar sein, was eine Anfrage kostet. Ohne Conversion-Tracking optimiert ihr blind und könnt hinterher nicht sagen, welche Anzeige die Kunden gebracht hat.'],
    ['Die Seite hinter der Anzeige prüfen', 'Eine Anzeige ist immer nur so gut wie die Seite, auf der die Leute landen. Klare Aussage, ein sichtbarer nächster Schritt, schnelle Ladezeit auf dem Handy, daran scheitern mehr Kampagnen als am Anzeigentext.'],
    ['Klein und fokussiert starten', 'Eine Kampagne mit einem Ziel, nicht fünf parallel. Je mehr ihr gleichzeitig testet, desto weniger Daten bekommt jede einzelne Variante, und desto länger dauert es, bis ihr etwas Belastbares seht.'],
    ['Vier Wochen laufen lassen, dann bewerten', 'Erst danach lässt sich seriös beurteilen, ob es funktioniert. Vorher entscheidet ihr auf Basis von Zufall.']
  ];
  return `<ol style="padding-left:20px;color:#3B4A60;margin:0;">` + steps.map(([t, d]) =>
    `<li style="margin-bottom:12px;"><strong style="color:#14203A;">${t}</strong><br>${d}</li>`
  ).join('') + `</ol>`;
}

function buildExpectations() {
  return `<p style="margin:0 0 10px;">Beide Plattformen haben eine <strong>Lernphase</strong>: In den ersten zwei bis vier Wochen testen die Algorithmen, wem sie eure Anzeigen zeigen. In dieser Zeit sind die Kosten pro Anfrage typischerweise am höchsten, das ist normal und kein Zeichen dafür, dass etwas kaputt ist.</p>
    <p style="margin:0 0 10px;">Wirklich belastbar werden die Zahlen erst ab etwa <strong>30 Anfragen oder Verkäufen</strong> pro Kampagne. Alles davor ist eine Momentaufnahme, keine Statistik.</p>
    <p style="margin:0;">Die drei häufigsten Fehler zum Start: <strong>zu früh abschalten</strong> (nach drei Tagen ist noch nichts entschieden), <strong>das Budget auf zu viele Kampagnen verteilen</strong> und <strong>gute Anzeigen auf eine schwache Landingpage schicken</strong>.</p>`;
}

// Nachweis der Einwilligung nach Art. 7 Abs. 1 DSGVO: Der Verantwortliche muss belegen können, DASS
// und WORIN eingewilligt wurde. Zeitstempel und IP kommen bewusst vom Server – Angaben, die der
// Client mitschickt, wären als Nachweis wertlos, weil sie manipulierbar sind.
function buildConsentRecord(req, consent) {
  const forwarded = (req.headers && req.headers['x-forwarded-for']) || '';
  return {
    given: true,
    text: String((consent && consent.text) || '').slice(0, 500),
    timestamp: new Date().toISOString(),
    ip: String(forwarded).split(',')[0].trim() || 'unbekannt',
    userAgent: String((req.headers && req.headers['user-agent']) || '').slice(0, 250)
  };
}

function buildConsentBlockHtml(record) {
  return `
    <div style="margin-top:24px;padding:14px 16px;background:#F6F4EF;border-left:3px solid #3E6810;font-size:13px;color:#3B4A60;line-height:1.6;">
      <strong style="color:#14203A;">Einwilligung (Nachweis)</strong><br>
      Erteilt am: ${escapeHtml(new Date(record.timestamp).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }))} Uhr<br>
      IP-Adresse: ${escapeHtml(record.ip)}<br>
      Wortlaut: „${escapeHtml(record.text)}“
    </div>`;
}

function buildEmailFooter(consentRecord) {
  const consentNote = consentRecord ? `
      Du hast am ${escapeHtml(new Date(consentRecord.timestamp).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }))} Uhr eingewilligt, dass ich dich
      per E-Mail zu deiner Auswertung kontaktieren dürfen. Du kannst das jederzeit formlos
      widerrufen, eine kurze Antwort auf diese E-Mail genügt.<br><br>` : '';

  return `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #E4DBC9;font-size:12px;color:#675E51;line-height:1.6;">
      ${consentNote}
      MR Elevate · Marc Richter · Briesnitzer Höhe 24, 01157 Dresden<br>
      <a href="https://www.mr-elevate.de/impressum" style="color:#3E6810;">Impressum</a> ·
      <a href="https://www.mr-elevate.de/datenschutz" style="color:#3E6810;">Datenschutz</a>
    </div>`;
}

const MAIL_WRAP_OPEN = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#14203A;font-size:15px;line-height:1.65;">';

// Buchungslink für die kostenlose Potenzialanalyse (Calendly) und Direktkontakt.
// Die Nummer stammt aus dem Impressum (+49 155 1065 7637).
const TERMIN_URL = 'https://calendly.com/mr-elevate/30min';
const WHATSAPP_URL = 'https://wa.me/4915510657637';
const TELEFON_ANZEIGE = '0155 1065 7637';

/* Kompakter Zwischen-Aufruf für die Mitte der E-Mail. Wer bis hierher liest, ist interessiert –
   dieser Block fängt genau die ab, die lieber direkt sprechen als weiterzulesen. */
function buildKontaktBox() {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:26px 0;">
      <tr><td style="background:#F6F4EF;border:1px solid #E4DBC9;border-radius:12px;padding:20px 22px;">
        <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:17px;color:#14203A;"><strong>Lieber direkt sprechen?</strong></p>
        <p style="margin:0 0 14px;font-size:14.5px;color:#3B4A60;line-height:1.55;">
          Kostenloses Beratungsgespräch, 30 Minuten, reine Analyse, kein Verkaufsgespräch.
          Schreib mir auf WhatsApp, ruf einfach an oder such dir direkt einen Termin aus.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#25D366;border-radius:100px;">
              <a href="${WHATSAPP_URL}" style="display:inline-block;padding:11px 22px;font-family:Arial,sans-serif;font-size:14.5px;font-weight:700;color:#0A2E17;text-decoration:none;">WhatsApp schreiben</a>
            </td>
            <td style="width:10px;"></td>
            <td style="background:#A8C93E;border-radius:100px;">
              <a href="${TERMIN_URL}" style="display:inline-block;padding:11px 22px;font-family:Arial,sans-serif;font-size:14.5px;font-weight:700;color:#0A0D00;text-decoration:none;">Termin buchen</a>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 0;font-size:13px;color:#675E51;">
          Oder klassisch: <a href="tel:+4915510657637" style="color:#3E6810;">${TELEFON_ANZEIGE}</a>
        </p>
      </td></tr>
    </table>`;
}

function buildLeadEmailHtml({ name, qualified, reasons, metaPct, googlePct, budgetBucket, topInsights, extraChannels, consentRecord }) {
  // Es wird nur noch Name/Firma erfasst – daraus laesst sich keine Vornamen-Anrede ableiten.
  const anrede = escapeHtml((name || '').split(' ')[0] || 'zusammen');

  if (!qualified) {
    const reasonItems = reasons.map(r => `<li style="margin-bottom:10px;">${escapeHtml(r)}</li>`).join('');
    return `
      ${MAIL_WRAP_OPEN}
        <h2 style="color:#14203A;font-size:22px;margin:0 0 16px;">Hallo ${anrede},</h2>
        <p style="margin:0 0 14px;">danke, dass du dir die Zeit für den Werbe-Check genommen hast. Ich könnte dir an dieser Stelle eine Kampagne verkaufen. In eurer aktuellen Situation würde sie euch nichts bringen. Deshalb bekommst du hier die Einschätzung, die ich auch einem Bekannten geben würde.</p>
        <p style="margin:0 0 8px;"><strong>Von bezahlter Werbung rate ich euch derzeit ab:</strong></p>
        <ul style="padding-left:20px;color:#3B4A60;margin:0;">${reasonItems}</ul>

        ${h3('Was ich euch stattdessen empfehle')}
        <ol style="padding-left:20px;color:#3B4A60;margin:0;">
          <li style="margin-bottom:12px;"><strong style="color:#14203A;">Google-Unternehmensprofil ausbauen</strong><br>Kostenlos, und bei lokalen Anbietern häufig die stärkste Quelle für Anfragen überhaupt. Vollständige Angaben, echte Fotos, und vor allem aktiv nach Bewertungen fragen.</li>
          <li style="margin-bottom:12px;"><strong style="color:#14203A;">Bestandskunden systematisch um Empfehlungen bitten</strong><br>Der günstigste Vertriebsweg, den es gibt, und der am seltensten bewusst genutzte. Ein kurzer Anruf nach abgeschlossenem Auftrag reicht oft schon.</li>
          <li style="margin-bottom:12px;"><strong style="color:#14203A;">An der Marge arbeiten, nicht nur am Umsatz</strong><br>Höherwertige Pakete, Zusatzleistungen oder wiederkehrende Betreuung verändern die Rechnung oft schneller als zusätzliche Anfragen.</li>
        </ol>

        ${h3('Ab wann sich Werbung für euch rechnet')}
        <p style="margin:0 0 10px;">Die Logik dahinter ist simpel: Werbung muss aus einem Euro mehr als einen Euro machen. Damit das aufgeht, braucht es zwei Dinge, <strong>genug Budget</strong>, damit die Plattformen überhaupt aus Daten lernen können (unterhalb von etwa 500 € im Monat verpufft der Großteil in dieser Lernphase), und <strong>genug Gewinn pro Kunde</strong>, damit die gewonnenen Anfragen die Werbekosten auch tragen.</p>
        <p style="margin:0;">Sobald sich einer dieser beiden Punkte bei euch verändert, lohnt sich ein neuer Blick. Melde dich dann einfach, ich schaue kostenlos drauf.</p>

        <p style="margin:28px 0 0;">Viele Grüße<br>Dein Werbe-Check-Team</p>
        ${buildEmailFooter(consentRecord)}
      </div>`;
  }

  const reco = buildRecommendation(metaPct, googlePct, budgetBucket);
  const budgetPlan = buildBudgetPlan({ metaPct, googlePct, budgetBucket });
  const insightItems = topInsights.map(item => `
    <li style="margin-bottom:14px;">
      <strong style="color:#14203A;">${escapeHtml(item.shortTitle)}:</strong> ${escapeHtml(item.opt.insight)}
    </li>`).join('');
  const extraChannelsHtml = (extraChannels && extraChannels.length) ? `
      ${h3('Zusätzlich für euch interessant')}
      <p style="margin:0 0 10px;">Aufbauend auf dieser Basis, als Ergänzung, nicht als Ersatz:</p>
      <ul style="padding-left:20px;color:#3B4A60;margin:0;">
        ${extraChannels.map(c => `<li style="margin-bottom:14px;"><strong style="color:#14203A;">${escapeHtml(c.name)}:</strong> ${escapeHtml(c.text)}</li>`).join('')}
      </ul>` : '';

  return `
    ${MAIL_WRAP_OPEN}
      <h2 style="color:#14203A;font-size:22px;margin:0 0 16px;">Hallo ${anrede},</h2>
      <p style="margin:0 0 14px;">danke für deine Teilnahme am Werbe-Check. Ich habe deine zwölf Antworten ausgewertet, hier ist das Ergebnis, inklusive Begründung, konkretem Budget-Vorschlag und den ersten Schritten.</p>

      <table style="width:100%;border-collapse:collapse;margin:24px 0 6px;">
        <tr>
          <td style="text-align:center;padding:18px;background:#E5EEFD;border-radius:10px 0 0 10px;">
            <div style="font-size:34px;font-weight:700;color:#2A63C7;">${googlePct}%</div>
            <div style="font-size:13px;color:#3B4A60;">Google Ads</div>
          </td>
          <td style="text-align:center;padding:18px;background:#F1E7FE;border-radius:0 10px 10px 0;">
            <div style="font-size:34px;font-weight:700;color:#5E1FC4;">${metaPct}%</div>
            <div style="font-size:13px;color:#3B4A60;">Meta Ads</div>
          </td>
        </tr>
      </table>
      <p style="text-align:center;font-size:13px;color:#675E51;margin:0 0 4px;">So verteilt sich die Eignung eures Angebots auf die beiden Plattformen.</p>

      ${h3(escapeHtml(reco.title))}
      <p style="margin:0;">${escapeHtml(reco.text)}</p>

      ${budgetPlan ? h3('Was das für euer Budget bedeutet') + budgetPlan : ''}

      ${h3('Die wichtigsten Gründe für diese Empfehlung')}
      <ul style="padding-left:20px;color:#3B4A60;margin:0;">${insightItems}</ul>

      ${buildKontaktBox()}

      ${h3('Warum ausgerechnet Google und Meta?')}
      <p style="margin:0 0 12px;">Weil die beiden zusammen die zwei einzigen Grundmechanismen abdecken, über die bezahlte Werbung funktioniert: <strong>bestehende Nachfrage abholen</strong> und <strong>neue Nachfrage wecken</strong>. Deshalb sind Google und Meta die Basis jeder Werbestrategie, jede andere Plattform ist eine Variante dieser beiden Mechanismen für eine spezielle Zielgruppe. Sinnvoll als Ergänzung, aber kein Ersatz für das Fundament.</p>
      ${buildChannelExplainer(metaPct, googlePct)}

      ${extraChannelsHtml}

      ${h3('Die ersten Schritte, in dieser Reihenfolge')}
      ${buildNextSteps()}

      ${h3('Womit ihr realistisch rechnen solltet')}
      ${buildExpectations()}

      ${h3('Willst du das gemeinsam durchgehen?')}
      <p style="margin:0 0 12px;">Diese Auswertung sagt dir, <em>welcher</em> Kanal zu euch passt. Sie sagt nicht, ob eure Zahlen, eure Website und euer Angebot zusammen tragfähig sind, dafür braucht es einen Blick von außen.</p>
      <p style="margin:0 0 18px;">Genau dafür gibt es die <strong>kostenlose Potenzialanalyse</strong>: 30 Minuten, in denen ich mir eure Antworten konkret anschaue und eine einzige Frage klären, lässt sich bei euch mit Werbung sinnvoll etwas bewegen, und womit fängt man an? <strong>Kein Verkaufsgespräch:</strong> Wenn ich sehe, dass es gerade nicht passt, sage ich dir das im Termin.</p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
        <tr><td style="background:#A8C93E;border-radius:100px;">
          <a href="${TERMIN_URL}" style="display:inline-block;padding:14px 30px;font-family:Georgia,serif;font-size:16px;font-weight:600;color:#0A0D00;text-decoration:none;">Kostenlose Potenzialanalyse buchen →</a>
        </td></tr>
      </table>
      <p style="margin:0;font-size:13px;color:#675E51;">Passt gerade kein Termin? Antworte einfach direkt auf diese E-Mail.</p>

      <p style="margin:24px 0 0;">Viele Grüße<br>Dein Werbe-Check-Team</p>
      ${buildEmailFooter(consentRecord)}
    </div>`;
}

function buildAgencyEmailHtml({ name, firma, email, telefon, qualified, metaPct, googlePct, budgetBucket, readable, extraChannels, consentRecord }) {
  const rows = readable.map(r =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #E7E2D8;color:#3B4A60;">${escapeHtml(r.frage)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #E7E2D8;font-weight:600;">${escapeHtml(r.antwort)}</td></tr>`
  ).join('');
  const reco = qualified ? buildRecommendation(metaPct, googlePct, budgetBucket) : null;
  const extraChannelsText = (extraChannels && extraChannels.length)
    ? `<p><strong>Zusätzlich empfohlen:</strong> ${extraChannels.map(c => escapeHtml(c.name)).join(', ')}</p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#14203A;">
      <h2 style="color:${qualified ? '#0E7F57' : '#C0392B'};">
        ${qualified ? 'Neuer qualifizierter Lead' : 'Neuer Lead: UNQUALIFIZIERT (Budget/Marge zu niedrig)'}
      </h2>
      <p>
        <strong>Name:</strong> ${escapeHtml(name)}<br>
        <strong>Firma:</strong> ${escapeHtml(firma)}<br>
        <strong>E-Mail:</strong> ${escapeHtml(email)}<br>
        <strong>Telefon:</strong> ${escapeHtml(telefon) || '— (nicht angegeben)'}
      </p>
      <p><strong>Plattform-Split:</strong> ${googlePct}% Google / ${metaPct}% Meta</p>
      ${reco ? `<p><strong>${escapeHtml(reco.title)}</strong><br>${escapeHtml(reco.text)}</p>` : ''}
      ${extraChannelsText}
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">${rows}</table>
      ${consentRecord ? buildConsentBlockHtml(consentRecord) : ''}
    </div>`;
}

async function sendBrevoEmail({ apiKey, fromEmail, fromName, to, toName, subject, htmlContent }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to, name: toName || undefined }],
      subject,
      htmlContent
    })
  });
  if (!res.ok) console.error('Brevo email error', res.status, await res.text());
  return res.ok;
}

/* ---------- Google Tabelle ----------
   Läuft bewusst über ein Apps-Script-Webhook statt über die Google-Sheets-API: kein GCP-Projekt,
   kein Dienstkonto, kein privater Schlüssel, der irgendwo gespeichert werden müsste. Die Funktion
   schickt einfach ein JSON-Objekt an die Webhook-URL (Env-Var GOOGLE_SHEET_WEBHOOK_URL); das Skript
   in der Tabelle ordnet die Werte anhand der Spaltenüberschriften zu und hängt eine Zeile an.
   Fehlt die Env-Var, wird der Schritt still übersprungen – der Funnel läuft unverändert weiter. */
function buildSheetRow({ name, email, firma, telefon, qualified, metaPct, googlePct, readable, extraChannels, consentRecord }) {
  var zeit = function (iso) {
    return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  };

  const row = {
    'Zeitpunkt': zeit(new Date().toISOString()),
    'Name': name,
    'Firma': firma,
    'E-Mail': email,
    'Telefon': telefon || '',
    'Status': qualified ? 'qualifiziert' : 'UNQUALIFIZIERT',
    'Google %': googlePct,
    'Meta %': metaPct,
    'Zusatzkanäle': (extraChannels || []).map(function (c) { return c.name; }).join(', ')
  };

  // Jede der zwölf Fragen bekommt eine eigene Spalte – so lässt sich später filtern und auswerten.
  (readable || []).forEach(function (r) { row[r.frage] = r.antwort; });

  if (consentRecord) {
    row['Einwilligung erteilt am'] = zeit(consentRecord.timestamp);
    row['Einwilligung IP'] = consentRecord.ip;
  }
  return row;
}

async function sendToGoogleSheet({ url, row }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row)
  });
  if (!res.ok) console.error('Google-Sheet-Webhook Fehler', res.status, await res.text());
  return res.ok;
}

async function upsertBrevoContact({ apiKey, listId, email, name, firma, qualified, metaPct, googlePct }) {
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      email,
      updateEnabled: true,
      listIds: [Number(listId)],
      attributes: {
        FIRSTNAME: (name || '').split(' ')[0] || '',
        LASTNAME: (name || '').split(' ').slice(1).join(' ') || '',
        FIRMA: firma,
        QUALIFIZIERT: !!qualified,
        GOOGLE_PCT: googlePct,
        META_PCT: metaPct
      }
    })
  });
  if (!res.ok) console.error('Brevo contact upsert error', res.status, await res.text());
  return res.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const contact = body.contact || {};
  const email = (contact.email || '').trim();
  const name = (contact.name || '').trim();
  const firma = (contact.firma || '').trim();
  const telefon = String(contact.telefon || '').trim().slice(0, 40); // optional

  if (!name || !firma || !email) {
    res.status(400).json({ error: 'Name, Firma und E-Mail sind Pflichtfelder.' });
    return;
  }

  // Ohne aktive Einwilligung wird gar nicht erst verarbeitet – nicht nur im Browser geprüft, sondern
  // auch hier, damit ein direkter POST an die API die Einwilligung nicht umgehen kann.
  if (!body.consent || body.consent.given !== true) {
    res.status(400).json({ error: 'Ohne Einwilligung zur Kontaktaufnahme kann ich die Anfrage nicht verarbeiten.' });
    return;
  }
  const consentRecord = buildConsentRecord(req, body.consent);

  const { qualified, reasons, metaPct, googlePct, budgetBucket, topInsights, readable, extraChannels } = computeResult(body.answers);

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const AGENCY_NOTIFY_EMAIL = process.env.AGENCY_NOTIFY_EMAIL;
  const RESULT_FROM_EMAIL = process.env.RESULT_FROM_EMAIL || 'no-reply@example.com';
  const RESULT_FROM_NAME = process.env.RESULT_FROM_NAME || 'Werbe-Check';
  const BREVO_LIST_ID = process.env.BREVO_LIST_ID;

  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY fehlt. E-Mail-Versand übersprungen. Siehe SETUP.md.');
    res.status(200).json({ ok: true, mailSent: false, reason: 'not-configured' });
    return;
  }

  const leadSubject = qualified
    ? `Deine Werbe-Auswertung: ${googlePct}% Google · ${metaPct}% Meta`
    : 'Deine Werbe-Auswertung';

  const tasks = [
    sendBrevoEmail({
      apiKey: BREVO_API_KEY,
      fromEmail: RESULT_FROM_EMAIL,
      fromName: RESULT_FROM_NAME,
      to: email,
      toName: name,
      subject: leadSubject,
      htmlContent: buildLeadEmailHtml({ name, qualified, reasons, metaPct, googlePct, budgetBucket, topInsights, extraChannels, consentRecord })
    })
  ];

  if (AGENCY_NOTIFY_EMAIL) {
    const agencySubject = `Neuer Lead: ${name} (${firma}), ${qualified ? 'qualifiziert' : 'UNQUALIFIZIERT'}`;
    tasks.push(sendBrevoEmail({
      apiKey: BREVO_API_KEY,
      fromEmail: RESULT_FROM_EMAIL,
      fromName: RESULT_FROM_NAME,
      to: AGENCY_NOTIFY_EMAIL,
      subject: agencySubject,
      htmlContent: buildAgencyEmailHtml({ name, firma, email, telefon, qualified, metaPct, googlePct, budgetBucket, readable, extraChannels, consentRecord })
    }));
  } else {
    console.error('AGENCY_NOTIFY_EMAIL fehlt, interne Benachrichtigung übersprungen. Siehe SETUP.md.');
  }

  if (BREVO_LIST_ID) {
    tasks.push(upsertBrevoContact({ apiKey: BREVO_API_KEY, listId: BREVO_LIST_ID, email, name, firma, qualified, metaPct, googlePct }));
  }

  // tasks[0] ist immer die Lead-Mail. Deren echtes Ergebnis wird zurückgemeldet – früher stand hier
  // pauschal mailSent:true, wodurch ein fehlgeschlagener Brevo-Call (z.B. 401 wegen IP-Allowlist)
  // nach außen wie ein erfolgreicher Versand aussah.
  // Google Tabelle: läuft parallel zu den Mails mit. Ein Fehler hier darf den Versand nicht
  // beeinflussen, deshalb kein Einfluss auf mailSent (tasks[0] bleibt immer die Lead-Mail).
  const GOOGLE_SHEET_WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (GOOGLE_SHEET_WEBHOOK_URL) {
    tasks.push(sendToGoogleSheet({
      url: GOOGLE_SHEET_WEBHOOK_URL,
      row: buildSheetRow({ name, email, firma, telefon, qualified, metaPct, googlePct, readable, extraChannels, consentRecord })
    }));
  }

  const results = await Promise.allSettled(tasks);
  const leadResult = results[0];
  const mailSent = leadResult.status === 'fulfilled' && leadResult.value === true;

  if (!mailSent) {
    console.error('Lead-Mail wurde NICHT versendet. Ursache siehe Brevo-Fehler oben.');
  }

  // Bewusst weiterhin 200: der Funnel soll für den Lead nicht kaputtgehen, nur weil der Mailversand
  // hakt. Der Fehler ist über mailSent und die Logs sichtbar.
  res.status(200).json({ ok: true, mailSent, qualified, metaPct, googlePct });
};
