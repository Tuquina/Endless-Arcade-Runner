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
  rhythm/    modo Ritmo: niveles (canciones + charts), compilador de niveles, RhythmRun (reloj, juicio, práctica)
  render/    Renderer, temas/paletas, partículas, animación del personaje, confeti
  audio/     síntesis WebAudio: efectos, música del modo sin fin, secuenciador de canciones y AudioSystem
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

**Pinchos seguidos:** los tríos de pinchos solo aparecen con algo de dificultad (≥0,4; los cuádruples ≥0,9) y la
métrica de justicia mide la ventana *decisiva* de salto (≥150 ms con la hitbox real, que es más chica que el
dibujo), así que ya no exigen el píxel exacto.

### Modos y dificultades

El menú elige el **modo de juego** (*Sin fin*, *Ritmo* o *Gravedad*, ver abajo) y la **dificultad** del modo sin fin, con récord
propio en cada una
(`src/core/modes.ts`, `DIFFICULTIES` en `src/world/Difficulty.ts`):

| | Fácil | Normal | Difícil |
|---|---|---|---|
| Ritmo de la rampa (por metro) | ×0,55 | ×1 | ×1,5 |
| Dificultad inicial / máxima | 0 / 0,7 (nunca llega a la velocidad tope) | 0 / 1 | 0,2 / 1 |
| Aparición de obstáculos nuevos | ×1,6 más lejos | los de la tabla | ×0,6 (más cerca) |
| Respiro entre obstáculos | +0,2 s | — | −0,08 s |
| Presión de fin de juego | sin | ×1 | ×1,25 |
| Metros cuentan para aspectos de distancia | no | sí | sí |

Cada perfil solo mueve *en qué punto de la rampa ya verificada* está cada metro (velocidad y variantes salen de la
misma relación dificultad↔velocidad que valida la tabla de variantes) y ajusta el respiro plano, así que los
niveles siguen siendo resolubles en los tres; hay tests de solvencia por dificultad. Para sumar un modo nuevo,
ver el comentario de `src/core/modes.ts`.

### Suelo y HUD

El suelo (`src/render/Ground.ts`) tiene franja de profundidad, estratos y piedras con parallax, un borde superior
con luz, vegetación animada por mundo y paredes en los pozos. Si los cuadros se mantienen lentos (celular
débil) baja solo a una versión sin decoración y vuelve cuando se recupera. En partida el HUD muestra los metros
en vivo y el progreso hacia la próxima skin.

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

## Modo Ritmo

Un modo aparte del runner infinito: **8 niveles fijos**, cada uno con una canción original compuesta para el juego.
Los obstáculos caen sobre las notas, así que saltar *en el tiempo de la música* es lo más seguro.

**Música propia, sin archivos ni derechos de terceros.** Cada canción es un dato (`src/rhythm/levels.ts`):
tempo, tonalidad y escala, y secciones (intro, verso, estribillo, puente, final, outro) con batería, bajo,
arpegios, pads y melodía escritos en la misma grilla de semicorcheas que el *chart* de obstáculos. El secuenciador
(`src/audio/song.ts`) los sintetiza en vivo con WebAudio (osciladores, filtros, eco). Escribir la música y el nivel
lado a lado es lo que garantiza que coincidan.

| # | Nivel | BPM | Escala | Idea nueva |
|---|---|---|---|---|
| 1 | Primer Pulso | 100 | La menor | pinchos (con guías de salto) |
| 2 | Hora Dorada | 108 | Re dórico | bloques y huecos |
| 3 | Marea Alta | 116 | Mi menor | pinchos triples, huecos largos, pisos que suben |
| 4 | Bosque Binario | 122 | Sol dórico | plataformas de impulso |
| 5 | Eclipse | 128 | Do menor armónica | anillos: saltar en el aire |
| 6 | Neón Salvaje | 136 | Fa# menor | todo junto |
| 7 | Tormenta Solar | 144 | Si menor | cadenas de anillos |
| 8 | Último Beat | 152 | La frigio | todo, denso |

**Cómo se arma un nivel** (`src/rhythm/level.ts`). El chart usa un carácter por semicorchea: `s d t` (1, 2 o 3
pinchos), `b B` (bloque bajo / alto), `p P` (hueco / hueco largo), `u n` (sube / baja el piso), `j` (plataforma de
impulso), `r` (anillo en el aire), `D` (disco coleccionable). Para cada obstáculo se simula con la física real
qué momentos de salto lo pasan (con un toque corto *y* con el botón mantenido) y se lo coloca para que ese rango
quede **centrado en la nota**. Anillos, impulsos y discos se ubican sobre la trayectoria de un jugador "perfecto"
que salta en cada nota. Los tests recorren cada nivel con ese jugador y con versiones desprolijas: errores
aleatorios de ±60 ms (±45 ms desde el nivel 5), todo adelantado o atrasado 40 ms, y toques siempre cortos o siempre
largos. Si un chart pide un salto antes de aterrizar del anterior, el nivel ni compila y el error dice sección,
compás y paso.

**Sincronía.** La simulación sigue el reloj del audio (`AudioContext`, descontando la latencia de salida): espera a
que suene el primer tiempo y después corrige el bucle de paso fijo de a milisegundos. En Ajustes hay un control de
**sincronía del ritmo** para auriculares Bluetooth u otros equipos con más latencia.

**Progresión.** Completar un nivel abre el siguiente. Cada nivel guarda el mejor %, los intentos, la precisión
(cada salto se juzga *perfecto / bien / ok* según la distancia a la nota; nota S, A, B o C) y 3 **discos** ubicados
sobre el camino ideal (se pierden si saltás fuera de tiempo; cuentan al completar el nivel). El **modo Práctica**
agrega puntos de control al inicio de cada sección, reaparecés con la música desde ahí, y no guarda récords.
Los niveles completados y los discos desbloquean aspectos (DJ, Bola disco, Maestro).

## Modo Gravedad

Tercer modo, aparte de los otros dos: **3 niveles** con melodías famosas de **dominio público** (los compositores
murieron hace más de un siglo), en arreglos nuevos hechos para el juego y sintetizados en vivo, así que tampoco hay
grabaciones de terceros (`src/rhythm/gravityLevels.ts`):

| # | Nivel | Obra original | Arreglo | Idea nueva |
|---|---|---|---|---|
| 1 | Himno de la Alegría | Beethoven, 9.ª sinfonía (1824) | house, 128 BPM | portales de gravedad y anillos azules |
| 2 | Can-Can | Offenbach, *Galop infernal* (1858) | electro galop, 150 BPM | **bola**: cada toque la cambia de piso a techo |
| 3 | Rey de la Montaña | Grieg, *Peer Gynt* (1875) | trap, 140 BPM | **nave**: mantené para subir, soltá para bajar |

Y dos niveles **extremos** con temas originales compuestos para el juego (sin derechos de terceros):

| # | Nivel | Estilo y tempo | Qué tiene |
|---|---|---|---|
| 4 | Voltaje | electro house en Fa menor, 150 → 120 (pausa) → 160 BPM | todas las formas, portales de velocidad, **onda** |
| 5 | Hipervelocidad | drum & bass en Re menor, 140 → 160 → 174 (con medio tiempo) → 180 BPM | aceleración continua hasta ×1,5 de velocidad |

Para estos dos se sumó al motor: **tempo por sección** (el mapa de tiempos de cada semicorchea lo usan la música,
el chart y la sincronía), **portales de velocidad** (`<` ×0,8, `=` ×1, `>` ×1,25, `}` ×1,5) y la forma **onda**
(`W`): sube en diagonal mientras mantenés y baja al soltar, sin inercia, en pasillos más angostos que los de la
nave. Se buscaron temas modernos "sin copyright": NCS solo es gratis para videos (un juego necesita su licencia
comercial) y los de Kevin MacLeod (CC BY) se pueden usar con crédito, pero este entorno no permite descargar audio
y transcribirlos de memoria no sería fiel; por eso los dos temas son originales.

Se descartaron temas con dueño: la base de un rap de YouTuber tiene autor y no está liberada, y la melodía de
Tetris (Korobeiniki) es popular pero la versión de videojuego está protegida por una marca sonora.

**Gravedad en la física** (`src/physics/Player.ts`): el jugador tiene un sentido de "arriba" (`g = ±1`) y una forma
(`cube`, `ball`, `ship`). Todas las reglas verticales están escritas respecto de `g`, así que con la gravedad
invertida el salto es el espejo exacto del normal (hay un test que lo comprueba paso a paso). Los portales
cambian la gravedad o la forma; el anillo azul invierte la gravedad en el aire; la bola invierte la gravedad
al tocar estando sobre una superficie; la nave acelera hacia arriba mientras se mantiene el botón y puede
deslizarse por piso y techo (los costados de los bloques sí matan).

**Cómo se arman** (`src/rhythm/level.ts`): los niveles de gravedad tienen techo y el chart suma `G` (portal de
gravedad), `O` (anillo azul), `C`/`L`/`V` (portales de cubo, bola y nave), `f` (cambio de lado de la bola) y
`^`/`v` (empezar y dejar de mantener en la nave). Con la gravedad invertida, los obstáculos se espejan y cuelgan
del techo. Para la bola se buscan por simulación los momentos de toque que esquivan pinchos en el lado actual
(tarde) y en el opuesto (temprano), y se centra esa ventana en la nota. Para la nave, el nivel **talla un túnel**
alrededor del vuelo ideal, con un margen arriba y abajo. Los tests recorren los tres niveles en la nota, con
errores aleatorios de ±40 ms (también al soltar en la nave), adelantados o atrasados 40 ms y con toques cortos o
largos.

## Secreto

Tocar **11 veces seguidas al personaje del menú** (sin pausas de más de ~0,65 s) activa el *modo secreto*: todos
los aspectos y todos los niveles quedan disponibles **solo durante la sesión** (`sessionStorage`; nada se escribe
en el guardado). El menú muestra un cartel "Modo secreto activo" que lo desactiva y vuelve al progreso real; el
progreso hecho mientras tanto (récords, monedas, niveles completados) sí se guarda.

## Aspectos y objetivos

21 aspectos (solo cosméticos: no cambian la hitbox ni los controles), cada uno con su propio diseño: patrón en el
cuerpo, cara, accesorios animados, efectos y una estela de partículas propia (brasas, burbujas, estrellas, humo,
copos, píxeles…). Se desbloquean con objetivos de varios tipos, así que no todo se resuelve corriendo más lejos:

| Tipo | Ejemplos |
|---|---|
| Distancia en una partida | 250 m Menta · 500 Rosa · 750 Tigre · 1000 Gafas · 1500 Ninja · 2000 Arcoíris · 3000 Fuego · 4000 Astronauta · 5000 Rey · 8000 Diamante |
| Monedas (total) | 100 Panda · 300 Rana · 800 Mago |
| Partidas jugadas | 40 Robot · 150 Fantasma |
| Sierras esquivadas | 40 Hielo |
| Prensas pasadas | 25 Glitch |
| Ritmo y Gravedad | 2 niveles DJ · 12 discos Bola disco · 8 niveles Maestro |

Los objetivos se cumplen en el momento (aviso en pantalla y guardado inmediato), el menú muestra el aspecto más
cercano a completarse, y las metas de distancia aparecen como puertas doradas en el mundo.
Un aspecto es un dato en `src/core/skins.ts`; `src/render/PlayerView.ts` sabe dibujar los patrones, caras y
accesorios, y los previews del menú usan ese mismo código. Para agregar uno basta una entrada nueva en `SKINS`.
