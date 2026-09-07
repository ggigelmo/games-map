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

## Servicios

Teselas de [OpenFreeMap](https://openfreemap.org) (esquema OpenMapTiles, sin API
key). Al pasar a fase 2 hara falta geocodificacion y rutas: Stadia Maps sirve las
tres cosas con una clave gratuita y el mismo esquema de teselas, asi que cambiar
de proveedor es cambiar dos URLs en `build.mjs`.

## Desplegar

```bash
npm --prefix app run build
```

Con `netlify.toml` ya configurado, conectar el repo a Netlify basta. Despues, en
el iPhone: abrir la URL **en Safari**, Compartir -> Anadir a pantalla de inicio.

> Antes de nada, en el iPhone: Ajustes -> Privacidad y seguridad -> Localizacion
> -> Safari -> **Ubicacion precisa activada**. Sin eso el GPS devuelve una
> posicion con 3-9 km de error y solo la refresca cada 15 minutos, sin dar ningun
> error. El panel `DIAG` de la app lo detecta y lo dice.
