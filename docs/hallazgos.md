# Hallazgos

Trampas encontradas durante la fase 0. Estan aqui porque cada una explica por
que una parte del codigo es como es, y porque son exactamente el tipo de cosa
que se vuelve a romper si alguien "limpia" el codigo sin saberlo.

## 1. Colorear la luz tine los edificios del color COMPLEMENTARIO

**Sintoma:** con `light.color = '#00f0ff'` (cian) los edificios en
`fill-extrusion` salian granate, aunque `fill-extrusion-color` estaba puesto en
azules oscuros (`#090d1a` a `#4f657a`) y el estilo validaba sin un solo error.

**Causa:** el shader de `fill-extrusion` acota el color por abajo con
`0.3 * (1 - colorDeLuz)`. Con luz cian `(0, 1, 1)`, ese `1 - color` da
`(1, 0, 0)`, asi que el canal **rojo** queda con un minimo de 0.3 mientras verde
y azul se quedan a cero. De ahi el granate.

**Regla:** el tinte de los edificios va en `fill-extrusion-color`. La luz se
queda neutra (`#ffffff`) y solo se usa `intensity` para el modelado. Bajar
`intensity` oscurece el suelo, que es lo que hace que el neon muerda.

## 2. MapLibre no consume TTF: necesita glifos SDF

Las fuentes del mapa no son CSS. MapLibre pide los glifos como campos de
distancia firmada empaquetados en `.pbf` por rango Unicode, desde la URL de la
propiedad `glyphs`.

OpenFreeMap solo sirve **Noto Sans** (comprobado: `Rajdhani Bold`,
`Chakra Petch Bold`, `Orbitron Bold`, `Share Tech Mono Regular` y
`Roboto Mono Regular` dan todas 404). Para tipografia propia hay que generar los
glifos con [MapLibre Font Maker](https://maplibre.org/font-maker/) (app web, 256
archivos por fuente), alojar la carpeta en algo servido por HTTP y apuntar ahi
`glyphs`.

**Importante:** esto solo afecta a las etiquetas **dentro** del mapa. El HUD es
HTML/CSS normal, asi que ahi Rajdhani y Share Tech Mono entran por Google Fonts
desde el primer dia. Es la razon de que la app ya se vea Cyberpunk aunque las
etiquetas del mapa sigan en Noto Sans.

## 3. MapLibre mide el contenedor una sola vez

`new maplibregl.Map()` lee el tamano del contenedor al construirse. Si en ese
momento mide 0 (pestana en segundo plano, arranque de una PWA, rotacion de
pantalla, aparicion del teclado), el canvas se queda en su tamano de emergencia
de 400x300 y no vuelve a pintar nunca.

De ahi el `ResizeObserver` en `app/src/map/map.ts`. No es defensa preventiva: se
reprodujo el fallo con el contenedor a 0x0.

## 4. MapLibre no carga el estilo si `requestAnimationFrame` no dispara

La carga del estilo esta diferida a un frame. En una pestana con
`document.hidden === true`, rAF no dispara nunca (medido: 0 frames en 2 s,
mientras `setTimeout` seguia corriendo a ~1/s), asi que el estilo se queda a
medias: el objeto `Map` existe, pero `style.stylesheet` nunca se asigna,
`getStyle()` devuelve `null` y **no se emite ningun evento de error**.

Sintoma: mapa en negro, cero peticiones de teselas, consola limpia.

Para verificar en un entorno asi hay que bombear frames a mano. Lo que funciona
es `map.triggerRepaint()` en un bucle de timers. Lo que **no** hay que hacer es
sustituir `requestAnimationFrame` por una bomba de `MessageChannel` sin tope:
MapLibre reprograma un frame dentro de cada frame, el `postMessage` se
realimenta y congela el renderer.

Nada de esto afecta a la app en un movil real; es solo para automatizar capturas.

## 5. Riesgos de iOS pendientes de medir en el dispositivo

El panel `DIAG` existe para responderlos con datos, no con suposiciones:

- **Ubicacion precisa desactivada para Safari** -> `watchPosition` devuelve
  precision de 3-9 km y solo refresca cada ~15 min, sin dar ningun error. Se
  detecta por `accuracy` y por el intervalo entre fixes.
- **Permiso de ubicacion en modo standalone** -> hay un bug historico por el que
  el dialogo no aparece y la llamada **no hace timeout nunca**. Por eso el panel
  lleva su propio temporizador de 12 s en vez de confiar en el de la API.
- **Screen Wake Lock** -> soportado en Safari iOS desde 16.4, pero estuvo roto
  dentro de PWAs instaladas hasta **iOS 18.4**. Sin el, la pantalla se apaga a
  mitad de trayecto.
- **Sintesis de voz** -> iOS exige que el primer `speak()` venga de un gesto del
  usuario. De ahi que la prueba de voz sea un boton y no automatica.
