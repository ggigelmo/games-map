# Night City Maps

Navegador GPS con la estética de Cyberpunk 2077.

Es una **PWA**: se despliega como web y se añade a la pantalla de inicio del
iPhone, donde arranca a pantalla completa sin barra de Safari. Sin App Store,
sin Apple Developer Program y sin Mac.

En producción: <https://games-map.ggigelmo.workers.dev>

## Qué hace

**Mapa y posición**

- Mapa de teselas vectoriales con estilo propio: fondo negro azulado, carreteras
  en amarillo y cian con halo de neón, edificios extruidos en rojo.
- Iconos de POI según el tipo de establecimiento (130 categorías mapeadas).
- La cámara te sigue y **gira con tu rumbo**. En marcha manda el GPS; parado,
  la brújula del móvil, porque `coords.heading` llega a `null` sin movimiento.
- HUD con velocímetro, rumbo, precisión y posición.

**Buscar e ir**

- Buscador a pantalla completa con autocompletado, sesgado a tu posición y con
  la distancia a cada resultado.
- Ruta en coche dibujada en magenta con el mismo apilado de neón que las calles.
- **Vista previa** que encuadra el viaje entero para decidir, y botón **IR** que
  baja la cámara a nivel de calle, inclinada y con tu marcador en el tercio
  inferior. Son dos cámaras distintas a propósito: una sola no puede servir para
  las dos cosas.
- Tarjeta del **siguiente giro** con flecha, calle y metros que faltan, más la
  distancia y el tiempo restantes. **PARAR** para terminar.
- **Recálculo automático** al salirse de la ruta.
- La pantalla no se apaga mientras la app esté en primer plano.

**Panel `DIAG`**

Mide en el dispositivo real lo que no se puede suponer: precisión e intervalo
del GPS, modo standalone, bloqueo de pantalla, voces de síntesis disponibles y
brújula. Existe porque varias decisiones del proyecto dependían de datos que
solo el iPhone podía dar.

## Arrancar

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>. Añade `?lab` para los controles de afinado del
estilo (saltos entre ciudades, barrido de zoom, lectura de zoom/pitch/bearing).

El repo es un **workspace de npm**: se instala y se ejecuta desde la raíz, no
desde `app/`. Si el 5173 está ocupado, `PORT=5174 npm run dev`.

En `localhost` la API de Stadia funciona **sin clave** (con límite de peticiones
más estricto), así que no hace falta configurar nada para desarrollar.

## Probar

```bash
npm test
```

39 tests, todos sobre lógica pura. Cubren lo que no se puede comprobar sin
conducir: proyección sobre la ruta, siguiente maniobra, distancia y tiempo
restantes, detección de desvío y la máquina de estados del recálculo.

Las trazas GPS se **generan recorriendo una polilínea real** capturada de la API
(`app/src/services/routing.fixture.ts`). Tres casos que importan:

| Caso | Qué comprueba |
|---|---|
| Recorrido limpio | Las maniobras avanzan en orden y nunca se declara desvío |
| Desvío deliberado | El desvío salta a la tercera lectura, y **no antes** |
| Ruido de ±60 m | **No** debe declarar desvío: es el falso positivo que arruina estas apps |

## Estructura

```
style/build.mjs         generador del estilo  <- aquí se afina el look
style/cyberpunk.json    artefacto generado (35 capas), portable a cualquier MapLibre
assets/lib/poi-icons.mjs glifos de POI y qué negocio lleva cada uno
assets/lib/raster.mjs   rasterizador RGBA y codificador PNG, sin dependencias
assets/make-sprite.mjs  dibuja el sprite de POI (1x y 2x)
assets/make-icons.mjs   dibuja los iconos de la PWA

app/src/
  main.ts               cableado y máquina de estados de la interfaz
  map/map.ts            mapa, cámaras (seguimiento / previa / navegación), marcador
  hud/                  velocímetro y lecturas
  search/               buscador a pantalla completa
  route/                capa de la ruta en el mapa y tarjeta de resumen
  nav/                  navegación: lógica PURA + orquestador
    snap.ts             proyecta tu posición sobre la ruta
    progress.ts         siguiente maniobra, distancia y tiempo restantes
    off-route.ts        detección de desvío
    session.ts          máquina de estados (el único impuro de la carpeta)
    maneuver-card.ts    tarjeta del siguiente giro
  services/
    geolocation.ts      único dueño del watchPosition
    compass.ts          brújula del dispositivo
    heading.ts          quién manda el rumbo: GPS en marcha, brújula parado
    keep-awake.ts       que la pantalla no se apague
    stadia.ts           cliente HTTP común
    geocoding.ts        autocompletado de destinos
    routing.ts          rutas de Valhalla y decodificador de polilínea
    geo-math.ts         haversine y formato de distancias y tiempos
  diag/probe.ts         panel de diagnóstico

docs/hallazgos.md       trampas encontradas y por qué el código es como es
docs/estado.md          estado del proyecto y qué queda
```

La carpeta `nav/` está separada en lógica pura y orquestador a propósito: es lo
único que permite probar el comportamiento sin salir a la carretera.

## Afinar la estética

`style/cyberpunk.json` **no se edita a mano**: lo genera `style/build.mjs` a
partir de una paleta y una tabla de clases de carretera. Edita `build.mjs`,
guarda, y el mapa se actualiza solo sin recargar la página ni perder la cámara
(un plugin de Vite re-ejecuta el generador y el HMR reaplica el estilo).

El neón sale de apilar tres capas de línea por clase de carretera:

| estrato | ancho | `line-blur` | opacidad | papel |
|---|---|---|---|---|
| `glow` | x3 a x5.5 | alto | 0.10 - 0.45 | el halo de color |
| `mid`  | x1.7 | bajo | 0.40 | el cuerpo |
| `core` | x1 | 0 | 1 | el filamento aclarado |

Las dos perillas que más importan:

- **`coreLighten`** por clase. Pasar de ~0.4 mata el color y todo se vuelve
  blanco: el mapa deja de parecer neón y parece un mapa normal con calles claras.
- **Que las calles menores retrocedan.** Son el 80% de las líneas; si compiten,
  el neón de las vías importantes no se ve.

Los edificios salen en rojo por una interacción del shader que se descubrió
investigando un bug y se decidió conservar. Está explicado en
[docs/hallazgos.md](docs/hallazgos.md) §1, junto con cómo devolverlos al azul.

## Iconos de POI

Cada establecimiento lleva el icono de su categoría: cruz de medpoint en
farmacias y centros de salud, copa en bares, vaso de fideos en restaurantes,
caja en tiendas, flecha en paradas y estaciones, torres en colegios y oficinas.

Todo sale de `assets/lib/poi-icons.mjs`, que es la **fuente única de verdad**:

- `ICONS` = los 15 glifos, dibujados como código (sin SVG ni dependencias).
- `MEMBERS` = qué tipos de establecimiento lleva cada icono, con etiquetas
  `class` del esquema OpenMapTiles (130 tipos mapeados).

De ese archivo tiran los dos generadores, así que no pueden desincronizarse:
`assets/make-sprite.mjs` dibuja el sprite, y `style/build.mjs` construye la
expresión `icon-image` del estilo.

```bash
npm run sprite
```

**Para cambiar qué icono lleva un tipo de negocio**, mueve su etiqueta de una
lista a otra en `MEMBERS`. Una etiqueta en dos listas lanza un error al generar,
porque una expresión `match` de MapLibre rechaza etiquetas repetidas y eso
rompería el estilo entero al cargar.

**Para añadir un icono nuevo**, mete su glifo en `ICONS` y su lista en
`MEMBERS`. Se dibuja en una caja de 24x24 con `segment`, `polyline`, `polygon` y
`circle`; el generador ya pinta la placa y el borde antes de llamar al glifo.

Las flechas de maniobra son aparte (`nav/maneuver-card.ts`) y son SVG en línea,
porque van en el HUD y no en el mapa: no necesitan sprite ni glifos SDF.

Todos los glifos son originales, en el lenguaje visual del juego. **No** son los
assets de Cyberpunk 2077, que son propiedad de CD Projekt Red.

## Servicios

| Qué | Quién | Clave |
|---|---|---|
| Teselas vectoriales | [OpenFreeMap](https://openfreemap.org) (esquema OpenMapTiles) | No necesita |
| Autocompletado de destinos | Stadia Maps (Pelias) | Por dominio |
| Rutas en coche | Stadia Maps (Valhalla) | Por dominio |

**No hay ninguna clave de API en el código.** Stadia autentica por dominio:
valida las cabeceras `Origin` y `Referer` que el navegador manda solo. Basta con
dar de alta el dominio en el panel de Stadia, en *Authentication Configuration*:

- Son **dos campos separados por un punto**, no una URL: `games-map` en
  *Subdomain* y `ggigelmo.workers.dev` en *Domain*. Sin `https://`.
- **El alta tarda un par de minutos en propagar.** Justo después de guardarla la
  API sigue devolviendo `401 No valid authentication provided`. No merece la pena
  depurar en esa ventana.

Consecuencia a tener en cuenta: si alguna vez se pone `Referrer-Policy:
no-referrer` en el sitio, la autenticación deja de funcionar.

Valhalla devuelve las instrucciones **ya redactadas en español**, incluidas tres
variantes pensadas para leerse en voz alta. Es lo que hará fácil añadir la voz.

## Desplegar (Cloudflare Workers)

Ya está configurado. En **Workers & Pages → Create → Import a repository**, con
`ggigelmo/games-map`:

| Campo | Valor |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

El build corre desde la raíz del repo, no desde `app/`. Eso funciona porque el
`package.json` de la raíz declara `app` como **workspace** de npm: `npm install`
instala las dependencias del workspace y `npm run build` delega en él. También
evita que el build dependa de subir un nivel para encontrar `style/`.

`wrangler.jsonc` define un Worker **sin código**, solo assets, así que no lleva
`main`. Validar la configuración sin desplegar ni necesitar credenciales:

```bash
npm run build && npx wrangler deploy --dry-run
```

Para desplegar desde tu máquina en vez de por Git (requiere `npx wrangler login`
una vez):

```bash
npm run deploy
```

El fallback de una sola página lo da `not_found_handling` en `wrangler.jsonc`.
`app/public/_headers` existe porque hace algo que `wrangler.jsonc` no: fijar el
`Content-Type` del manifest.

> Al generar el lockfile, hazlo **en limpio**: un `npm install` parcial en
> Windows registra solo los binarios nativos de esa plataforma y el build de
> Linux falla con `Cannot find module @rollup/rollup-linux-x64-gnu`. Detalle y
> comprobación de una línea en [docs/hallazgos.md](docs/hallazgos.md) §8.

## Instalar en el iPhone

Abrir la URL **en Safari** (no en Chrome), Compartir → Añadir a pantalla de
inicio. Arranca a pantalla completa, sin barra del navegador.

> Antes de nada, en el iPhone: Ajustes → Privacidad y seguridad → Localización
> → Safari → **Ubicación precisa activada**. Sin eso el GPS devuelve una posición
> con 3-9 km de error y solo la refresca cada 15 minutos, **sin dar ningún
> error**. El panel `DIAG` lo detecta y lo dice.

Lo que conviene leer en `DIAG` la primera vez:

| Lectura | Bien | Mal |
|---|---|---|
| Precisión | ≤ 30 m | Kilómetros → Ubicación precisa desactivada |
| Intervalo entre fixes | ≤ 5 s | Minutos → misma causa |
| Pantalla encendida | `API NATIVA` o `VIDEO` | `NO ACTIVA` |
| Brújula | Pulsa **ACTIVAR BRÚJULA**; luego muestra el rumbo en vivo | `PERMISO DENEGADO` |
| Voces (es / total) | ≥ 1 en español | 0 → la app no podrá hablar |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente del estilo |
| `npm test` | Tests de la lógica pura |
| `npm run build` | Typecheck y build de producción |
| `npm run style` | Regenera `style/cyberpunk.json` |
| `npm run sprite` | Regenera el sprite de POI y el estilo |
| `npm run icons` | Regenera los iconos de la PWA |
| `npm run deploy` | Build y despliegue con wrangler |

## Documentación

- **[docs/hallazgos.md](docs/hallazgos.md)** — las once trampas que costaron
  tiempo, con la causa y por qué el código es como es. Se lee antes de "limpiar"
  cualquier cosa que parezca rara.
- **[docs/estado.md](docs/estado.md)** — qué está hecho, qué queda y qué
  decisiones se tomaron por el camino.
