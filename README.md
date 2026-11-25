# 🚛 Der Planer: Reloaded

**Das alte Spiel in neuem Gewand** – eine browserbasierte Logistik-Managementsimulation im klassischen Stil.

> 🔖 **Version: 1.29.0**

---

## 📖 Beschreibung

*Der Planer: Reloaded* ist ein im Browser spielbares Wirtschafts- und Logistikspiel.
Du übernimmst die Leitung einer kleinen Spedition und baust sie zu einem europaweit tätigen Transportunternehmen aus.
Kaufe Fahrzeuge, stelle Personal ein, disponiere Frachtaufträge quer durch Europa und behalte deine Finanzen im Blick – alles in Echtzeit.

Das Spiel läuft vollständig im Browser, ohne Installation oder Build-Schritt, und speichert den Spielstand automatisch im localStorage des Browsers.

---

## ✨ Features

### 🎨 Modernes, ansprechendes UI
- **Glassmorphism-Design**: Elegante, halbtransparente Panels und Cards.
- Überarbeitete Typografie, schicke Verläufe und bessere visuelle Hierarchie.
- **Belohnungs-Effekte**: Konfetti bei Erfolgen, Kapitelabschlüssen und Goldaufträgen, schwebende **+€-Anzeigen** am Kontostand nach jeder Lieferung und animierte Erfolgs-Banner. Animationen respektieren die Systemeinstellung *Bewegung reduzieren*.
- **Statusleisten-Chips**: 🔥 aktuelle Pünktlichkeits-Serie mit Bonus, 🏅 freigeschaltete Erfolge und 📖 aktuelles Story-Kapitel (jeweils anklickbar).
- **Geführtes Ausbildungsprogramm** (im Stil klassischer *Theme*-Spiele): 8 Kapitel – Erster Auftrag, Unterwegs, Touren planen, Die Firma wächst, Werkstatt & Verschleiß, Ausschreibungen & Verträge, Spezialfracht und Europa als Netzwerk.
  - Jedes Kapitel besteht aus konkreten Schritten, die das Spiel automatisch an echten Spieleraktionen erkennt (z. B. Auftrag angenommen, Tour gestartet, Wartung beauftragt).
  - Ein gut lesbares, deckendes **Berater-Widget** unten links zeigt Checkliste und Tipp zum aktuellen Schritt; der als Nächstes zu nutzende Knopf wird **pulsierend hervorgehoben**.
  - Im Kapitel *Touren planen* legt das Spiel zwei passende **🎓 Übungsaufträge** direkt am Standort des LKW in den Frachtmarkt (Hinfahrt + Rückladung zurück in Richtung Zentrale). Eine Schritt-für-Schritt-Anleitung im Tourenplaner hebt den jeweils anzuklickenden Auftrag hervor und erklärt den Effekt mit echten Zahlen (vermiedene Leerkilometer, Auslastung, Deckungsbeitrag). Übungsaufträge verfallen ohne Ansehensverlust.
  - Ist ein Schritt gerade nicht ausführbar (Fahrzeug unterwegs, kein passender Auftrag, zu wenig Geld, keine passende Ausschreibung), erklärt der Berater den Grund und meldet sich, sobald es weitergeht.
  - Kapitel öffnen sich nach Spielfortschritt; „Werkstatt“ erscheint reaktiv, sobald ein Fahrzeug verschleißt. Nach jedem Kapitelabschluss folgt sofort das nächste verfügbare Kapitel.
  - Schritte lassen sich überspringen, das Tutorial pausieren und im **🎓 Ausbildungsheft** im Büro fortsetzen oder wiederholen.
- **Operative Spedition statt Klick-Warteschlange**: Fahrer haben begrenzte Schichtlenkzeit, Fahrzeuge verlieren real spürbar an Tempo und Effizienz, und eine Tour kann wegen Personal, Zustand oder Frist eine schlechte Wahl sein. Personalentscheidungen und Vertragsrisiken wirken damit direkt in den Kernablauf.

### 🧊 3D-Grafik (three.js)
- **Prozedurale 3D-Fahrzeugmodelle** im Low-Poly-Stil für alle 8 Fahrzeugtypen – inklusive passender Aufbauten (Koffer, Plane, Kühlaggregat, Tank, ADR-Warntafeln, Tieflader mit Bagger) und Anhängervarianten.
- **Gerenderte Fahrzeugbilder** im Fahrzeugkatalog, in den Fuhrpark-Karten und in den Unterwegs-Ereignissen.
- **Live-Firmenhof im Büro**: Eine animierte 3D-Szene zeigt Halle (mit dem eigenen Firmennamen), Bürogebäude und Parkplätze. Fahrzeuge am Firmensitz stehen auf dem Hof, ausfahrende Fahrzeuge setzen zurück und fahren los, zurückkehrende fahren ein. Tageslicht, Straßenlaternen und Fensterbeleuchtung folgen der Spieluhrzeit; auf der Straße fährt Verkehr vorbei.
- **Animiertes Hauptmenü**: Ein Sattelzug fährt im Sonnenuntergang über die Landstraße.
- three.js wird erst bei Bedarf nachgeladen; ohne WebGL fällt das Spiel automatisch auf Emoji-Symbole zurück.

### 📖 Story-Kampagne (Story-Modus)
- **6 Kapitel** mit Geschichte rund um das Erbe von Onkel Heinz und die Konkurrenz von *Brummer & Söhne* – vom geerbten Transporter bis zum Logistik-Imperium.
- Jedes Kapitel hat 2–4 **Ziele** (z. B. pünktliche Lieferungen, Umsatz, Flottengröße, Spezialfracht, Länder, Ansehen) und eine **Geldbelohnung** (5.000 € bis 100.000 €).
- **Zielübersicht im Büro** mit Fortschrittsbalken, Kapitel-Intro- und Abschluss-Dialoge sowie ein Kampagnen-Überblick.

### 🏅 Erfolge
- **25 Erfolge** (davon 2 geheim) für Meilensteine wie Lieferanzahl, Serien, Goldaufträge, Flottengröße, Kontostand, gefahrene Kilometer, Länder, Fahrer-Legenden, Pressearbeit, riskante Entscheidungen u. v. m.
- Erfolgsgalerie mit Freischaltdatum – erreichbar über die Statusleiste oder die Bürokachel **🏅 Erfolge**. Verfügbar in Story- und Sandbox-Modus.

### 🔥 Pünktlichkeits-Serie
- Jede pünktliche Lieferung in Folge erhöht den **Serienbonus** um 2,5 % (max. +25 %) auf die Auszahlung. Eine verspätete Lieferung setzt die Serie zurück.

### 💎 Goldaufträge
- Seltene **VIP-Aufträge** (ca. 6 % der fuhrparktauglichen Aufträge) mit **2,5-facher Vergütung** und doppeltem Bonus – aber nur **12 Stunden** annehmbar. Goldene, schimmernde Auftragskarte, Sondermeldung bei Eingang und Extra-Kundenansehen bei pünktlicher Lieferung.

### 🎲 Unterwegs-Ereignisse
- Während der Fahrt melden sich Fahrer per CB-Funk mit **Entscheidungen**: Stau-Abkürzung, Zeitdruck & Blitzer, Motorwarnleuchte, Anhalter, Übermüdung, dubiose Beiladung, Kühe auf der Fahrbahn, Fernsehteam.
- Riskante Optionen können Zeit oder Geld bringen – oder Bußgelder, Ansehensverluste, Verzögerungen und Schäden. Erfahrene Fahrer erhöhen die Erfolgschancen.
- **Echte Pannen**: Fahrzeuge mit schlechtem Zustand (oder nach riskanten Entscheidungen) bleiben liegen. Abschleppdienst, eigener Mechaniker oder später im Fuhrpark reparieren – nach der Reparatur setzt das Fahrzeug seine Route fort.
- Das Spiel pausiert während eines Ereignisses; Aufenthalte werden in Fuhrpark-Karten und ETAs berücksichtigt.

### 🎤 Pressekonferenzen
- Nach Unfällen, Pannen, mehreren Verspätungen, Wachstumsschüben (neue Bekanntheitsgrad-Stufe), langen Pünktlichkeits-Serien oder negativem Kontostand stellt die Presse Fragen.
- Die Antwort beeinflusst das Unternehmensansehen; das Ergebnis erscheint als Schlagzeile der *Frankfurter Logistik-Rundschau*.

### 🏢 Unternehmensführung
- Starte mit einem kleinen Budget (abhängig vom Schwierigkeitsgrad) und baue dein Unternehmen auf.
- Verwalte dein Büro und erweitere es mit neuen Räumen.
- Führe **Pressekonferenzen** durch und reagiere diplomatisch auf Krisen oder Erfolge, um deine Reputation zu steigern.
- **Ansehen-Dashboard**: Im Büro öffnet die Kachel **🏆 Ansehen** eine zentrale Übersicht über alle Reputationswerte:
  - **Unternehmensansehen (0–100)**: Fortschrittsbalken, Bekanntheitsgrad-Stufe (1–5), konkreter Effekttext (z. B. „Maximale Auftragsgröße 26.000 kg") und Trendpfeil.
  - **Kundenansehen** für jeden bekannten Auftraggeber: Sternebewertung, Balken, Abschluss-/Fehlerstatistik und Effektbeschreibung (inkl. Loyalitätsbonus bei ≥ 75).
  - **30-Tage-Verlaufsgraph** (Sparkline-SVG) für Unternehmensansehen und jeden Kunden, damit Trends frühzeitig erkannt werden.
  - **Frühwarnsystem**: Fällt ein Wert unter die Warnstufe (< 25) oder Gefahrenstufe (< 10), erscheint ein farbiger Badge (gelb/rot) direkt auf der Bürokachel – ohne das Dashboard öffnen zu müssen.

### 🚛 Fuhrparkmanagement
- **Spürbarer Fahrzeugverschleiß**: Kilometer verringern den Zustand deutlich, senken die reale Reisegeschwindigkeit und erhöhen den Kraftstoffverbrauch. Monatliche Gutschriften reparieren Fahrzeuge nicht mehr automatisch; Wartung und Mechaniker-Kompetenz werden zu echten Kapazitätsentscheidungen.
- **8 Fahrzeugtypen**: vom kleinen Transporter (2 t) bis zum Schwerlastzug (60 t).
- Kaufe, warte und verkaufe Fahrzeuge (MAN, Volvo, Scania, DAF, Mercedes Actros u. a.).
- Weise Fahrern Fahrzeuge zu und entferne sie wieder, wenn Fahrzeug und Fahrer sich am Firmensitz befinden.
- Fahrzeuge können in den Zuständen *untätig*, *fahrend* oder *Wartung* sein.
- **Wartungsdauer in Spielzeit**: Wartungen dauern 120 Spielminuten, pausieren mit dem Spiel und werden über das Speichern und Laden hinweg fortgesetzt.
- Treibstoffverbrauch und Verschleiß werden realistisch simuliert.
- **Automatische Tankstopps**: Sinkt der Kraftstoffstand unter 15 %, hält das Fahrzeug selbständig an einer Tankstelle (15 Min. Verzögerung); die Kraftstoffkosten werden automatisch verbucht.
- **Anhänger-System**: Fahrzeuge mit Anhänger-Slot können beim Kauf mit einem passenden Anhänger ausgestattet werden. Sattelzug, Kühllaster und Tankzug unterstützen große Auflieger (Planenauflieger, Pritschenauflieger, Kühlauflieger, Tankauflieger); der Kleintransporter kann mit kleinen Anhängern (Kastenanhänger, Pritschenanhänger) ausgerüstet werden. Anhänger erhöhen die Nutzlast und ermöglichen zusätzliche Frachtanforderungen (z. B. Kühlung, ADR).
- **Anhänger-Verwaltung im Fuhrpark**: Für Fahrzeuge am Firmensitz kann direkt ein kompatibler Anhänger gekauft und angekoppelt werden. Anhänger lassen sich abkoppeln und im Fuhrpark einlagern – von dort können sie an ein anderes kompatibles Fahrzeug angekoppelt oder verkauft werden.

### 👥 Personal als Betriebssystem
- **Fahrer-Lenkzeit**: Die Schichtkapazität hängt von Qualifikation ab und wird live im Personal- und Fuhrparkbildschirm angezeigt. Eine Tour kann die Kapazität überschreiten, muss dann aber eine planbare Ruhepause enthalten; Zufriedenheit beeinflusst Tempo und damit Fristen.
- **Echte Schicht- und Ruheplanung**: Die 9–11-Stunden-Lenkzeit ist kein harter Unsichtbarkeitsfilter mehr. Erschöpft sich die Schicht während einer Tour, pausiert der Fahrer tatsächlich für 11 Stunden und fährt danach weiter. Die Simulation, „Nächstes Ereignis“ und alle geplanten ETAs berücksichtigen dieselbe Pause.
- **Transparenter Tourenplaner**: Für jeden ausgewählten Auftrag zeigt der Planer vorhergesagte Abholung, Lieferung, Lieferfrist und verbleibenden Zeitpuffer. Ein ausklappbarer Detailbereich enthält Gewicht, Konditionen, Bonus, Strafe und Anforderungen. Pflichtpausen, Wiederverfügbarkeit und mögliche Terminrisiken werden separat ausgewiesen.
- **Fahrerzertifikate mit Wirkung**: Gefahrgut braucht nicht nur ein ADR-fähiges Fahrzeug oder einen Tankanhänger, sondern zusätzlich einen Fahrer mit ADR-Zertifikat.
- **Mitarbeiterzufriedenheit mit Folgen**: Unzufriedenheit erzeugt Warnungen und kann am Monatsende zu Kündigungen führen. Ein bezahlter Mitarbeiterbonus erhöht die Zufriedenheit um 20 Punkte und verhindert drohende Fluktuation.
- **Wirksame Spezialrollen**: Telefonistin erhöht Auftragsvolumen und Zuschlagschancen, Manager reduziert Verwaltungszeit, Buchhalterin senkt Gehälter/Betriebskosten, Rechtsanwältin reduziert Vertragsstrafen und Mechaniker senkt Verschleiß sowie Wartungskosten.

### 📦 Auftragsystem
- **Tourenplanung statt Einzelauftrag-Zwang**: Mehrere Aufträge lassen sich im neuen Routenplaner zu einer Mehrstopp-Tour kombinieren. Fahrzeug, Reihenfolge, Abhol- und Lieferstopps sowie optionale Rückfahrt zur Zentrale werden vor dem Start festgelegt.
- **Entscheidung auf Basis echter Routendaten**: Der Tourenplaner berechnet Belade- und Leerfahrkilometer, Auslastung, Fahrtdauer, erwarteten Umsatz, Treibstoffkosten und den Deckungsbeitrag vor Fixkosten. Rückladungen werden anhand der Leerfahrt markiert.
- **Offene Endpunkte und Rückfrachten**: Touren müssen nicht mehr zwingend zur Zentrale zurückkehren. Fahrzeuge bleiben am letzten Ziel einsatzbereit und können von dort neue regionale Fracht übernehmen, wodurch Standortplanung und Rückladungen erstmals strategisch relevant werden.
- **Wöchentliche Kundenverträge**: Die **Frischeland-Linie** von Müller Lebensmittel garantiert eine wiederkehrende Ladung Frankfurt → Hamburg. Vertragsfracht besitzt feste Konditionen, eine sichtbar ausgewiesene Zuverlässigkeit und kann nach drei verpassten Ladungen vollständig verloren gehen. Beim Laden älterer Spielstände wird der Erstvertrag automatisch ergänzt.
- **Vertragsportfolio und Ausschreibungen**: Neben der Frischeland-Linie können allgemeine Fracht, Medizingüter, Papier, Gefahrgut und Industriekomponenten als wiederkehrende Verträge angeboten werden. Verträge unterscheiden sich in Takt, Frist, Nutzlast, Sonderanforderungen, Stornierbarkeit und Marge.
- **Konkurrenzangebote**: Jede Ausschreibung wird gegen einen namentlich genannten Wettbewerber entschieden. Drei Angebotsstrategien tauschen Marge gegen Gewinnchance; Unternehmensansehen, Telefonzentrale und Schwierigkeitsgrad verändern den Zuschlag. Nutzlast, Ausrüstung und Mindestansehen werden vorab geprüft.
- **Angebotsfrist**: Ausschreibungen laufen zwei Tage. Passt eine Ausschreibung nicht zur eigenen Flotte, kann sie jederzeit folgenlos abgelehnt werden; lässt man die Frist ungenutzt verstreichen, verliert man Kundenansehen beim ausschreibenden Kunden.
- **Langfristige Vertragsqualität**: Pünktliche Vertragsserien erhöhen nach vier Lieferungen den künftigen Preis und zahlen einen Treuebonus. Wiederholte Verspätungen oder verfallene Vertragsladungen senken die Zuverlässigkeit und können zum Verlust der Beziehung führen.
- **25 fiktive Kunden** aus verschiedenen Branchen (Lebensmittel, Chemie, Bau, Medizin, Automobil …).
- **10 Frachttypen**: Allgemeingut, Kühlware, Gefahrgut, Schwerlast, Kraftstoff u. v. m.
- Aufträge haben eine Verfallszeit (2 Spieltage) und dynamische Preise je nach Frachttyp und Schwierigkeitsgrad.
- **Fuhrpark-adaptives Auftragssystem**: Auftragsgewichte passen sich an die aktuelle Gesamtkapazität des Fuhrparks an. Normale Aufträge bleiben innerhalb der Flottenkapazität; 15 % der Aufträge sind **Großaufträge** (🏋️) mit höherem Gewicht und +50 % Vergütung.
- **Garantierte erfüllbare Aufträge**: Bei jeder Auftragsgeneration sind mindestens 40 % der neuen Aufträge (mind. 1) auf die aktuelle Flotte zugeschnitten – die Gewichte bleiben innerhalb der maximalen Fahrzeugkapazität und alle Sonderanforderungen (Kühlung, ADR usw.) können vom Fuhrpark erfüllt werden.
- **Warenklassen mit Vergütungsfaktoren**: Jede Ware gehört einer Klasse an, die den Basis-km-Preis multipliziert – Standardware/Baustoffe (×1,0), Lebensmittel/Flüssigkeiten (×1,1), Kühlware (×1,3), Fahrzeugteile/Schwerlast (×1,2), Kraftstoff/Gefahrgut/Medizingüter (×1,5). Eilaufträge (⚡) erhalten zusätzlich den Faktor 1,4.
- **Distanzbasierte Vergütungsformel**: `random(5, 12) €/km × Distanz × Warenfaktor × Eilfaktor × Marktmodifikator × Kundenbindungsbonus` – die Basisspanne von 5–12 €/km garantiert faire und konsistente Wirtschaftlichkeit. Jede Auftragskarte zeigt beim €/km-Wert einen Tooltip mit vollständiger Faktor-Aufschlüsselung.
- **Kundenbindungsbonus**: Kunden mit einem Ansehen ≥ 75 bieten 5 % bessere Konditionen.
- **Auftragsfehler-Popup**: Bei einem verfallenen oder verspätet gelieferten Auftrag erscheint ein detailliertes Pop-up mit den finanziellen Auswirkungen. Das Spiel wird dabei automatisch pausiert. Mehrere Fehlermeldungen werden nacheinander angezeigt.
  - *Verspätete Lieferung*: Zeitstempel (Erhalten, Angenommen, Abgeholt, Deadline, Geliefert), Verspätung und Aufschlüsselung der Vertragsstrafe.
  - *Verfallenes Angebot*: Erklärung, dass das Angebot nicht innerhalb der Annahmefrist angenommen wurde, Zeitpunkt des Fristendes, entgangener Auftragswert (keine Strafzahlung), Kundenansehen vorher → nachher sowie ein Tipp zum rechtzeitigen Ablehnen.
- **Automatischer Auftragsablauf**: Angebote, die nicht innerhalb ihrer Annahmefrist angenommen werden, verfallen automatisch (geprüft beim Tageswechsel). Es fällt keine Strafzahlung an, aber das Ansehen beim jeweiligen Auftraggeber sinkt – je höher das Kundenansehen, desto größer der Verlust: `round(12 × √(Ansehen / 100))` Punkte, z. B. −6 bei Ansehen 25, −8 bei 50 und −12 bei 100. **Abgelehnte** Angebote (✗ Ablehnen) kosten dagegen kein Ansehen.
- **Kundenstatus (Kundenansehen)**: Jeder Auftraggeber hat ein eigenes Ansehen (0–100, Start: 50), das in den Auftragskarten als Sternbewertung angezeigt wird. Erfüllte Aufträge erhöhen das Ansehen – mit **sinkenden Zuwächsen** je höher der Wert bereits ist.
- Verwalte verfügbare, aktive und abgeschlossene Aufträge in übersichtlichen Tabs – **mit aktuellen Zählern** in jedem Tab.
- **Auftragsortierung**: Die Auftragsliste kann nach verschiedenen Kriterien sortiert werden – **Wert**, **Gewicht**, **Entfernung**, **€/km** (alle Tabs), **Ablaufzeit** (verfügbare Aufträge), **Frist** (aktive Aufträge) sowie **Abschlusszeitpunkt** und **Status** (Pünktlich/Verspätet, abgeschlossene Aufträge). Ein Klick auf ein aktives Sortierkriterium kehrt die Reihenfolge um (auf-/absteigend).
- **Abgeschlossene Aufträge**: Standardmäßig werden die letzten 10 abgeschlossenen Aufträge angezeigt. Über die Schaltfläche **⬇ Weitere anzeigen** können in Schritten von 10 weitere Aufträge eingeblendet werden.
- **Erfüllbarkeitsanzeige**: Jeder verfügbare Auftrag zeigt ein grünes ✔ (erfüllbar) oder rotes ✘ (nicht erfüllbar) Icon; technisch nicht erfüllbare Aufträge (z. B. Kühlware ohne Kühllaster) erscheinen **ausgegraut** und geben dem Spieler Investitionsanreize.
- **Mehrtransport-Aufträge**: Übersteigt das Auftragsgewicht die Fahrzeugkapazität, werden automatisch mehrere Fahrten durchgeführt – pro Fahrt wird die maximale Nutzlast vom verbleibenden Transportvolumen abgezogen.
- **Fahrzeug-Statusübersicht**: Im Fuhrpark-Bildschirm zeigt jede Fahrzeugkarte alle noch ausstehenden Ziele der aktuellen Route (Abholung, Lieferung, Rückkehr) mit der jeweiligen geschätzten Ankunftszeit an – nicht nur das unmittelbar nächste. Ein Beladungsbalken zeigt bei geladenen Fahrzeugen Gewicht und Füllgrad. In der Warteschlange ist für jeden Folgeauftrag die voraussichtliche Startzeit sichtbar – so kann frühzeitig umgeplant werden.
- **Auftragsreihenfolge ändern**: Die Position eines Auftrags in der Warteschlange eines Fahrzeugs lässt sich per Pfeilschaltfläche (▲ / ▼) verschieben, solange der Auftrag noch nicht aktiv ausgeführt wird.
- **Auftrag umleiten**: Ein warteschlangenstehender oder aktiv fahrender (aber noch nicht abgeholter) Auftrag kann im *Aktive Aufträge*-Tab einem anderen geeigneten Fahrzeug zugewiesen werden. Wurde die Ladung bereits abgeholt, ist eine Umleitung nicht mehr möglich.
- **Multi-Fahrzeug-Lieferung**: Übersteigt das Auftragsgewicht die Kapazität eines einzelnen Fahrzeugs, können zusätzliche Fahrzeuge hinzugefügt werden, die die verbleibende Ladung parallel transportieren. Der Auftrag gilt erst dann als vollständig abgeschlossen, wenn die Gesamtmenge geliefert wurde.
- **Nicht erfüllbare Aufträge ablehnen**: Ein Klick auf den Button lehnt alle nicht erfüllbaren Aufträge auf einmal ab (mit Bestätigungsdialog).
- **Auftragsvolumen skaliert mit Bekanntheitsgrad**: Die Auftragsgeneration läuft ohne obere Mengenbegrenzung – die Verfallszeit (1–2 Spieltage) reguliert den Pool natürlich. Die maximale Auftragstonnage steigt mit dem Bekanntheitsgrad (Stufe 1–5). Beim Erreichen einer neuen Bekanntheitsgrad-Stufe werden sofort zwei neue Aufträge der neuen Kategorie eingespeist.
- **Fahrzeug-ETA bei Auftragsannahme**: Bei der Fahrzeugauswahl im Auftragsmenü (Tab *Verfügbare Aufträge*) zeigt jedes Fahrzeug im Dropdown an, ab wann es am Abholort sein kann – z. B. `[ab 10:30]` für denselben Spieltag oder `[ab 15.03. 10:30]` für einen späteren Tag. Für Fahrzeuge, die bereits am Abholort sind, erscheint `[ab sofort]`.
- **Verbessertes Auftragsmenü**: Jede Auftragskarte zeigt die genaue Lieferfrist als Datum & Uhrzeit, die Streckenlänge in km (bei Mehrtransporten multipliziert mit der Anzahl der Fahrten) sowie den Wert **€/km** für direkten Lukrativitätsvergleich. Abgeschlossene Aufträge zeigen den Abschlusszeitpunkt; verspätete Lieferungen werden rot hervorgehoben und enthalten eine Aufschlüsselung der Strafzahlung. Der Auftraggeber-Name ist klickbar und öffnet eine **Unternehmensübersicht** mit aktuellem Kundenansehen und einer Statistik der angebotenen, angenommenen, erledigten und verfehlten Aufträge.

### 🗺️ Europakarte
- **41 europäische Städte** auf einer Canvas-basierten Karte (Hamburg, Berlin, München, Amsterdam, Paris, Wien, Warschau, Rom, Barcelona u. v. m.).
- **Echte Europakarte**: Küstenlinien, Ländergrenzen, Seen, Flüsse und Gebirge stammen aus den gemeinfreien Geodaten von [Natural Earth](https://www.naturalearthdata.com/) und werden in der flächentreuen Lambert-Projektion (LAEA, wie die offizielle EU-Kartografie) dargestellt. Alle Städte liegen an ihren realen Positionen.
- **Atlas-Stil**: Meer mit Flachwasser-Schimmer an den Küsten, Gradnetz, pastellfarbene Staaten, Gebirgsschattierung, Autobahnen im klassischen Straßenkarten-Orange sowie deutsche Beschriftungen für Länder, Meere und Gebirge. Beschriftungen weichen einander automatisch aus; die Karte wird auf hochauflösenden Displays gestochen scharf gezeichnet.
- **Straßennetz-Routing**: Fahrzeuge folgen dem realen Straßennetz (Dijkstra-Algorithmus) statt direkter Luftlinien – mit automatisch eingefügten Transitstopps über Autobahnkreuze.
- Verfolge deine Flotte in Echtzeit auf der Europakarte; Fahrzeuge starten und enden stets am richtigen Standort.
- **Straßentypen-Visualisierung**: Autobahnen als breite, blaue Linien mit weißer Mittellinie; Bundesstraßen als gelbe Linien (nur in Zoom-Stufe 2 sichtbar).
- **Autobahnkreuz-Markierungen**: Knotenpunkte mit 3+ Autobahnverbindungen werden als blaue Rauten hervorgehoben.
- **Drei Zoom-Stufen**: *Totale* (Zoom 1) zeigt nur Autobahnen und Hauptstädte; *Regionalansicht* (Zoom 2) zeigt alle Straßentypen, Auftragsziele (📦/🏁) und das HQ-Icon; *Detailansicht* (Zoom 3) für maximale Kartendetails.
- Wechsel zwischen Zoom-Stufen per **+/–-Schaltflächen** oder **Mausrad**; Zoom-Stufe und Kartenposition werden im Spielstand gespeichert.
- **Pan-Funktion**: Die Karte lässt sich per Maus-Ziehen (Drag) verschieben.
- **Schnellnavigation** in der Seitenleiste: Ein Klick auf Firmenzentrale, Auftragsziele oder Fahrzeuge zentriert die Karte sofort in Zoom-Stufe 2 auf den gewünschten Punkt.
- **Fahrzeug-Icons**: Fahrzeuge werden auf der Karte mit dem jeweiligen Typ-Icon (🚐 🚛 🚚 u. a.) dargestellt; ausgewählte Fahrzeuge werden golden hervorgehoben.
- **Fahrzeug-Info-Panel**: Ein Klick auf ein Fahrzeug auf der Karte oder in der Flottenliste öffnet ein seitliches Detailpanel mit Fahrer, Auftrag, Ziel, Gesundheit und Kraftstoff – die Route wird gleichzeitig auf der Karte markiert; bei mehreren überlappenden Fahrzeugen erscheint ein Auswahlmenü.

### 👥 Personalverwaltung
- **7 Mitarbeiterrollen**: LKW-Fahrer (€ 2.400/Monat), Mechaniker, Buchhalter, Telefonistin, Manager, Rechtsanwältin u. a.
- Stelle Personal ein oder entlasse es – Gehälter werden monatlich automatisch abgebucht.
- Zufallsgenerierte deutsche Namen für alle Mitarbeiter.
- **Fahrer-Erfahrung**: Fahrer sammeln pro Lieferung XP (abhängig von Strecke und Pünktlichkeit) und steigen bis **Stufe 5** auf – vom *Neuling* bis zur *Legende*. Erfahrene Fahrer verbrauchen bis zu 12 % weniger Kraftstoff und meistern riskante Unterwegs-Entscheidungen öfter. Rang und XP-Balken werden im Personal-Screen angezeigt.

### 💶 Finanzsystem
- Vollständiges Finanzsystem mit Einnahmen, Ausgaben, Transaktionsprotokoll und KPIs.
- **Kreditsystem** mit variablen Zinssätzen, laufzeitgerechten Monatsraten, automatischer monatlicher Tilgung und einem von Ansehen und Flottenwert abhängigen Kreditrahmen.
- Monatliche Kosten: Gehälter, Kraftstoff, Fahrzeugwartung.

### 📣 Marketing *(in Vorbereitung)*
- Neuer Bürobereich für Werbeverträge (Zeitungsanzeigen, Radio-Spots, Sponsoring).
- Aktive Werbeverträge beschleunigen den Bekanntheitsgrad-Aufbau und sorgen so für mehr und größere Aufträge.

### ⚡ Performance
- **Selektive DOM-Updates im Fuhrpark**: Fahrzeugkarten werden nur neu gerendert, wenn sich ihr Inhalt geändert hat (HTML-Caching pro Fahrzeug). Strukturänderungen (Kauf/Verkauf von Fahrzeugen) lösen einen vollständigen Neuaufbau aus, während stabile Zustände nur gezielt aktualisiert werden.
- **Optimierte Finanzansicht**: KPI-Karten, Transaktionen sowie Kredit- und Restschuldanzeige werden nur dann neu in den DOM geschrieben, wenn sich der Inhalt tatsächlich geändert hat.
- **Debounced Resize-Handler**: Das `window.resize`-Ereignis wird erst 150 ms nach dem letzten Auslösen verarbeitet, um übermäßige Karten-Neuberechnungen beim Verändern der Fenstergröße zu vermeiden.

### 📈 Marktereignisse
- **8 dynamische Ereignisse**: Kraftstoffpreissprünge, Streiks, Rezessionen, Konjunkturbooms, Winterstürme, Autobahnstaus, Umweltvorschriften u. a.
- Jedes Ereignis hat eine Eintrittswahrscheinlichkeit und Dauer und beeinflusst Kraftstoffpreise, Auftragsvolumen, Fahrzeuggeschwindigkeit und Reputation.

### ⏱️ Zeitsteuerung
- Einstellbare Spielgeschwindigkeit: **Pause / 1× / 5×**.
- **⏭ Nächstes Ereignis**: Springt automatisch zum nächsten relevanten Spielereignis – entweder die Ankunft eines Fahrzeugs, der Abschluss eines Auftrags oder das Ende einer Wartung. Spart Wartezeit, ohne die manuelle Kontrolle zu verlieren.
- Das Spiel läuft in 15-Minuten-Ticks; Fahrzeuge, Aufträge und Ereignisse werden in Echtzeit aktualisiert.

### 💾 Spielstand & Meldungsprotokoll
- Spielstand wird **automatisch nach jedem Tageswechsel** per `localStorage` gespeichert und beim nächsten Besuch wiederhergestellt.
- **Meldungsprotokoll**: Alle Toast-Benachrichtigungen werden persistent im Spielstand gespeichert (bis zu 200 Einträge). Das Protokoll ist über die Schaltfläche 📋 in der Statusleiste oder den Bürobereich *Meldungsprotokoll* jederzeit abrufbar – neueste Einträge zuerst, farbcodiert nach Typ.

---

## 🎮 Spielmodi & Schwierigkeitsgrade

| Modus      | Beschreibung                                    |
|------------|-------------------------------------------------|
| **Story**   | 6-teilige Kampagne mit Kapitelzielen und Belohnungen |
| **Sandbox** | Freies Spiel ohne Story – Erfolge, Goldaufträge und Ereignisse inklusive |

| Schwierigkeit | Startkapital | Auftragsfrequenz | Ereigniswahrscheinlichkeit |
|---------------|-------------|------------------|---------------------------|
| **Leicht**    | € 100.000   | 1,5×             | 0,5×                      |
| **Normal**    | € 50.000    | 1×               | 1×                        |
| **Schwer**    | € 25.000    | 0,75×            | 1,5×                      |

---

## 🚀 Spielen

Das Spiel ist direkt über **GitHub Pages** im Browser spielbar:
**▶ [https://tallerlei.github.io/Der-Planer/](https://tallerlei.github.io/Der-Planer/)**

Für lokale Entwicklung:

```bash
# Repository klonen
git clone https://github.com/Tallerlei/Der-Planer.git
cd Der-Planer

# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev

# Build erstellen
npm run build

# Tests ausführen
npm test
```

---

## 🗂️ Projektstruktur

```
Der-Planer/
├── index.html          # Haupt-HTML-Datei und Spiel-UI (Single Page Application)
├── scripts/
│   └── build-map-geo.mjs # Erzeugt src/map_geo_data.js aus Natural-Earth-GeoJSON
├── css/
│   └── style.css       # Dunkles Theme, Layout, Komponenten
├── src/
│   ├── main.js         # Einstiegspunkt – DOM-Init, window-Globals
│   ├── data.js         # Statische Spieldaten (Fahrzeuge, Städte, Kunden, Ereignisse …)
│   ├── map_projection.js # Kartenprojektion (Lambert, flächentreu) für die Europakarte
│   ├── map_geo_data.js # Generierte Geodaten (Länder, Küsten, Flüsse, Seen, Gebirge)
│   ├── utils.js        # Reine Hilfsfunktionen (rand, fmt, pick, uid)
│   ├── constants.js    # Spielkonstanten (APP_VERSION, TIME_COSTS, …)
│   ├── state.js        # Spielzustand (GS) und Stadtverzeichnis
│   ├── routing.js      # Dijkstra-Wegfindung, Routenberechnung
│   ├── game/
│   │   ├── engine.js   # Spielschleife, advanceGameTime, Koordination
│   │   ├── vehicles.js # Fahrzeugfabrik und Bewegungslogik
│   │   ├── orders.js   # Reine Auftragslogik (canFulfillOrder, getReputationTier)
│   │   ├── contracts.js # Wiederkehrende Wochenverträge und Zuverlässigkeit
│   │   ├── tutorial.js # Kapitel, Schritte und Bereitschaftsprüfung des Ausbildungsprogramms
│   │   ├── finance.js  # Transaktionen, Buchführung
│   │   ├── staff.js    # Personalverwaltung
│   │   ├── events.js   # Marktereignisse
│   │   ├── progression.js # Kampagne, Erfolge, Serien, Goldaufträge, Fahrer-XP
│   │   ├── road_events.js # Interaktive Unterwegs-Ereignisse & Pannen
│   │   ├── press.js    # Pressekonferenzen
│   │   └── save.js     # localStorage-Persistenz
│   ├── ui/
│   │   ├── statusbar.js    # Statusleiste und Auftrags-Badges
│   │   ├── notifications.js # Toast-Meldungen
│   │   ├── modal.js        # Modal-Dialog
│   │   ├── screens.js      # Bildschirmnavigation
│   │   ├── fleet.js        # Fuhrpark-Screen
│   │   ├── orders_ui.js    # Auftrags-Screen
│   │   ├── tutorial.js     # Ausbildungsheft und Tutorial-Kapitel
│   │   ├── personnel.js    # Personal-Screen
│   │   ├── finance_ui.js   # Finanz-Screen
│   │   ├── office.js       # Büro-Screen
│   │   ├── dialogs.js      # Ereignis-, Presse-, Kapitel- und Erfolgsdialoge
│   │   ├── fx.js           # Konfetti, +€-Anzeigen, Erfolgs-Banner
│   │   └── map.js          # Karte (Canvas-Rendering mit Natural-Earth-Geodaten)
│   ├── three/
│   │   ├── assets.js            # Leichtgewichtige Fassade (lädt three.js bei Bedarf)
│   │   ├── vehicle_models.js    # Prozedurale 3D-Fahrzeugmodelle
│   │   ├── thumbnail_renderer.js # Rendert Fahrzeugbilder für die UI
│   │   ├── depot_scene.js       # Live-3D-Firmenhof im Büro
│   │   └── menu_scene.js        # Animierter Hauptmenü-Hintergrund
│   └── __tests__/
│       ├── utils.test.js       # Tests für Hilfsfunktionen
│       ├── routing.test.js     # Tests für Wegfindungsalgorithmus
│       ├── constants.test.js   # Tests für Spielkonstanten
│       ├── orders.test.js      # Tests für Auftragslogik
│       ├── tour_planning.test.js # Tests für Mehrstopp-Touren und Verträge
│       ├── progression.test.js # Tests für Kampagne, Erfolge, Serien, Fahrer-XP
│       ├── tutorial.test.js    # Tests für Kapitelablauf und Bereitschaftsprüfung des Tutorials
│       └── road_events.test.js # Tests für Unterwegs-Ereignisse & Pressekonferenzen
├── vite.config.js      # Vite-Konfiguration
└── package.json        # npm-Skripte und Abhängigkeiten
```

Der Spielstand wird automatisch per `localStorage` gespeichert und beim nächsten Besuch wiederhergestellt.

---

## 🛠️ Technischer Überblick

| Merkmal          | Details                                           |
|------------------|---------------------------------------------------|
| Sprache          | HTML5, CSS3, Vanilla JavaScript (ES Modules)      |
| Build-System     | [Vite](https://vitejs.dev/) – schneller Dev-Server und Bundles |
| Test-Framework   | [Vitest](https://vitest.dev/) – 149 Unit-Tests    |
| Persistenz       | Browser `localStorage`                            |
| Grafik           | HTML5 Canvas (Karten & Routen), [three.js](https://threejs.org/) (3D-Fahrzeuge, Firmenhof, Menü) |
| Deployment       | [GitHub Pages](https://tallerlei.github.io/Der-Planer/) via GitHub Actions |
