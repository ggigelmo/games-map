# Hallazgos

Trampas encontradas durante el desarrollo. Estan aqui porque cada una explica
por que una parte del codigo es como es, y porque son exactamente el tipo de
cosa que se vuelve a romper si alguien "limpia" el codigo sin saberlo.

## 1. La luz cian tine los edificios de ROJO, y aqui es a proposito

**Descubrimiento:** con `light.color = '#00f0ff'` (cian) los edificios en
`fill-extrusion` salian granate, aunque `fill-extrusion-color` estaba puesto en
azules oscuros (`#090d1a` a `#4f657a`) y el estilo validaba sin un solo error.

**Causa:** el shader de `fill-extrusion` acota el color por abajo con
`0.3 * (1 - colorDeLuz)`. Con luz cian `(0, 1, 1)`, ese `1 - color` da
`(1, 0, 0)`, asi que el canal **rojo** queda con un minimo de 0.3 mientras verde
y azul se quedan a cero. De ahi el granate. El efecto es de dos tonos: caras en
sombra en rojo, caras iluminadas con tinte cian, algo que no se reproduce con un
color plano.

**Estado: es una decision, no un bug.** Se descubrio investigando por que los
edificios no salian azules, y el resultado gusto, asi que se conservo. El
`light` de `style/build.mjs` lleva un comentario avisando de que la luz cian es
deliberada.

**Si alguna vez se quieren edificios azules:** poner la luz en `#ffffff`. Los
colores de `fill-extrusion-color` ya estan en azules, asi que aparecen solos. Lo
que **no** funciona es intentar tenirlos cambiando el color de la luz: da el
complementario.

## 2. MapLibre exige que la URL del sprite sea ABSOLUTA

A diferencia de las URLs de teselas y de glifos, que acepta relativas, un
`sprite: '/sprites/night-city'` se rechaza con:

> Invalid sprite URL "/sprites/night-city", must be absolute.

Meter el dominio en el JSON lo ataria al entorno y dejaria de valer a la vez en
localhost y en Netlify. Por eso el estilo guarda la ruta relativa a la raiz y
`resolveSprite()` en `app/src/main.ts` la resuelve contra `location.origin`
antes de entregar el estilo al mapa. Se aplica igual en el arranque y en el HMR.

## 3. MapLibre no consume TTF: necesita glifos SDF

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

## 4. MapLibre mide el contenedor una sola vez

`new maplibregl.Map()` lee el tamano del contenedor al construirse. Si en ese
momento mide 0 (pestana en segundo plano, arranque de una PWA, rotacion de
pantalla, aparicion del teclado), el canvas se queda en su tamano de emergencia
de 400x300 y no vuelve a pintar nunca.

De ahi el `ResizeObserver` en `app/src/map/map.ts`. No es defensa preventiva: se
reprodujo el fallo con el contenedor a 0x0.

## 5. MapLibre no carga el estilo si `requestAnimationFrame` no dispara

La carga del estilo esta diferida a un frame. En una pestana con
`document.hidden === true`, rAF no dispara nunca (medido: 0 frames en 2 s,
mientras `setTimeout` seguia corriendo a ~1/s), asi que el estilo se queda a
medias: el objeto `Map` existe, pero `style.stylesheet` nunca se asigna,
`getStyle()` devuelve `null` y **no se emite ningun evento de error**.

Sintoma: mapa en negro, cero peticiones de teselas, consola limpia.

Para verificar en un entorno asi, lo que funciona es dejar cargar la pagina y
esperar de forma pasiva. Lo que **no** hay que hacer es sustituir
`requestAnimationFrame` por una bomba de `MessageChannel`: MapLibre reprograma
un frame dentro de cada frame, el `postMessage` se realimenta y congela el
renderer. Llamar `triggerRepaint()` en bucle tambien acaba atascandolo.

Nada de esto afecta a la app en un movil real; es solo para automatizar
capturas.

## 6. Riesgos de iOS pendientes de medir en el dispositivo

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

## 7. Los iconos son originales, no los del juego

Los glifos de `assets/lib/poi-icons.mjs` estan dibujados en el lenguaje visual
de Cyberpunk 2077 (placa de esquinas cortadas, borde cian, glifo grueso con
halo), pero son originales. Los assets del juego son propiedad de CD Projekt Red
y no se reproducen aqui.

## 8. Un lockfile generado en Windows rompe el build en Linux

**Sintoma:** el build de Cloudflare instalaba bien y `tsc` pasaba, pero
`vite build` moria con:

> Cannot find module @rollup/rollup-linux-x64-gnu

**Causa:** rollup y esbuild traen sus binarios nativos como
`optionalDependencies`, una por plataforma. El `package-lock.json` se genero en
Windows **encima de un `node_modules` que ya existia** de una instalacion previa
sin workspaces, asi que npm solo registro las variantes que de verdad tenia
instaladas: 2 de rollup, las dos `win32`. Las 52 de esbuild si estaban, lo que
hace el fallo mas confuso todavia. Es el bug npm/cli#4828.

**Solucion:** regenerar el lockfile en limpio, que es justo lo que dice el
mensaje de error.

```bash
rm -rf node_modules app/node_modules package-lock.json
npm install
```

El lockfile bueno tiene ~25 variantes de `@rollup/rollup-*`, entre ellas
`linux-x64-gnu`, y hoistea las dependencias a `node_modules/` de la raiz en vez
de dejarlas anidadas en `app/node_modules/`.

**Como comprobarlo antes de subir:**

```bash
node -e "const k=Object.keys(require('./package-lock.json').packages); \
console.log(k.filter(x=>x.includes('@rollup/rollup-')).length)"
```

Si sale 2, el lockfile esta mal. Si sale ~25, esta bien.

## 9. `display: flex` anula el atributo `hidden`

**Sintoma:** el buscador aparecia abierto nada mas cargar la app, y la tarjeta
de ruta se veia sin haber trazado ninguna, pese a que el codigo hacia
`el.hidden = true` y leer `el.hidden` devolvia `true`.

**Causa:** `hidden` no es magia del DOM. El navegador lo implementa con una
regla `[hidden] { display: none }` en **su** hoja de estilos, que tiene menos
prioridad que cualquier regla de la nuestra. En cuanto `.search` y `.route-card`
declararon `display: flex`, `hidden` dejo de tener efecto visual.

Lo traicionero es que la propiedad sigue diciendo `true`, asi que comprobarlo
desde la consola no lo detecta. Solo se ve mirando la pantalla, o preguntando
por `getComputedStyle(el).display`.

**Solucion**, una linea en `app/src/style.css`, que cierra la categoria entera
en vez de parchear los dos casos:

```css
[hidden] { display: none !important; }
```

## 10. La brujula: dos APIs distintas y un sentido de giro invertido

El evento `deviceorientation` no da un rumbo de brujula directamente, y en iOS
va por otro camino que en el resto:

- **iOS** expone `event.webkitCompassHeading`: ya es un rumbo respecto al norte
  y en sentido horario. Se usa tal cual.
- **El estandar** da `event.alpha`, que mide en sentido **ANTIhorario**. Hay que
  invertirlo: `(360 - alpha) % 360`. Sin eso el mapa gira al reves, que es un
  fallo sutil porque a simple vista parece que "funciona".
- `alpha` solo sirve si `event.absolute` es true; si no, el origen es arbitrario
  y el valor no significa nada.

Ademas, **iOS exige pedir permiso con `DeviceOrientationEvent.requestPermission()`
desde un gesto del usuario**. Llamarlo fuera de un manejador de click lanza, no
pregunta. Por eso el permiso se concede desde un boton del panel `DIAG` y no al
arrancar la app.

Dos filtros que no son opcionales: una **banda muerta** de un par de grados,
porque el ruido del magnetometro hace vibrar el mapa con el movil quieto encima
de la mesa; y un **limite de frecuencia**, porque el evento llega decenas de
veces por segundo y girar la camara en cada uno la deja temblando.

La regla de quien manda (GPS en marcha, brujula parado) vive en
`app/src/services/heading.ts` como logica pura y con tests, porque comprobarla
de verdad exigiria moverse y girar un movil.

## 11. Usar `0` como centinela de "nunca" choca con un tiempo legitimo

El freno entre recalculos guardaba en `lastRerouteAt` el instante del ultimo
intento, y usaba `0` para decir "todavia ninguno":

```ts
if (this.lastRerouteAt !== 0 && now - this.lastRerouteAt < MIN_REROUTE_MS) return;
```

Pero **cero es una marca de tiempo perfectamente valida**: es justo lo que
devuelve `performance.now()` recien arrancado. Cuando el primer recalculo caia
en ese instante, la condicion lo leia como "nunca he recalculado" y el freno
dejaba de existir: una peticion a la API por cada lectura del GPS.

Se manifesto con relojes falsos en un test, que empiezan en 0 por definicion, y
en produccion habria aparecido solo de vez en cuando, en la primera ruta de la
sesion. La solucion es que el valor "nunca" no pueda confundirse con un tiempo:

```ts
private lastRerouteAt = -Infinity;
// y la condicion se queda en una sola comparacion
if (now - this.lastRerouteAt < MIN_REROUTE_MS) return;
```
