# Night City Maps

Navegador GPS con la estetica de Cyberpunk 2077. PWA: se despliega como web y se
anade a la pantalla de inicio del iPhone, donde arranca a pantalla completa sin
barra de Safari. Sin App Store, sin Apple Developer Program, sin Mac.

## Arrancar

```bash
npm --prefix app install
npm --prefix app run dev
```

Abre <http://localhost:5173>. Anade `?lab` para los controles de afinado del
estilo (saltos entre ciudades, barrido de zoom, lectura de zoom/pitch/bearing).

## Afinar la estetica

`style/cyberpunk.json` **no se edita a mano**: lo genera `style/build.mjs` a
partir de una paleta y una tabla de clases de carretera. Edita `build.mjs`,
guarda, y el mapa se actualiza solo sin recargar la pagina ni perder la camara
(un plugin de Vite re-ejecuta el generador y el HMR reaplica el estilo).

El neon sale de apilar tres capas de linea por clase de carretera:

| estrato | ancho | `line-blur` | opacidad | papel |
|---|---|---|---|---|
| `glow` | x3 a x5.5 | alto | 0.10 - 0.45 | el halo de color |
| `mid`  | x1.7 | bajo | 0.40 | el cuerpo |
| `core` | x1 | 0 | 1 | el filamento aclarado |

Las dos perillas que mas importan:

- **`coreLighten`** por clase. Pasar de ~0.4 mata el color y todo se vuelve
  blanco: el mapa deja de parecer neon y parece un mapa normal con calles claras.
- **Que las calles menores retrocedan.** Son el 80% de las lineas; si compiten,
  el neon de las vias importantes no se ve.

## Estructura

```
style/build.mjs      generador del estilo  <- aqui se afina el look
style/cyberpunk.json artefacto generado, portable a cualquier MapLibre
assets/make-icons.mjs genera los PNG de la PWA sin dependencias
app/                 la app (Vite + TypeScript + MapLibre GL JS)
  src/map/           mapa, camara que persigue, marcador del jugador
  src/hud/           velocimetro y lecturas
  src/diag/          panel de diagnostico + dueno del watchPosition
  src/nav/           (fase 3) bucle de navegacion
docs/hallazgos.md    trampas encontradas y por que el codigo es como es
```

## Iconos de POI

Cada establecimiento lleva el icono de su categoria: cruz de medpoint en
farmacias y centros de salud, copa en bares, vaso de fideos en restaurantes,
caja en tiendas, flecha en paradas y estaciones, torres en colegios y oficinas.

Todo sale de `assets/lib/poi-icons.mjs`, que es la **fuente unica de verdad**:

- `ICONS` = los 15 glifos, dibujados como codigo (sin SVG ni dependencias).
- `MEMBERS` = que tipos de establecimiento lleva cada icono, con etiquetas
  `class` del esquema OpenMapTiles (130 tipos mapeados).

De ese archivo tiran los dos generadores, asi que no pueden desincronizarse:
`assets/make-sprite.mjs` dibuja el sprite, y `style/build.mjs` construye la
expresion `icon-image` del estilo.

```bash
node assets/make-sprite.mjs && node style/build.mjs
```

**Para cambiar que icono lleva un tipo de negocio**, mueve su etiqueta de una
lista a otra en `MEMBERS`. Una etiqueta en dos listas lanza un error al generar,
porque una expresion `match` de MapLibre rechaza etiquetas repetidas y eso
romperia el estilo entero al cargar.

**Para anadir un icono nuevo**, mete su glifo en `ICONS` y su lista en
`MEMBERS`. Se dibuja en una caja de 24x24 con `segment`, `polyline`, `polygon` y
`circle`; el generador ya pinta la placa y el borde antes de llamar al glifo.

Los glifos son originales, en el lenguaje visual del juego. No son los assets de
Cyberpunk 2077, que son de CD Projekt Red.

## Servicios

Teselas de [OpenFreeMap](https://openfreemap.org) (esquema OpenMapTiles, sin API
key). Al pasar a fase 2 hara falta geocodificacion y rutas: Stadia Maps sirve las
tres cosas con una clave gratuita y el mismo esquema de teselas, asi que cambiar
de proveedor es cambiar dos URLs en `build.mjs`.

## Desplegar (Cloudflare Pages)

En el panel de Cloudflare: **Workers & Pages -> Create -> Pages -> Connect to
Git**, eliges `ggigelmo/games-map` y rellenas:

| Campo | Valor |
|---|---|
| Framework preset | `Vite` (o `None`) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `app` |

Nada mas. La version de Node la fija `app/.nvmrc`, y `app/public/_redirects` y
`app/public/_headers` los copia Vite a `dist/`, que es donde Cloudflare los
busca.

> **Si el build falla por no encontrar `../style/build.mjs`**: significa que
> Cloudflare no clono el repo completo. Entonces deja *Root directory* vacio y
> usa `npm ci --prefix app && npm --prefix app run build` como build command,
> con `app/dist` como output directory.

Comprobar en local antes de subir:

```bash
npm --prefix app run build && npm --prefix app run preview
```

Cloudflare tiene Pages en modo mantenimiento y recomienda **Workers con static
assets** para proyectos nuevos. Para un sitio estatico Pages sigue funcionando y
recibiendo arreglos, pero el proxy que hara falta en la fase 2 para esconder la
clave de Stadia vive mejor en un Worker. Ese es el momento de migrar.

## Instalar en el iPhone

Abrir la URL **en Safari** (no en Chrome), Compartir -> Anadir a pantalla de
inicio. Arranca a pantalla completa, sin barra del navegador.

> Antes de nada, en el iPhone: Ajustes -> Privacidad y seguridad -> Localizacion
> -> Safari -> **Ubicacion precisa activada**. Sin eso el GPS devuelve una
> posicion con 3-9 km de error y solo la refresca cada 15 minutos, sin dar ningun
> error. El panel `DIAG` de la app lo detecta y lo dice.
