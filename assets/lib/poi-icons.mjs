/**
 * Iconos de POI y su asignacion por tipo de establecimiento.
 *
 * Fuente unica de verdad: assets/make-sprite.mjs dibuja estos glifos en el
 * sprite, y style/build.mjs importa CLASS_TO_ICON para construir la expresion
 * `icon-image`. Si estuvieran en dos sitios, un icono nuevo se dibujaria sin
 * que ningun POI lo usara, o al contrario.
 *
 * Los glifos son originales, dibujados en el lenguaje visual de Cyberpunk 2077
 * (placa de esquinas cortadas, borde cian, glifo grueso con halo). NO son los
 * assets del juego, que son propiedad de CD Projekt Red.
 *
 * Las etiquetas son valores de `class` de la capa `poi` del esquema
 * OpenMapTiles, que es lo que sirven las teselas.
 */
import { chamfered, hex, rect } from './raster.mjs';

export const PLATE = hex('#070a14');
export const BORDER = hex('#00f0ff');
export const YELLOW = hex('#fcee0a');
export const CYAN = hex('#22f4ff');
export const DIM = hex('#4d8fa0');

/**
 * Cada glifo se dibuja en una caja logica de 24x24. El generador ya ha pintado
 * la placa y el borde antes de llamar; aqui solo va el simbolo.
 */
export const ICONS = {
  // --- comida: vaso de fideos con palillos, la comida callejera de Night City
  food: {
    tint: YELLOW,
    draw: (c, k) => {
      c.segment(11.2, 11.4, 14.8, 4.6, 1.3, k, { glow: 1.4 });
      c.segment(13.4, 11.4, 17.0, 5.8, 1.3, k, { glow: 1.4 });
      c.polygon([[8.2, 11.8], [15.8, 11.8], [14.5, 19.0], [9.5, 19.0]], k);
      c.segment(6.9, 11.0, 17.1, 11.0, 2.1, k, { glow: 1.6 });
    },
  },

  // --- bar: copa de martini
  bar: {
    tint: YELLOW,
    draw: (c, k) => {
      c.polygon([[6.8, 6.6], [17.2, 6.6], [12, 13.4]], k);
      c.segment(12, 12.8, 12, 18.2, 1.5, k);
      c.segment(9.0, 18.6, 15.0, 18.6, 1.8, k, { glow: 1.4 });
    },
  },

  // --- medpoint: cruz con halo
  medpoint: {
    tint: YELLOW,
    draw: (c, k) => {
      c.segment(12, 6.4, 12, 17.6, 3.4, k, { glow: 2.4 });
      c.segment(6.4, 12, 17.6, 12, 3.4, k, { glow: 2.4 });
    },
  },

  // --- fast travel: flecha sobre plataforma
  fastTravel: {
    tint: CYAN,
    draw: (c, k) => {
      c.segment(12, 17.2, 12, 9.8, 2.2, k, { glow: 2.0 });
      c.polygon([[12, 4.4], [16.8, 10.6], [7.2, 10.6]], k);
      c.segment(7.6, 19.4, 16.4, 19.4, 1.9, k, { glow: 1.6 });
    },
  },

  // --- landmark: rombo con nucleo
  landmark: {
    tint: CYAN,
    draw: (c, k) => {
      c.polyline([[12, 4.4], [19.6, 12], [12, 19.6], [4.4, 12]], 1.9, k, {
        close: true,
        glow: 2.0,
      });
      c.circle(12, 12, 2.3, k, { glow: 2.0 });
    },
  },

  // --- junk shop: caja de carga
  junk: {
    tint: YELLOW,
    draw: (c, k) => {
      c.polyline(rect(6.8, 9.4, 17.2, 18.8), 1.8, k, { close: true, glow: 1.6 });
      c.segment(5.6, 8.4, 18.4, 8.4, 2.2, k, { glow: 1.8 });
      c.segment(12, 9.4, 12, 18.8, 1.4, k);
    },
  },

  // --- ropa: camiseta
  clothes: {
    tint: YELLOW,
    draw: (c, k) => {
      c.polygon(
        [
          [9.2, 5.8], [14.8, 5.8], [18.6, 9.0], [16.2, 11.6],
          [16.2, 18.8], [7.8, 18.8], [7.8, 11.6], [5.4, 9.0],
        ],
        k,
      );
    },
  },

  // --- eddies: chip de credito
  eddies: {
    tint: YELLOW,
    draw: (c, k) => {
      c.polyline(rect(5.4, 8.0, 18.6, 16.6), 1.7, k, { close: true, glow: 1.6 });
      c.polygon(rect(5.4, 9.8, 18.6, 12.0), k);
      c.segment(13.0, 14.4, 17.0, 14.4, 1.3, k);
    },
  },

  // --- NCPD: escudo con galon
  ncpd: {
    tint: YELLOW,
    draw: (c, k) => {
      c.polyline([[12, 4.4], [18.8, 7.2], [18.8, 12.4], [12, 19.6], [5.2, 12.4], [5.2, 7.2]], 1.9, k, {
        close: true,
        glow: 1.8,
      });
      c.polyline([[9.2, 11.2], [11.8, 14.0], [15.0, 9.8]], 1.7, k, { glow: 1.2 });
    },
  },

  // --- vehiculos y combustible
  vehicle: {
    tint: YELLOW,
    draw: (c, k) => {
      c.polygon(
        [[4.8, 15.0], [7.0, 10.6], [17.0, 10.6], [19.2, 15.0], [19.2, 16.8], [4.8, 16.8]],
        k,
      );
      c.circle(8.2, 17.2, 1.8, k);
      c.circle(15.8, 17.2, 1.8, k);
    },
  },

  // --- motel: cama
  hotel: {
    tint: YELLOW,
    draw: (c, k) => {
      c.polygon(rect(3.9, 8.8, 6.1, 18.0), k);
      c.polygon(rect(6.1, 12.8, 20.1, 16.4), k);
      c.polygon(rect(7.3, 9.8, 11.7, 12.8), k);
    },
  },

  // --- ocio: play entre corchete
  entertainment: {
    tint: YELLOW,
    draw: (c, k) => {
      c.segment(6.0, 6.4, 6.0, 17.6, 1.8, k, { glow: 1.4 });
      c.polygon([[9.6, 6.4], [18.6, 12], [9.6, 17.6]], k);
    },
  },

  // --- corpo: dos torres
  corpo: {
    tint: DIM,
    draw: (c, k) => {
      c.polygon(chamfered(6.2, 9.4, 11.2, 19.2, 1.4), k);
      c.polygon(chamfered(12.2, 5.0, 17.8, 19.2, 1.6), k);
    },
  },

  // --- verde: conifera de dos pisos. Con un solo triangulo y tronco se leia
  // como una flecha hacia arriba, que ya es el icono de fast travel.
  nature: {
    tint: DIM,
    draw: (c, k) => {
      c.segment(12, 19.6, 12, 16.0, 2.0, k);
      c.polygon([[12, 4.8], [17.2, 11.8], [6.8, 11.8]], k);
      c.polygon([[12, 9.2], [18.6, 16.6], [5.4, 16.6]], k);
    },
  },

  // --- generico
  generic: {
    tint: DIM,
    draw: (c, k) => {
      c.polyline([[12, 7.4], [16.6, 12], [12, 16.6], [7.4, 12]], 1.6, k, {
        close: true,
        glow: 1.8,
      });
    },
  },
};

/**
 * Que tipos de establecimiento llevan cada icono. Las etiquetas son valores de
 * `class` del esquema OpenMapTiles; algunas no existen en el esquema actual y
 * estan por si aparecen (sobran sin coste en una expresion `match`).
 */
const MEMBERS = {
  food: [
    'restaurant', 'fast_food', 'sushi', 'bakery', 'butcher', 'ice_cream',
    'cafe', 'food_court', 'deli', 'confectionery', 'pastry', 'greengrocer',
  ],
  bar: ['bar', 'beer', 'alcohol_shop', 'nightclub', 'pub', 'music'],
  medpoint: ['hospital', 'pharmacy', 'doctors', 'dentist', 'clinic', 'veterinary', 'optician'],
  fastTravel: [
    'bus', 'railway', 'railway_metro', 'railway_light', 'ferry', 'harbor',
    'airport', 'airfield', 'heliport', 'aerialway', 'subway', 'tram_stop',
    'bus_station',
  ],
  landmark: [
    'attraction', 'monument', 'museum', 'art_gallery', 'castle', 'lighthouse',
    'viewpoint', 'zoo', 'aquarium', 'place_of_worship', 'information',
    'religious_christian', 'religious_jewish', 'religious_muslim', 'memorial',
    'artwork',
  ],
  junk: [
    'shop', 'grocery', 'gift', 'furniture', 'florist', 'laundry', 'hairdresser',
    'warehouse', 'convenience', 'supermarket', 'department_store', 'hardware',
    'books', 'bicycle', 'mobile_phone', 'electronics',
  ],
  clothes: ['clothing_store', 'shoes', 'jewelry', 'bag'],
  eddies: ['bank', 'atm', 'post', 'bureau_de_change'],
  ncpd: ['police', 'prison', 'fire_station', 'ranger_station', 'embassy'],
  vehicle: [
    'car', 'fuel', 'parking', 'parking_garage', 'bicycle_rental', 'car_repair',
    'charging_station',
  ],
  hotel: ['lodging', 'campsite', 'shelter', 'hostel'],
  entertainment: [
    'cinema', 'theatre', 'amusement_park', 'stadium', 'pitch', 'swimming',
    'golf', 'tennis', 'soccer', 'baseball', 'basketball', 'american_football',
    'cricket', 'skiing', 'casino', 'bowling',
  ],
  corpo: [
    'town_hall', 'college', 'school', 'library', 'industry', 'commercial',
    'office', 'courthouse', 'university',
  ],
  nature: [
    'park', 'garden', 'dog_park', 'playground', 'picnic_site', 'mountain',
    'volcano', 'cemetery', 'water', 'wetland', 'beach',
  ],
};

/** Icono usado cuando el `class` no esta en ninguna lista. */
export const FALLBACK_ICON = 'generic';

/** `class` de OpenMapTiles -> id de icono. */
export const CLASS_TO_ICON = (() => {
  const map = new Map();
  for (const [icon, classes] of Object.entries(MEMBERS)) {
    if (!ICONS[icon]) throw new Error(`MEMBERS apunta a un icono que no existe: ${icon}`);
    for (const cls of classes) {
      // Una expresion `match` de MapLibre rechaza etiquetas repetidas, asi que
      // un duplicado aqui romperia el estilo entero en tiempo de carga.
      if (map.has(cls)) {
        throw new Error(`la clase "${cls}" esta en ${map.get(cls)} y en ${icon}`);
      }
      map.set(cls, icon);
    }
  }
  return map;
})();

/** Nombre de la imagen dentro del sprite. */
export const spriteName = (icon) => `poi-${icon}`;
