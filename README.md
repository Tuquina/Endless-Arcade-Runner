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
npm run gen:variants  # regenera la tabla de variantes justas (solo si cambiás segmentos con timing aleatorio)
npm run preview    # servir dist/ localmente
```

Parámetros de URL para depurar: `?debug` (hitboxes, FPS, `window.game`), `?seed=N` (mismo nivel siempre),
`?theme=N` (empezar con la paleta N, 0–4), `?at=N` (empezar N metros adelante para ver el tramo final sin llegar).

## Cómo está organizado

```
src/
  core/      Game (máquina de estados), Loop (paso fijo), Rng, Pool, skins/desafíos
  input/     un solo "botón" a partir de teclado, mouse, touch y lápiz
  physics/   constantes de ajuste, Player (salto variable, coyote time, jump buffer), jumpModel
  world/     World (geometría y movers), segmentos prefabricados, Generator, Difficulty, Solver, tabla de variantes
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

## Progresión: cómo cambia el juego al avanzar

| Distancia | Novedad |
|---|---|
| 0 m | pinchos |
| 150 m | bloques |
| 300 m | pozos |
| 350 m | tramos de monedas (descanso con premio) |
| 500 m | plataformas elevadas |
| 800 m | **sierras móviles**: suben y bajan siguiendo un riel |
| 1000 m | **techos bajos**: el salto se corta, hay que medir la altura |
| 1200 m | combos de timing + altura |
| 1600 m | **prensas**: columnas que se estrellan contra el suelo (tiemblan un instante antes) |
| 2400 m | **gauntlets**: varios obstáculos encadenados; más frecuentes con la presión |

Cada mundo (400 m, con su propia paleta) favorece unos obstáculos: Neón pinchos, Atardecer bloques y pozos,
Océano sierras, Bosque plataformas y techos, Vacío prensas. Después de 2400 m, la *presión* sigue subiendo
(descansos más cortos, más gauntlets) aunque la velocidad ya esté al máximo.

### Obstáculos móviles y por qué siempre se pueden pasar

El movimiento de una sierra o una prensa depende de **la posición del corredor** (no de un reloj), así que cada
partida es idéntica y el solver puede razonar sobre ellas con exactitud. Como la fase de cada obstáculo es
aleatoria, no se usa cualquiera: cada diseño con timing aleatorio (sierras, techos, prensas, gauntlets) es una
*variante* numerada, y `npm run gen:variants` guarda en `src/world/variantTable.ts` cuáles son justas en cada
dificultad. Una variante es justa si se puede terminar desde cualquier punto donde el corredor pudo aterrizar,
con margen de hitbox, en distintas alineaciones de paso y a todas las velocidades de su tramo, y si la ventana
para saltar es de tamaño humano. El generador solo usa variantes de esa tabla (coste en el juego: ~0,7 ms por
cada 1000 m). Los tests comprueban que la tabla está al día: **si editás un segmento marcado `validate`,
ejecutá `npm run gen:variants` (~2 min) y commiteá el resultado**.

## Aspectos y objetivos

18 aspectos (solo cosméticos: no cambian la hitbox ni los controles), cada uno con su propio diseño: patrón en el
cuerpo, cara, accesorios animados, efectos y una estela de partículas propia (brasas, burbujas, estrellas, humo,
copos, píxeles…). Se desbloquean con objetivos de cinco tipos, así que no todo se resuelve corriendo más lejos:

| Tipo | Ejemplos |
|---|---|
| Distancia en una partida | 250 m Menta · 500 Rosa · 750 Tigre · 1000 Gafas · 1500 Ninja · 2000 Arcoíris · 3000 Fuego · 4000 Astronauta · 5000 Rey · 8000 Diamante |
| Monedas (total) | 100 Panda · 300 Rana · 800 Mago |
| Partidas jugadas | 40 Robot · 150 Fantasma |
| Sierras esquivadas | 40 Hielo |
| Prensas pasadas | 25 Glitch |

Los objetivos se cumplen en el momento (aviso en pantalla y guardado inmediato), el menú muestra el aspecto más
cercano a completarse, y las metas de distancia aparecen como puertas doradas en el mundo.
Un aspecto es un dato en `src/core/skins.ts`; `src/render/PlayerView.ts` sabe dibujar los patrones, caras y
accesorios, y los previews del menú usan ese mismo código. Para agregar uno basta una entrada nueva en `SKINS`.
