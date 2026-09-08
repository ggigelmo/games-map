# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Navegador GPS con estética Cyberpunk 2077, como PWA. Vite + TypeScript vanilla +
MapLibre GL JS. Sin framework de interfaz.

El **README** cubre qué hace la app y su estructura de carpetas.
**`docs/estado.md`** cubre el estado por fases y qué queda.
**`docs/hallazgos.md`** cubre las once trampas que costaron tiempo: **léelo antes
de "limpiar" cualquier cosa del código que parezca rara.** Casi todo lo raro
está así por una razón medida.

## Comandos

El repo es un **workspace de npm**: todo se ejecuta desde la raíz, no desde
`app/`.

```bash
npm install            # instala el workspace
npm run dev            # dev server con recarga en caliente del estilo
npm test               # los 39 tests
npm run build          # tsc --noEmit && vite build
npm run deploy         # build + wrangler deploy
```

**Un test suelto** — esto sí necesita `--prefix`, porque el argumento no
atraviesa la delegación del workspace (`npm test -- snap` desde la raíz no
encuentra nada):

```bash
npm --prefix app test -- session     # solo session.test.ts
npm --prefix app run test:watch      # modo watch
```

**Regenerar artefactos** tras tocar sus generadores:

```bash
npm run style    # style/cyberpunk.json
npm run sprite   # sprite de POI + estilo
npm run icons    # iconos de la PWA
```

Validar el despliegue sin credenciales: `npm run build && npx wrangler deploy --dry-run`

## Artefactos generados: no editar a mano

- **`style/cyberpunk.json`** lo genera `style/build.mjs` desde una paleta y una
  tabla de clases de carretera. Editar el JSON se pierde en la siguiente
  regeneración, y el dev server la dispara sola al guardar `build.mjs`.
- **`app/public/sprites/*`** y **`app/public/icons/*`** los generan los scripts
  de `assets/`.
- **`assets/lib/poi-icons.mjs`** es la **fuente única de verdad** de los iconos
  de POI: los glifos y qué tipo de negocio lleva cada uno. De ahí tiran el
  generador del sprite y el del estilo, así que no pueden desincronizarse. Una
  clase en dos listas lanza un error al generar, a propósito: un `match` de
  MapLibre rechaza etiquetas repetidas y eso rompería el estilo entero al cargar.

## Reglas de arquitectura que cruzan varios archivos

Estas no se deducen leyendo un archivo suelto, y romperlas produce fallos
silenciosos:

**`services/geolocation.ts` es el único dueño del `watchPosition`.** Nadie más
llama a la API de geolocalización. Antes el dueño era el panel de diagnóstico y
hubo que extraerlo; no lo devuelvas ahí ni abras un segundo watcher.

**`nav/` es lógica pura excepto `session.ts`.** `snap`, `progress` y `off-route`
no tocan red, DOM ni reloj más allá de recibir valores. `session.ts` es el único
orquestador impuro, y **no debe hacer peticiones HTTP**: decide *cuándo* hace
falta una ruta nueva y avisa por `onNeedsReroute`; quien llama a la API es
`main.ts`. Eso es lo que permite probar la máquina de estados entera con
lecturas sintéticas, y es la única forma de verificar esto sin conducir.

**El rumbo tiene una regla propia en `services/heading.ts`:** manda el GPS en
marcha (y 6 s después), la brújula el resto del tiempo. Con el móvil en un
soporte, hacia dónde apunta el aparato no es hacia dónde va el coche.

**`map/map.ts` tiene tres cámaras distintas** y mezclarlas fue el origen de un
bug real: seguimiento normal, `fitRoute()` para la vista previa, y
`startNavigation()` con zoom fijo, inclinada y con el marcador desplazado. La de
navegación **no se aleja nunca**, por diseño.

**`RouteLayer` se repinta sola** al oír `style.load`, porque `setStyle` borra
fuentes y capas añadidas a mano. No añadas coordinación para eso en `main.ts`.

**`main.ts` resuelve la URL del sprite contra `location.origin`** antes de
entregar el estilo al mapa. MapLibre exige que sea absoluta —al contrario que
las de teselas y glifos— y el estilo guarda una relativa para seguir siendo
portable entre localhost y producción.

**En `#ui` los `pointer-events` son opt-in** (`.panel`, `.btn`). Con la regla
anterior (`#ui > *`) un contenedor de maquetación invisible se tragaba todos los
gestos del mapa. No vuelvas a activarlos para todos los hijos.

**`[hidden] { display: none !important }`** está en `style.css` a propósito: el
navegador aplica `hidden` desde su propia hoja de estilos, que pierde contra
cualquier `display: flex` nuestro.

## Verificación: lo que este entorno no puede comprobar

En el navegador automatizado el documento está **oculto**, así que
`requestAnimationFrame` no dispara nunca. Consecuencias prácticas:

- **MapLibre no llega a cargar el estilo** (queda `isStyleLoaded() === false`,
  cero features, y **no emite ningún error**). No lo confundas con un bug del
  código.
- **`easeTo` no anima**, así que el comportamiento de cámara no se puede
  verificar. `jumpTo` sí es inmediato: úsalo para demostrar que el objeto mapa
  responde y no perseguir un fantasma.
- Bombear frames a mano acaba **congelando el renderer**. Ver
  `docs/hallazgos.md` §5 antes de intentarlo.

Por eso: **mira las capturas, no te fíes de leer propiedades.** El buscador
salía abierto en cada carga mientras `el.hidden` devolvía `true`; solo se vio
mirando la pantalla. Y cuando dibujes iconos o flechas, móntalos todos en una
galería y míralos: así aparecieron tres flechas de maniobra torcidas.

Los tests de navegación usan **trazas GPS sintéticas generadas recorriendo una
polilínea real** (`app/src/services/routing.fixture.ts`), incluido un caso de
ruido de ±60 m que **no** debe declarar desvío.

## Constantes elegidas a ojo

Tienen la forma correcta pero el valor está sin ajustar en carretera. Si algo se
siente mal al usarlo, es probable que esté aquí (tabla completa con síntomas en
`docs/estado.md`):

| Constante | Archivo |
|---|---|
| 32 px de intención de arrastre | `map/map.ts` |
| `max(35, precisión × 2.5)` de desvío | `nav/off-route.ts` |
| 15 s entre recálculos | `nav/session.ts` |
| 1,5 m/s para fiarse del rumbo del GPS | `services/heading.ts` |

## Servicios y claves

**No hay ninguna clave de API en el código, y no debe haberla.** Stadia Maps
autentica por dominio validando `Origin` y `Referer`. En `localhost` funciona
sin nada. Si aparece `401 No valid authentication provided` en producción, es
que falta dar de alta el dominio en su panel, no que falte una clave.

Las teselas son de OpenFreeMap y no necesitan autenticación.

## Convenciones

- **Comentarios de código y mensajes de commit: español sin acentos ni eñes.**
  Cadenas de interfaz y documentación: español con acentos. Es la convención de
  todo el repo; mantenla.
- Los comentarios explican **por qué**, no qué. Los que dicen "sin esto pasa X"
  documentan un fallo real ya observado: no los borres al refactorizar.
- Autoría de los commits: `garciaig <ggigelmo@gmail.com>` (coincide con la
  cuenta de GitHub del repo).
