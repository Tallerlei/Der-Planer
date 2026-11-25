# 🧾 Offene Punkte – Der Planer: Reloaded

Sammlung bekannter Bugs, nicht umgesetzter Features und offener Designfragen zur späteren Bearbeitung.
Stand: Version 1.25.1 (20.11.2026). Erledigte Punkte abhaken (`[x]`) oder entfernen.

Legende: 🔴 Bug / Exploit · 🟡 beschrieben, aber ohne Wirkung · 🟠 Designfrage · ⚪ Pflege / Kleinigkeiten

---

## 🔴 Bugs & Exploits

### [x] 1. Kredite werden nie zurückgezahlt
- **Wo:** `src/ui/finance_ui.js` → `takeLoan()`, `renderFinance()`
- **Problem:** `takeLoan` bucht nur den Kreditbetrag gut. Es gibt keine Tilgung und keine Zinsen, obwohl die Kreditkarte eine Monatsrate anzeigt. Kredite können beliebig oft aufgenommen werden → unbegrenztes Geld.
- **Hinweis:** Die README-Angabe „Kreditsystem mit variablen Zinssätzen“ stimmt aktuell nicht. Auch die angezeigte Rate (`amount × (1 + rate) / months`) ignoriert die Laufzeit (Jahreszins auf mehrjährige Kredite).
- **Lösungsidee:** Kredite in `GS.finance.loans` speichern (Restschuld, Rate, Restlaufzeit), in `processMonthEnd()` abbuchen, Kreditlimit (z. B. abhängig von Ansehen/Flottenwert), aktive Kredite im Finanz-Screen anzeigen, optional Sondertilgung.
- **Erledigt in 1.22.2:** Kredite werden mit laufzeitgerechter Annuität monatlich getilgt, sind im Finanz-Screen sichtbar und unterliegen einem von Ansehen und Flottenwert abhängigen Kreditrahmen.

### [x] 2. Routenplaner bewirkt nichts
- **Wo:** `src/ui/routes.js` → `addRouteStop()`, `dispatchRoute()`; `src/game/engine.js` → `processStopAction()`
- **Problem:** `addRouteStop` verknüpft Stopps mit *verfügbaren* Aufträgen, `processStopAction` verarbeitet aber nur *angenommene* (`GS.orders.active`). Eine geplante Route kostet nur Kraftstoff – keine Abholung, keine Lieferung, keine Bezahlung. Außerdem fehlt ein Rückkehr-Stopp: Das Fahrzeug bleibt in der letzten Stadt stehen.
- **Lösungsidee:** Nur angenommene Aufträge (des gewählten Fahrzeugs) als Pickup/Delivery verknüpfen oder Aufträge beim Disponieren automatisch annehmen; Rückkehr zum Firmensitz anhängen; Kapazität/Reihenfolge (Pickup vor Delivery) validieren. Alternativ Feature entfernen und Text („steuern automatisch Abholung und Lieferung an“) anpassen.
- **Erledigt in 1.23.0:** Der wirkungslose manuelle Routenplaner wurde vollständig entfernt; die auftragsbasierte automatische Routensteuerung bleibt bestehen.

### [x] 3. Wartung kann „hängen bleiben“
- **Wo:** `src/ui/fleet.js` → `sendToMaintenance()`
- **Problem:** Das Ende der Wartung läuft über ein `setTimeout` von 5 Sekunden Echtzeit. Wird währenddessen gespeichert und neu geladen, bleibt das Fahrzeug dauerhaft im Status `maintenance`. Zudem ist die Dauer unabhängig von Pause/Spielgeschwindigkeit.
- **Lösungsidee:** Wartungsende als Spielzeit speichern (`v.maintenanceUntilMinute`) und in `advanceGameTime()` prüfen; beim Laden alte `maintenance`-Fahrzeuge ohne Endzeit auf `idle` setzen.
- **Erledigt in 1.23.1:** Wartung läuft jetzt 120 Minuten in Spielzeit, bleibt beim Speichern erhalten, pausiert korrekt und alte hängende Spielstände werden beim Laden bereinigt.

### [x] 4. Anhänger werden beim Umleiten/Hinzufügen ignoriert
- **Wo:** `src/game/engine.js` → `_validateVehicleForOrder()` (genutzt von `reassignOrder()` und `addVehicleToOrder()`)
- **Problem:** Geprüft werden nur `cat.requirements` des Fahrzeugs, nicht die des Anhängers. Ein Sattelzug mit Kühlauflieger kann Kühlware annehmen (`acceptOrder` nutzt `getVehicleEffectiveRequirements`), aber ein solcher Auftrag kann nicht auf ihn umgeleitet oder mit ihm unterstützt werden.
- **Erledigt in 1.25.0:** Umleitung und Zusatzfahrzeug prüfen dieselben kombinierten Fahrzeug-/Anhängeranforderungen wie die Auftragsannahme.

### [ ] 5. „Aufträge fehlgeschlagen“ zeigt immer 0
- **Wo:** `src/ui/modal.js` → `openStatsModal()`; `src/game/engine.js` → `completeOrder()`, `expireOrders()`
- **Problem:** `GS.stats.ordersFailed` wird angezeigt, aber nirgends hochgezählt.
- **Lösungsidee:** Bei verspäteter Lieferung und/oder verfallenem Angebot erhöhen (vorher festlegen, was als „fehlgeschlagen“ zählt) und ggf. getrennt ausweisen.

---

## 🟡 Beschrieben, aber ohne Wirkung

### [x] 6. Vier von sechs Mitarbeiterrollen haben keinen Effekt
- **Wo:** `src/data.js` → `STAFF_ROLES`
- **Problem:** Nur der Mechaniker wirkt (Wartungsrabatt, Pannenhilfe). Ohne Effekt, aber mit Gehalt:
  - Buchhalterin – „senkt Steuerlast“ (es gibt keine Steuern)
  - Telefonistin – „erhöht Auftragseingang“
  - Manager – „erhöht Effizienz“
  - Rechtsanwältin – „reduziert Strafen“
- **Erledigt in 1.25.0:** Alle Rollen besitzen jetzt einen mit Qualifikation skalierten Betriebsbonus (Auftragsvolumen/Zuschläge, Zeitkosten, Lohnkosten, Strafen und Fahrzeugverschleiß).

### [x] 7. Mitarbeiterzufriedenheit ohne Auswirkung
- **Wo:** `src/game/engine.js` → `processMonthEnd()`; `src/ui/personnel.js`
- **Problem:** Zufriedenheit sinkt monatlich (Untergrenze 40) bzw. ändert sich durch Unterwegs-Ereignisse, hat aber keine Folgen.
- **Erledigt in 1.25.0:** Zufriedenheit beeinflusst Fahrtempo, erzeugt Kündigungswarnungen und kann bei dauerhaft sehr niedrigen Werten zum Personalverlust führen. Bezahlt wird ein gezielter Bonus als Gegenmaßnahme.

### [x] 8. ADR-Zertifikat der Fahrer wird nicht geprüft
- **Wo:** `src/game/staff.js` → `createStaff()` (vergibt `ADR`); `src/game/engine.js` → `acceptOrder()`
- **Problem:** Jeder Fahrer darf Gefahrgut transportieren; das Zertifikat ist rein kosmetisch.
- **Erledigt in 1.25.0:** Für ADR-Aufträge werden Fahrzeugausrüstung und Fahrerzertifikat gemeinsam geprüft.

### [ ] 9. Effekte einiger Marktereignisse fehlen
- **Wo:** `src/data.js` → `MARKET_EVENTS`; `src/game/events.js` → `applyEvent()`
- **Problem:** Definiert, aber nie angewendet:
  - Streik: `driverStrikeChance`
  - Wintersturm: `fuelConsumptionMod`
  - Neue Umweltregulierung: `oldVehicleTaxMod`
  
  Außerdem verlangsamt „Autobahnsperre A3 Frankfurt–Köln“ über `speedMod` **alle** Fahrzeuge in ganz Europa.
- **Lösungsidee:** Effekte implementieren (z. B. Fahrer streiken tageweise, Verbrauchszuschlag in `tickVehicles`, monatliche Abgabe für Fahrzeuge mit hohem km-Stand); Autobahnsperre nur auf betroffene Verbindung anwenden (Routing-Gewicht).

### [x] 10. Schwierigkeitswert `competitorActivity` ungenutzt
- **Wo:** `src/data.js` → `DIFFICULTY`
- **Erledigt in 1.25.0:** Die Konkurrenzintensität verändert die Gewinnchance bei Vertragsausschreibungen.

### [ ] 11. Marketing ist nur ein Platzhalter
- **Wo:** `index.html` → `#screen-marketing`; `GS.company.werbevertrag_aktiv`, `werbevertrag_booster`
- **Problem:** Screen zeigt „demnächst verfügbar“; die Spielstandfelder werden nie verwendet. README listet Marketing als „in Vorbereitung“.
- **Lösungsidee:** Werbeverträge (Zeitung, Radio, Sponsoring) mit monatlichen Kosten, die Ansehen/Bekanntheitsgrad und Auftragsvolumen steigern.

### [x] 12. Fahrzeugverschleiß praktisch nicht vorhanden
- **Wo:** `src/game/engine.js` → `tickVehicles()` (`health -= km × 0.0001`), `processMonthEnd()` (`health += 5`)
- **Problem:** 10.000 km kosten nur 1 % Zustand, jeden Monat kommen +5 % dazu. Kostenpflichtige Wartung ist damit sinnlos; Pannen durch schlechten Zustand entstehen nur über Unterwegs-Ereignisse.
- **Erledigt in 1.25.0:** Verschleiß liegt bei 1 % pro 500 km, wird durch Mechaniker reduziert, beeinflusst Geschwindigkeit und Verbrauch, und monatliche Wartungsgebühren reparieren Fahrzeuge nicht mehr automatisch.

---

## 🟠 Designfragen

### [ ] 13. „Auftragsfrequenz“ des Schwierigkeitsgrads multipliziert auch die Vergütung
- **Wo:** `src/game/engine.js` → `generateOrders()`, `injectTierOrders()` (`valueMod = orderValueMod × diff.orderFrequency`)
- **Frage:** Gewollt? Leicht zahlt dadurch 1,5×, Schwer 0,75×. Die README-Tabelle erwähnt nur die Frequenz. Entweder dokumentieren oder eigenen Wert (`orderValueMod`) im Schwierigkeitsgrad einführen.

### [ ] 14. Kein Bankrott / Game Over
- **Problem:** Der Kontostand kann unbegrenzt negativ bleiben (nur Warnung + Pressekonferenz).
- **Lösungsidee:** Dispozinsen auf negativen Kontostand, nach X Monaten im Minus Insolvenz (Game Over mit Statistik) – erst sinnvoll, wenn Punkt 1 (Kredite) gelöst ist.

### [ ] 15. Verfall wird nur beim Tageswechsel geprüft
- **Wo:** `src/game/engine.js` → `advanceGameTime()` → `expireOrders()`; `src/game/orders.js` → `isOrderAvailable()`
- **Problem:** Ein Angebot verschwindet bei Fristende aus der Liste, das Verfalls-Pop-up erscheint aber erst Stunden später (beim nächsten Tageswechsel). Betrifft besonders die 12-Stunden-Goldaufträge.
- **Lösungsidee:** `expireOrders()` stündlich (oder bei jedem Tick) aufrufen.

### [ ] 16. Alle Aufträge starten in Deutschland
- **Wo:** `src/game/engine.js` → `generateOrders()`, `injectTierOrders()` (`origins = CITIES.filter(c => c.country === 'DE')`)
- **Frage:** Gewollt? Mit wachsendem Bekanntheitsgrad könnten auch Auslandsabholungen (Rückladungen) freigeschaltet werden.

---

## ⚪ Pflege & Kleinigkeiten

### [ ] 17. Copilot-Anweisungen veraltet
- **Wo:** `.github/copilot-instructions.md`
- **Problem:** Nennt `js/game.js` als Ort von `APP_VERSION` (tatsächlich `src/constants.js`) und „kein Build-Schritt“ (das Projekt nutzt Vite, Deployment baut mit `npm run build`).

### [ ] 18. Alte Story-Spielstände schließen evtl. mehrere Kapitel nacheinander ab
- **Wo:** `src/game/progression.js` → `checkCampaign()`
- **Hinweis:** Beim Laden eines Spielstands von vor v1.22.0 können erfüllte Kapitelziele mehrere Kapitel in Folge abschließen und deren Geldbelohnungen auszahlen. Harmlos, aber großzügig.

### [ ] 19. Offenes Unterwegs-Ereignis wird nicht gespeichert
- **Wo:** `src/game/road_events.js` (`_pending` nur im Speicher)
- **Hinweis:** Wird die Seite neu geladen, während ein Ereignisdialog offen ist, entfällt das Ereignis ersatzlos.
