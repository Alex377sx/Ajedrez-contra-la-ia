# Ajedrez

Partida web en el navegador, con dos modos.

- **Clásico:** reglas oficiales, reloj opcional, notación algebraica y ventaja material. Contra la IA o en el mismo dispositivo.
- **Didáctico y táctico:** radar de control, deshacer/rehacer, pista conceptual, veteranía, casillas elevadas, minas y energía.

## Página

https://alex377sx.github.io/Ajedrez-contra-la-ia/

El sitio se publica al empujar `main`. La clave de API se pega en el engranaje y queda en el navegador. El endpoint por defecto es `https://api.x.ai/v1/chat/completions`, con `grok-3` o `grok-3-mini`. Si no hay clave, el navegador bloquea la llamada o la jugada no es legal, mueve un minimax local.

En Multijugador, una persona pulsa Crear sala y pasa el código. La otra abre la misma página y pulsa Unirse. Si el juego corre con `npm start` en la misma WiFi, la sala usa ese equipo y muestra su dirección local.

Las piezas son el juego Cburnett (Lichess / Wikimedia), con contorno oscuro en las blancas.

## Pruebas

```bash
npm test
```
