# Estado del proyecto

Qué está hecho, qué queda, y las decisiones que dieron forma a esto. Para las
trampas técnicas concretas, ver [hallazgos.md](hallazgos.md).

## Restricciones que lo condicionan todo

- iPhone, **sin Mac** y **sin pagar Apple Developer Program**.
- Vale una web desplegada, no hace falta una app nativa.
- **CarPlay descartado**: requiere un *entitlement* que Apple concede con
  cuentagotas, y además la interfaz la dibuja Apple con sus plantillas, así que
  la estética —que es el punto del proyecto— no se vería.

## Decisiones que dan forma al proyecto

**El SDK de Google Maps no sirve.** Su restilizado solo permite cambiar colores
de categorías predefinidas: sin fuentes propias, sin texturas, sin sprites. Se
usa **MapLibre**, donde el estilo es un JSON propio con control total. Esa
decisión es la que hace posible el proyecto entero.

**PWA en vez de app nativa.** Elimina React, Expo, el Mac y la cuota de Apple.
Añadida a la pantalla de inicio del iPhone arranca a pantalla completa y se
comporta como una app.

**Sin framework de interfaz.** MapLibre es imperativo y el HUD son unos cuantos
paneles. TypeScript a secas evita por completo la curva de React.

**Cloudflare Workers, no Pages.** Pages está en modo mantenimiento. Se eligió
Workers pensando que haría falta un proxy para esconder la clave de la API…
y luego resultó que no (ver abajo). La elección sigue siendo correcta, pero el
motivo original ya no aplica.

**No hay proxy ni claves en el código.** Stadia Maps autentica por dominio,
validando las cabeceras que el navegador manda solo. Se descubrió leyendo su
documentación *y probándolo contra la API*, y ahorró un subsistema entero.

## Hecho

| Fase | Qué | Verificado |
|---|---|---|
| 0 | Estilo Cyberpunk (35 capas), HUD, iconos PWA, panel DIAG | Navegador |
| 0b | Que una PWA en iOS aguante: GPS y permisos en modo standalone | **iPhone real** |
| 0.5 | Control táctil: el mapa no respondía al dedo ni seguía al usuario | Navegador |
| — | Iconos de POI por tipo de establecimiento (130 categorías) | Navegador |
| — | Brújula: el mapa gira contigo también estando parado | Parcial |
| 2 | Buscar destino y trazar ruta | **Producción** |
| 3a | Modo navegación, IR/PARAR, tarjeta de maniobras, pantalla encendida | Navegador |
| 3b | Recálculo automático al salirse | Navegador + API real |

### El cortafuegos: fase 0b

Era el único riesgo capaz de invalidar el enfoque entero, y por eso se probó
antes que nada. Medido en el iPhone real con la app **añadida a la pantalla de
inicio**, que es donde vivía el riesgo:

| Lectura | Resultado |
|---|---|
| Precisión | ±5 a ±30 m |
| Intervalo entre fixes | < 5 s |
| Permiso de ubicación en standalone | Concedido |

Existe un bug histórico de iOS por el que, en PWAs instaladas, el diálogo de
permiso no aparece y la llamada **tampoco hace timeout**. No se manifestó. El
camino PWA aguanta.

## Qué queda

**Voz** (lo que faltaba de la fase 3b). Valhalla ya devuelve tres variantes de
instrucción redactadas en español —aviso anticipado, justo antes, y después— así
que el trabajo no es *qué* decir sino *cuándo*. Dos cosas a tener en cuenta: en
iOS el primer `speak()` debe salir de un gesto del usuario (el botón **IR** es
el sitio natural), y `verbal_multi_cue: true` significa que la instrucción ya
encadena la maniobra siguiente y añadirle nada la duplicaría.

**Tipografía propia del mapa.** Hoy las etiquetas van en Noto Sans: MapLibre
necesita glifos SDF empaquetados, no TTF, y el proveedor de teselas solo sirve
esa fuente. Hay que generarlos con MapLibre Font Maker y alojarlos. El HUD sí
usa ya la tipografía del juego, porque es HTML y no pasa por ahí
([hallazgos.md](hallazgos.md) §3).

**Pulido del visor.** Suavizado de posición entre lecturas y anillo de precisión.

**Mapas offline.** Un extracto regional en `.pmtiles` con Protomaps. En zonas
con mala cobertura importa más de lo que parece.

## Lo que no está verificado

Conviene tenerlo presente antes de fiarse de algo:

- **La cámara de navegación** (zoom, inclinación, desplazamiento del marcador)
  no se ha visto funcionando. Comprobar animaciones de cámara requiere frames
  que el entorno de pruebas automatizado no da.
- **La línea de la ruta tras un recálculo** tampoco: misma causa.
- **Nada de la conducción real.** Los tests usan trazas sintéticas generadas
  sobre una polilínea real, que es lo más cerca que se puede estar sin coche.

### Números elegidos a ojo

Tienen la forma correcta, pero las constantes habrá que ajustarlas usándolo:

| Constante | Dónde | Qué pasa si está mal |
|---|---|---|
| 32 px de intención de arrastre | `map/map.ts` | Bajo: el seguimiento se apaga con un roce. Alto: cuesta soltar la cámara |
| `max(35, precisión × 2.5)` | `nav/off-route.ts` | Bajo: FUERA DE RUTA yendo bien. Alto: tarda en darse cuenta |
| 15 s entre recálculos | `nav/session.ts` | Bajo: peticiones de más. Alto: tarda en corregir |
| 1,5 m/s para fiarse del GPS | `services/heading.ts` | Decide cuándo manda la brújula y cuándo el GPS |

## Riesgos estructurales

**Sin navegación en segundo plano.** Una PWA no puede seguir tu posición con la
pantalla apagada. Para navegar en coche es aceptable, porque la pantalla está
encendida, pero es un límite del enfoque, no un bug que se pueda arreglar.

**Precisión del GPS en ciudad.** Los cañones urbanos degradan la señal. Es la
razón de que el umbral de desvío esté atado a la precisión de cada lectura y no
sea un número fijo.

**Plan gratuito de Stadia, no comercial.** Suficiente para uso personal
(200.000 créditos/mes ≈ 10.000 búsquedas). Si algún día dejara de bastar, las
tres piezas de servidor son open source y se pueden autoalojar sin tocar la app.
