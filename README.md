# ONE BUTTON

Un runner arcade 2D de **un solo botón**: el personaje avanza solo y vos controlás todo el juego con un toque.
Tocá para saltar, mantené para saltar más alto. Fácil de aprender, cada vez más difícil de dominar.

- TypeScript + Canvas 2D + Vite. Sin dependencias en tiempo de ejecución, sin backend ni servicios externos.
- Se publica como archivos estáticos (`dist/` ≈ 70 KB, funciona desde cualquier subcarpeta de un hosting).
- Funciona en PC, tablets y celulares (vertical y horizontal, áreas seguras, controles táctiles).

## Controles

| Dispositivo | Acción |
|---|---|
| PC | `Espacio`, clic izquierdo o `↑` (mantener = salto más alto) |
| Celular / tablet | tocar cualquier parte de la pantalla |
| Pausa | botón del HUD, `Esc` o `P` (también se pausa sola al perder el foco) |

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # tests (física, generador, solver, justicia, audio, guardado…)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + build estático en dist/
npm run preview    # servir dist/ localmente
```

Parámetros de URL para depurar: `?debug` (hitboxes, FPS, `window.game`), `?seed=N` (mismo nivel siempre),
`?theme=N` (empezar con la paleta N, 0–4).

## Cómo está organizado

```
src/
  core/      Game (máquina de estados), Loop (paso fijo), Rng, Pool, skins/desafíos
  input/     un solo "botón" a partir de teclado, mouse, touch y lápiz
  physics/   constantes de ajuste, Player (salto variable, coyote time, jump buffer), jumpModel
  world/     World (geometría), segmentos prefabricados, Generator, Difficulty, Solver
  render/    Renderer, temas/paletas, partículas, animación del personaje, confeti
  audio/     síntesis WebAudio: efectos, música y AudioSystem (autoplay, interruptores)
  storage/   Save (localStorage versionado, a prueba de datos corruptos y de varias pestañas)
  ui/        pantallas DOM (menú, HUD, pausa, derrota, ajustes, aspectos) y estilos
```

Decisiones de diseño que conviene conocer:

- **Física a paso fijo (120 Hz)** con render interpolado: el juego se comporta igual a 30, 60 o 144 fps.
- **Unidades en tiles**: la altura visible mínima es 10 tiles y el ancho mínimo 14, así que la visibilidad y la
  dificultad son iguales en cualquier pantalla. Todo el ajuste de sensación está en `src/physics/constants.ts`.
- **Niveles infinitos y justos.** El generador encadena segmentos prefabricados según la distancia. Un *solver*
  (búsqueda exhaustiva con la misma física del juego) demuestra en los tests que:
  1. cada segmento tiene solución en todo su rango de dificultad y velocidad, con margen de timing;
  2. 6 partidas generadas de 2500 m se pueden completar de punta a punta;
  3. la ventana de tiempo para saltar es de al menos 150 ms en todos los segmentos (`fairness.test.ts`).

  Si agregás un segmento en `src/world/segments/index.ts`, los tests lo validan solos.
- **Sin garbage en el bucle**: objetos y partículas reutilizados, caché de gradientes y colores.
- **Audio 100 % procedural** (sin archivos). El contexto se crea y reanuda en el primer gesto del usuario.

## Desafíos y aspectos

Llegar a 250, 500, 1000, 2000 y 5000 m en una sola partida desbloquea aspectos del personaje
(solo cosmético; no cambia la hitbox ni los controles).
