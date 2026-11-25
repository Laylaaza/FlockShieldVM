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
