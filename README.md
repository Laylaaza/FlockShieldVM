# FlockShieldVM

- [frontend/](frontend/) bevat het dashboard met HTML, CSS en JavaScript.
- [backend/](backend/) bevat de PHP-API voor FlockShield en de SQL Server-koppeling.
- [backend/smartlamp/](backend/smartlamp/) bevat de oudere SmartLamp-API en de bijbehorende JSON-opslag. Het PHP-bestand in de hoofdmap houdt het bestaande SmartLamp-ingangspunt beschikbaar.
- [sketch_nov5a/](sketch_nov5a/) bevat de ESP32-firmware.

## Lokaal starten

Voer dit commando vanuit de hoofdmap uit met PHP 8 of hoger.

~~~powershell
php -S localhost:8000 -t frontend backend/router.php
~~~

Open het dashboard op [localhost:8000](http://localhost:8000/). De FlockShield-API gebruikt op dezelfde server routes onder /api. De SmartLamp-API is lokaal bereikbaar via /api.php.

Zie de [backendhandleiding](backend/README.md) voor SQL Server en de [SmartLamp-handleiding](backend/smartlamp/README.md) voor het oudere endpoint.

## Prestatiedashboard

Op de startpagina kiest de gebruiker een module en start een leesverbinding met de API. In de actieve browsertab vernieuwt het dashboard iedere vijf seconden. `GET /api/detections` en `GET /api/actions` ondersteunen `module_id` zodat de laatste registraties per module worden opgehaald. Live module toont de geregistreerde modulestatus en bevestiging van het mechanisme. De huidige gegevens bevatten geen hardware-heartbeat of meting of de vogels zijn weggegaan.

Het dashboard leest `GET /api/modules`, `GET /api/detections`, `GET /api/actions`, `GET /api/ai/test-rounds` en `GET /api/ai/evaluations`. Gebruik op Ubuntu voor de drie aanvullende leesroutes dezelfde API-upstream als voor `/api/modules`, met behoud van de bestaande methode- en toegangsregels. Chart.js wordt met de frontend meegeleverd.

- Precision = correct positieve voorspellingen / alle geldige positieve voorspellingen. Recall = correct positieve voorspellingen / alle geldige tests met vogels. AI-evaluaties gebruiken één geselecteerde gegevensbron en de UTC-uitvoerdatum van hun testronde. Scenario’s worden gegroepeerd op testronde en testomstandigheid, met het testitem als terugval.
- Het activeringspercentage deelt bevestigde acties door acties met een bekende uitkomst. Een geldige bevestiging valt op of na het opdrachttijdstip. Een foutmelding of expliciete foutstatus zonder bevestiging telt als mislukt. Openstaande en tegenstrijdige acties tellen niet mee.
- Reactietijd is de tijd tussen detectie en bevestigde activering. Alleen via detectie-ID gekoppelde acties met een geldige chronologie worden geplot.
- Datavolledigheid is het aandeel opgehaalde gebeurtenissen met een registratie-ID, geldig tijdstip, positief module-ID en bron (detectie), of mechanisme en status (actie). De optionele betrouwbaarheidsscore telt niet mee.
- De API levert maximaal 1.000 recente detecties en 1.000 recente acties. Op Inzichten geldt het scenario- en bronfilter voor AI-evaluaties. De startpagina vraagt maximaal 30 detecties en 30 acties van de gekozen module op.
