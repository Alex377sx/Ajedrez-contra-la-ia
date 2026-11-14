# Ajedrez

Partida web en el navegador, con dos modos.

- **Clásico:** reglas oficiales, reloj opcional, notación algebraica y ventaja material. Contra la IA o en el mismo dispositivo.
- **Didáctico y táctico:** radar de control, deshacer/rehacer, pista conceptual, veteranía, casillas elevadas, minas y energía.

## Arranque

```bash
npm start
```

Abre `http://127.0.0.1:3000`. En la misma WiFi, usa también la dirección local que imprime la consola.

La clave de API se pega en **Configurar API** y queda en `localStorage`. El endpoint por defecto es `https://api.x.ai/v1/chat/completions`, con `grok-3` o `grok-3-mini`. Si no hay clave, la red falla o la jugada no es legal, mueve un minimax local.

Con `npm start`, las llamadas a `api.x.ai` pasan por `POST /api/ai` para evitar el CORS del navegador. Ese proxy solo habla con `api.x.ai`.

## Pruebas

```bash
npm test
```
