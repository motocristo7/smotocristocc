export interface VenezuelaState {
  state: string;
  cities: string[];
}

export const VENEZUELA_LOCATIONS: VenezuelaState[] = [
  {
    state: 'Distrito Capital',
    cities: [
      'Caracas',
      'El Paraíso',
      'La Candelaria',
      'Catia',
      'El Valle',
      'Antímano',
      'San Martín',
      'El Recreo',
    ],
  },
  {
    state: 'Miranda',
    cities: [
      'Los Teques',
      'Chacao',
      'Baruta',
      'El Hatillo',
      'Sucre (Petare)',
      'Guarenas',
      'Guatire',
      'Charallave',
      'Cúa',
      'San Antonio de los Altos',
      'Higuerote',
    ],
  },
  {
    state: 'Carabobo',
    cities: [
      'Valencia',
      'Puerto Cabello',
      'Naguanagua',
      'San Diego',
      'Guacara',
      'Los Guayos',
      'Mariara',
      'Bejuma',
    ],
  },
  {
    state: 'Zulia',
    cities: [
      'Maracaibo',
      'San Francisco',
      'Cabimas',
      'Ciudad Ojeda',
      'Santa Bárbara del Zulia',
      'Machiques',
      'La Villa del Rosario',
    ],
  },
  {
    state: 'Lara',
    cities: [
      'Barquisimeto',
      'Cabudare',
      'Carora',
      'El Tocuyo',
      'Quíbor',
      'Duaca',
      'Sanare',
    ],
  },
  {
    state: 'Aragua',
    cities: [
      'Maracay',
      'Turmero',
      'La Victoria',
      'Cagua',
      'El Limón',
      'Villa de Cura',
      'Palo Negro',
      'Santa Cruz',
    ],
  },
  {
    state: 'Anzoátegui',
    cities: [
      'Barcelona',
      'Puerto La Cruz',
      'Lechería',
      'Guanta',
      'El Tigre',
      'Anaco',
      'Cantaura',
      'Pariaguán',
    ],
  },
  {
    state: 'Bolívar',
    cities: [
      'Ciudad Guayana (Puerto Ordaz / San Félix)',
      'Ciudad Bolívar',
      'Upata',
      'Caicara del Orinoco',
      'Santa Elena de Uairén',
      'Tumeremo',
    ],
  },
  {
    state: 'Táchira',
    cities: [
      'San Cristóbal',
      'Táriba',
      'Rubio',
      'La Fría',
      'San Antonio del Táchira',
      'Colón',
      'Ureña',
    ],
  },
  {
    state: 'Mérida',
    cities: [
      'Mérida',
      'El Vigía',
      'Ejido',
      'Tovar',
      'Lagunillas',
      'Bailadores',
    ],
  },
  {
    state: 'Falcón',
    cities: [
      'Coro',
      'Punto Fijo',
      'Chichiriviche',
      'Tucacas',
      'Dabajuro',
      'La Vela de Coro',
    ],
  },
  {
    state: 'Monagas',
    cities: [
      'Maturín',
      'Punta de Mata',
      'Caripe',
      'Caripito',
      'Temblador',
    ],
  },
  {
    state: 'Barinas',
    cities: [
      'Barinas',
      'Barinitas',
      'Socopó',
      'Santa Bárbara de Barinas',
      'Pedraza',
    ],
  },
  {
    state: 'Portuguesa',
    cities: [
      'Acarigua',
      'Araure',
      'Guanare',
      'Turén',
      'Villa Bruzual',
    ],
  },
  {
    state: 'Sucre',
    cities: [
      'Cumaná',
      'Carúpano',
      'Güiria',
      'Cariaco',
      'Araya',
    ],
  },
  {
    state: 'Trujillo',
    cities: [
      'Trujillo',
      'Valera',
      'Boconó',
      'Sabana de Mendoza',
    ],
  },
  {
    state: 'Nueva Esparta',
    cities: [
      'Porlamar',
      'Pampatar',
      'La Asunción',
      'Juan Griego',
    ],
  },
  {
    state: 'Yaracuy',
    cities: [
      'San Felipe',
      'Yaritagua',
      'Chivacoa',
      'Nirgua',
    ],
  },
  {
    state: 'Guárico',
    cities: [
      'San Juan de los Morros',
      'Calabozo',
      'Valle de la Pascua',
      'Zaraza',
      'Altagracia de Orituco',
    ],
  },
];

// Flat list of all main cities for easy lookup
export const ALL_VENEZUELA_CITIES = VENEZUELA_LOCATIONS.flatMap((loc) =>
  loc.cities.map((city) => `${city}, ${loc.state}`)
);

export const VENEZUELAN_BANKS = [
  '0102 - Banco de Venezuela',
  '0134 - Banesco',
  '0105 - Banco Mercantil',
  '0108 - Banco Provincial (BBVA)',
  '0114 - Bancaribe',
  '0172 - Bancamiga',
  '0115 - Banco Exterior',
  '0171 - Banco Activo',
  '0137 - Banco Sofitasa',
  '0163 - Banco del Tesoro',
  '0175 - Banco Bicentenario',
  '0151 - BNC (Banco Nacional de Crédito)',
  '0169 - Mi Banco',
];
