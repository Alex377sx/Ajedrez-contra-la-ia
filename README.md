# Ajedrez

Partida web en el navegador, con dos modos.

- **Clásico:** reglas oficiales, reloj opcional, notación algebraica y ventaja material. Contra la IA o en el mismo dispositivo.
- **Didáctico y táctico:** radar de control, deshacer/rehacer, pista conceptual, veteranía, casillas elevadas, minas y energía.

## Página

https://alex377sx.github.io/Ajedrez-contra-la-ia/

El sitio se publica al empujar `main`. La clave de API se pega en el engranaje y queda en el navegador. El endpoint por defecto es `https://api.x.ai/v1/chat/completions`, con `grok-3` o `grok-3-mini`. Si no hay clave, el navegador bloquea la llamada o la jugada no es legal, mueve un minimax local.

Para jugar en la misma WiFi, una persona ejecuta `npm start` y crea la sala. La otra abre la dirección que aparece (la IP local) y entra con el código.

Las piezas son el juego Gioco, con volumen y el caballo de perfil, el mismo para blancas y negras.

## Pruebas

```bash
npm test
```
