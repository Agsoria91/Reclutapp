# Pruebas visuales

Capturan todas las pantallas de la app con **datos ficticios** (ninguna consulta
llega a la base) y comparan píxel a píxel antes y después de un cambio de diseño.

```bash
npm run visual:base      # antes del cambio: guarda la referencia
npm run visual:nuevo     # después del cambio
npm run visual:comparar  # lista qué pantallas cambiaron
```

- Para otro ancho de pantalla: `ANCHO=900 npm run visual:base` (y lo mismo en `visual:nuevo`).
- Las capturas quedan en `tests/visual/.base` y `tests/visual/.nuevo` (no se suben al repositorio).
- Los datos de prueba están en `datos-demo.cjs`. Nunca agregar datos reales.
