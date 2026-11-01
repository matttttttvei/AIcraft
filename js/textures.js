/**
 * Модуль процедурной генерации текстур (16x16 пикселей) на HTML5 Canvas.
 * Создает оригинальные текстуры без использования чужих ресурсов и копирайтов.
 * Объединяет их в один текстурный атлас (Texture Atlas) для быстрой отрисовки WebGL.
 */

const BLOCK_TYPES = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD_LOG: 4,
  WOOD_PLANKS: 5,
  LEAVES: 6,
  SAND: 7,
  BRICK: 8,
  GLASS: 9,
  BEDROCK: 10,
  COAL_ORE: 11,
  IRON_ORE: 12,
  GOLD_ORE: 13,
  DIAMOND_ORE: 14,
  REDSTONE_ORE: 15,
  EMERALD_ORE: 16,
  LAPIS_ORE: 17
};

const BLOCK_NAMES = {
  [BLOCK_TYPES.GRASS]: 'Трава',
  [BLOCK_TYPES.DIRT]: 'Земля',
  [BLOCK_TYPES.STONE]: 'Камень',
  [BLOCK_TYPES.WOOD_LOG]: 'Бревно',
  [BLOCK_TYPES.WOOD_PLANKS]: 'Доски',
  [BLOCK_TYPES.LEAVES]: 'Листва',
  [BLOCK_TYPES.SAND]: 'Песок',
  [BLOCK_TYPES.BRICK]: 'Кирпич',
  [BLOCK_TYPES.GLASS]: 'Стекло',
  [BLOCK_TYPES.BEDROCK]: 'Бедрок',
  [BLOCK_TYPES.COAL_ORE]: 'Угольная руда',
  [BLOCK_TYPES.IRON_ORE]: 'Железная руда',
  [BLOCK_TYPES.GOLD_ORE]: 'Золотая руда',
  [BLOCK_TYPES.DIAMOND_ORE]: 'Алмазная руда',
  [BLOCK_TYPES.REDSTONE_ORE]: 'Редстоун руда',
  [BLOCK_TYPES.EMERALD_ORE]: 'Изумрудная руда',
  [BLOCK_TYPES.LAPIS_ORE]: 'Лазуритовая руда'
};

// Индексы текстур внутри атласа (по 16x16 тайлам)
const ATLAS_TILES = {
  EMPTY: 0,
  GRASS_TOP: 1,
  GRASS_SIDE: 2,
  DIRT: 3,
  STONE: 4,
  LOG_SIDE: 5,
  LOG_TOP: 6,
  PLANKS: 7,
  LEAVES: 8,
  SAND: 9,
  BRICK: 10,
  GLASS: 11,
  BEDROCK: 12,
  COAL_ORE: 13,
  IRON_ORE: 14,
  GOLD_ORE: 15,
  // Стадии трещин при разрушении блока (0..9)
  CRACK_0: 16,
  CRACK_1: 17,
  CRACK_2: 18,
  CRACK_3: 19,
  CRACK_4: 20,
  CRACK_5: 21,
  CRACK_6: 22,
  CRACK_7: 23,
  CRACK_8: 24,
  CRACK_9: 25,
  DIAMOND_ORE: 26,
  REDSTONE_ORE: 27,
  EMERALD_ORE: 28,
  LAPIS_ORE: 29
};

// Отображение стороны блока на тайл в атласе:
// [Top (+Y), Bottom (-Y), North (+Z), South (-Z), East (+X), West (-X)]
const BLOCK_FACES = {
  [BLOCK_TYPES.GRASS]: [
    ATLAS_TILES.GRASS_TOP,
    ATLAS_TILES.DIRT,
    ATLAS_TILES.GRASS_SIDE,
    ATLAS_TILES.GRASS_SIDE,
    ATLAS_TILES.GRASS_SIDE,
    ATLAS_TILES.GRASS_SIDE
  ],
  [BLOCK_TYPES.DIRT]: [
    ATLAS_TILES.DIRT,
    ATLAS_TILES.DIRT,
    ATLAS_TILES.DIRT,
    ATLAS_TILES.DIRT,
    ATLAS_TILES.DIRT,
    ATLAS_TILES.DIRT
  ],
  [BLOCK_TYPES.STONE]: [
    ATLAS_TILES.STONE,
    ATLAS_TILES.STONE,
    ATLAS_TILES.STONE,
    ATLAS_TILES.STONE,
    ATLAS_TILES.STONE,
    ATLAS_TILES.STONE
  ],
  [BLOCK_TYPES.WOOD_LOG]: [
    ATLAS_TILES.LOG_TOP,
    ATLAS_TILES.LOG_TOP,
    ATLAS_TILES.LOG_SIDE,
    ATLAS_TILES.LOG_SIDE,
    ATLAS_TILES.LOG_SIDE,
    ATLAS_TILES.LOG_SIDE
  ],
  [BLOCK_TYPES.WOOD_PLANKS]: [
    ATLAS_TILES.PLANKS,
    ATLAS_TILES.PLANKS,
    ATLAS_TILES.PLANKS,
    ATLAS_TILES.PLANKS,
    ATLAS_TILES.PLANKS,
    ATLAS_TILES.PLANKS
  ],
  [BLOCK_TYPES.LEAVES]: [
    ATLAS_TILES.LEAVES,
    ATLAS_TILES.LEAVES,
    ATLAS_TILES.LEAVES,
    ATLAS_TILES.LEAVES,
    ATLAS_TILES.LEAVES,
    ATLAS_TILES.LEAVES
  ],
  [BLOCK_TYPES.SAND]: [
    ATLAS_TILES.SAND,
    ATLAS_TILES.SAND,
    ATLAS_TILES.SAND,
    ATLAS_TILES.SAND,
    ATLAS_TILES.SAND,
    ATLAS_TILES.SAND
  ],
  [BLOCK_TYPES.BRICK]: [
    ATLAS_TILES.BRICK,
    ATLAS_TILES.BRICK,
    ATLAS_TILES.BRICK,
    ATLAS_TILES.BRICK,
    ATLAS_TILES.BRICK,
    ATLAS_TILES.BRICK
  ],
  [BLOCK_TYPES.GLASS]: [
    ATLAS_TILES.GLASS,
    ATLAS_TILES.GLASS,
    ATLAS_TILES.GLASS,
    ATLAS_TILES.GLASS,
    ATLAS_TILES.GLASS,
    ATLAS_TILES.GLASS
  ],
  [BLOCK_TYPES.BEDROCK]: [
    ATLAS_TILES.BEDROCK, ATLAS_TILES.BEDROCK, ATLAS_TILES.BEDROCK,
    ATLAS_TILES.BEDROCK, ATLAS_TILES.BEDROCK, ATLAS_TILES.BEDROCK
  ],
  [BLOCK_TYPES.COAL_ORE]: [
    ATLAS_TILES.COAL_ORE, ATLAS_TILES.COAL_ORE, ATLAS_TILES.COAL_ORE,
    ATLAS_TILES.COAL_ORE, ATLAS_TILES.COAL_ORE, ATLAS_TILES.COAL_ORE
  ],
  [BLOCK_TYPES.IRON_ORE]: [
    ATLAS_TILES.IRON_ORE, ATLAS_TILES.IRON_ORE, ATLAS_TILES.IRON_ORE,
    ATLAS_TILES.IRON_ORE, ATLAS_TILES.IRON_ORE, ATLAS_TILES.IRON_ORE
  ],
  [BLOCK_TYPES.GOLD_ORE]: [
    ATLAS_TILES.GOLD_ORE, ATLAS_TILES.GOLD_ORE, ATLAS_TILES.GOLD_ORE,
    ATLAS_TILES.GOLD_ORE, ATLAS_TILES.GOLD_ORE, ATLAS_TILES.GOLD_ORE
  ],
  [BLOCK_TYPES.DIAMOND_ORE]: [
    ATLAS_TILES.DIAMOND_ORE, ATLAS_TILES.DIAMOND_ORE, ATLAS_TILES.DIAMOND_ORE,
    ATLAS_TILES.DIAMOND_ORE, ATLAS_TILES.DIAMOND_ORE, ATLAS_TILES.DIAMOND_ORE
  ],
  [BLOCK_TYPES.REDSTONE_ORE]: [
    ATLAS_TILES.REDSTONE_ORE, ATLAS_TILES.REDSTONE_ORE, ATLAS_TILES.REDSTONE_ORE,
    ATLAS_TILES.REDSTONE_ORE, ATLAS_TILES.REDSTONE_ORE, ATLAS_TILES.REDSTONE_ORE
  ],
  [BLOCK_TYPES.EMERALD_ORE]: [
    ATLAS_TILES.EMERALD_ORE, ATLAS_TILES.EMERALD_ORE, ATLAS_TILES.EMERALD_ORE,
    ATLAS_TILES.EMERALD_ORE, ATLAS_TILES.EMERALD_ORE, ATLAS_TILES.EMERALD_ORE
  ],
  [BLOCK_TYPES.LAPIS_ORE]: [
    ATLAS_TILES.LAPIS_ORE, ATLAS_TILES.LAPIS_ORE, ATLAS_TILES.LAPIS_ORE,
    ATLAS_TILES.LAPIS_ORE, ATLAS_TILES.LAPIS_ORE, ATLAS_TILES.LAPIS_ORE
  ]
};

class TextureManager {
  constructor() {
    this.tileSize = 16;
    this.tilesPerRow = 8;
    this.atlasSize = 128; // 8x8 сетка тайлов по 16x16 = 128x128 пикселей
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.atlasSize;
    this.canvas.height = this.atlasSize;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.imageSmoothingEnabled = false;

    this.generateAtlas();
  }

  // Вспомогательный шум для текстуры
  setPixel(ctx, x, y, r, g, b, a = 255) {
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
    ctx.fillRect(x, y, 1, 1);
  }

  generateAtlas() {
    // 0: EMPTY (прозрачный)
    this.drawTile(ATLAS_TILES.EMPTY, (ctx) => {
      ctx.clearRect(0, 0, 16, 16);
    });

    // 1: GRASS_TOP (мягкая трава в стиле Plains Minecraft 1.16+, без пересвета)
    this.drawTile(ATLAS_TILES.GRASS_TOP, (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const n = (Math.sin(x * 1.5 + y * 2.3) * 0.5 + 0.5) * 15;
          const r = Math.floor(70 + n * 0.4);
          const g = Math.floor(105 + n * 0.6 + (Math.random() * 5));
          const b = Math.floor(58 + n * 0.3);
          this.setPixel(ctx, x, y, r, g, b);
        }
      }
    });

    // 2: GRASS_SIDE (верхний край — трава 1.16+, нижняя часть — земля)
    this.drawTile(ATLAS_TILES.GRASS_SIDE, (ctx) => {
      // Сначала фон земли
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const noise = ((x * 17 + y * 31) % 19) / 19;
          const r = Math.floor(105 + noise * 22);
          const g = Math.floor(68 + noise * 16);
          const b = Math.floor(40 + noise * 10);
          this.setPixel(ctx, x, y, r, g, b);
        }
      }
      // Верхняя зеленая кайма травы с зубчиками (калибровка под Plains 1.16+)
      const grassHeights = [3, 4, 3, 5, 4, 3, 4, 5, 3, 4, 3, 4, 5, 4, 3, 4];
      for (let x = 0; x < 16; x++) {
        const h = grassHeights[x];
        for (let y = 0; y < h; y++) {
          const dark = (y === h - 1) ? 18 : 0;
          this.setPixel(ctx, x, y, 76 - dark, 114 - dark, 62 - dark);
        }
      }
    });

    // 3: DIRT (рыхлая коричневая почва)
    this.drawTile(ATLAS_TILES.DIRT, (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const noise = ((x * 23 + y * 47) % 29) / 29;
          const r = Math.floor(115 + noise * 28);
          const g = Math.floor(75 + noise * 20);
          const b = Math.floor(45 + noise * 14);
          this.setPixel(ctx, x, y, r, g, b);
        }
      }
    });

    // 4: STONE (серый монолитный камень с трещинками)
    this.drawTile(ATLAS_TILES.STONE, (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const noise = ((x * 37 + y * 53) % 31) / 31;
          const val = Math.floor(115 + noise * 35);
          this.setPixel(ctx, x, y, val, val, val);
        }
      }
    });

    // 5: LOG_SIDE (кора дерева с вертикальными бороздками)
    this.drawTile(ATLAS_TILES.LOG_SIDE, (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const column = (x % 4 === 0) ? -25 : ((x % 2 === 0) ? 10 : 0);
          const noise = ((y * 13) % 7) * 3;
          const r = Math.max(0, Math.floor(95 + column + noise));
          const g = Math.max(0, Math.floor(65 + column * 0.7 + noise * 0.7));
          const b = Math.max(0, Math.floor(38 + column * 0.5));
          this.setPixel(ctx, x, y, r, g, b);
        }
      }
    });

    // 6: LOG_TOP (срез бревна с годовыми кольцами)
    this.drawTile(ATLAS_TILES.LOG_TOP, (ctx) => {
      const cx = 7.5, cy = 7.5;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const dist = Math.hypot(x - cx, y - cy);
          if (dist > 7) {
            // Внешняя кора
            this.setPixel(ctx, x, y, 75, 50, 30);
          } else {
            // Годовые кольца
            const ring = Math.floor(dist * 1.8) % 2 === 0 ? 15 : 0;
            this.setPixel(ctx, x, y, 175 - ring, 140 - ring, 85 - ring);
          }
        }
      }
    });

    // 7: PLANKS (деревянные доски с планками)
    this.drawTile(ATLAS_TILES.PLANKS, (ctx) => {
      for (let y = 0; y < 16; y++) {
        const isSeam = (y % 4 === 0);
        for (let x = 0; x < 16; x++) {
          if (isSeam) {
            this.setPixel(ctx, x, y, 110, 80, 45); // Темная щель между досками
          } else {
            const grain = (x % 3 === 0) ? 10 : 0;
            this.setPixel(ctx, x, y, 185 - grain, 145 - grain, 85 - grain);
          }
        }
      }
    });

    // 8: LEAVES (зеленая листва с полупрозрачными просветами)
    this.drawTile(ATLAS_TILES.LEAVES, (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const hole = ((x * 19 + y * 13) % 11 === 0);
          if (hole) {
            this.setPixel(ctx, x, y, 0, 0, 0, 0); // Просвет в кроне
          } else {
            const shade = ((x + y * 3) % 5) * 12;
            this.setPixel(ctx, x, y, 40 + shade * 0.4, 130 + shade, 35 + shade * 0.3, 255);
          }
        }
      }
    });

    // 9: SAND (золотистый мягкий песок)
    this.drawTile(ATLAS_TILES.SAND, (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const noise = ((x * 29 + y * 41) % 17) / 17;
          const r = Math.floor(215 + noise * 25);
          const g = Math.floor(195 + noise * 20);
          const b = Math.floor(135 + noise * 18);
          this.setPixel(ctx, x, y, r, g, b);
        }
      }
    });

    // 10: BRICK (аккуратная кирпичная кладка со швами)
    this.drawTile(ATLAS_TILES.BRICK, (ctx) => {
      for (let y = 0; y < 16; y++) {
        const row = Math.floor(y / 4);
        const isHorizMortar = (y % 4 === 3);
        const offset = (row % 2 === 0) ? 0 : 4;
        for (let x = 0; x < 16; x++) {
          const isVertMortar = ((x + offset) % 8 === 7);
          if (isHorizMortar || isVertMortar) {
            this.setPixel(ctx, x, y, 185, 180, 175); // Шов раствора
          } else {
            const shade = ((x + y * 2) % 4) * 8;
            this.setPixel(ctx, x, y, 165 + shade, 65 + shade * 0.5, 55 + shade * 0.4);
          }
        }
      }
    });

    // 11: GLASS (полупрозрачное голубоватое стекло с белой каймой и бликами)
    this.drawTile(ATLAS_TILES.GLASS, (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const isBorder = (x === 0 || x === 15 || y === 0 || y === 15);
          const isGlare1 = (x === y && x > 2 && x < 7);
          const isGlare2 = (x === y && x > 9 && x < 13);

          if (isBorder) {
            this.setPixel(ctx, x, y, 220, 245, 255, 220);
          } else if (isGlare1 || isGlare2) {
            this.setPixel(ctx, x, y, 255, 255, 255, 200);
          } else {
            this.setPixel(ctx, x, y, 180, 230, 250, 60); // Полупрозрачное заполнение
          }
        }
      }
    });

    // --- Генерация 10 стадий анимации трещин при разрушении (16..25) ---
    const allCrackPoints = [
      [7, 7], [8, 8], [8, 9], [7, 6], [9, 10], [6, 6],
      [5, 5], [4, 5], [9, 8], [10, 7], [8, 11], [7, 12],
      [3, 4], [2, 4], [11, 7], [12, 6], [7, 13], [6, 14],
      [5, 7], [4, 8], [9, 5], [10, 4], [11, 11], [12, 12],
      [1, 4], [0, 4], [13, 6], [14, 5], [15, 5], [6, 15],
      [3, 9], [2, 10], [1, 11], [10, 3], [11, 2], [13, 13], [14, 14],
      [6, 3], [7, 2], [8, 1], [9, 0], [2, 7], [1, 8], [0, 9],
      [10, 12], [11, 13], [12, 14], [13, 15], [3, 12], [4, 13], [5, 14]
    ];

    for (let stageIdx = 0; stageIdx < 10; stageIdx++) {
      const count = Math.max(3, Math.floor(((stageIdx + 1) / 10) * allCrackPoints.length));
      const points = allCrackPoints.slice(0, count);

      this.drawTile(ATLAS_TILES.CRACK_0 + stageIdx, (ctx) => {
        ctx.clearRect(0, 0, 16, 16);
        // Мягкие серые края трещин
        for (const [x, y] of points) {
          ctx.fillStyle = 'rgba(155, 155, 155, 0.75)';
          ctx.fillRect(Math.max(0, x - 1), y, 3, 1);
          ctx.fillRect(x, Math.max(0, y - 1), 1, 3);
        }
        // Темные линии разлома (#3d3d3d)
        for (const [x, y] of points) {
          ctx.fillStyle = 'rgba(61, 61, 61, 0.95)';
          ctx.fillRect(x, y, 1, 1);
        }
      });
    }
  }

  // Отрисовка отдельного тайла 16x16 на атлас
  drawTile(tileIndex, renderFn) {
    const col = tileIndex % this.tilesPerRow;
    const row = Math.floor(tileIndex / this.tilesPerRow);
    const ox = col * this.tileSize;
    const oy = row * this.tileSize;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.tileSize;
    tempCanvas.height = this.tileSize;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = false;

    renderFn(tempCtx);
    this.ctx.drawImage(tempCanvas, ox, oy);
  }

  // Получить UV-координаты тайла в атласе (0..1) с полупиксельным отступом против швов
  getTileUV(tileIndex) {
    const col = tileIndex % this.tilesPerRow;
    const row = Math.floor(tileIndex / this.tilesPerRow);
    const eps = 0.35 / this.atlasSize; // Защита от просвечивания соседних тайлов атласа
    const u0 = (col / this.tilesPerRow) + eps;
    const v0 = (row / this.tilesPerRow) + eps;
    const u1 = ((col + 1) / this.tilesPerRow) - eps;
    const v1 = ((row + 1) / this.tilesPerRow) - eps;
    return { u0, v0, u1, v1 };
  }

  // Получить иконку блока для панели быстрого доступа (DataURL)
  getBlockIcon(blockType) {
    if (typeof ASSET_DATA !== 'undefined') {
      if (blockType === BLOCK_TYPES.GRASS) return ASSET_DATA.grass_side;
      if (blockType === BLOCK_TYPES.DIRT) return ASSET_DATA.dirt;
      if (blockType === BLOCK_TYPES.STONE) return ASSET_DATA.stone;
      if (blockType === BLOCK_TYPES.WOOD_LOG) return ASSET_DATA.oak_log;
      if (blockType === BLOCK_TYPES.WOOD_PLANKS) return ASSET_DATA.oak_planks;
      if (blockType === BLOCK_TYPES.LEAVES) return ASSET_DATA.oak_leaves;
      if (blockType === BLOCK_TYPES.SAND) return ASSET_DATA.sand;
      if (blockType === BLOCK_TYPES.BRICK) return ASSET_DATA.bricks;
      if (blockType === BLOCK_TYPES.GLASS) return ASSET_DATA.glass;
      if (blockType === BLOCK_TYPES.BEDROCK) return ASSET_DATA.bedrock;
      if (blockType === BLOCK_TYPES.COAL_ORE) return ASSET_DATA.coal_ore;
      if (blockType === BLOCK_TYPES.IRON_ORE) return ASSET_DATA.iron_ore;
      if (blockType === BLOCK_TYPES.GOLD_ORE) return ASSET_DATA.gold_ore;
      if (blockType === BLOCK_TYPES.DIAMOND_ORE) return ASSET_DATA.diamond_ore;
      if (blockType === BLOCK_TYPES.REDSTONE_ORE) return ASSET_DATA.redstone_ore;
      if (blockType === BLOCK_TYPES.EMERALD_ORE) return ASSET_DATA.emerald_ore;
      if (blockType === BLOCK_TYPES.LAPIS_ORE) return ASSET_DATA.lapis_ore;
    }
    const tileIndex = BLOCK_FACES[blockType] ? BLOCK_FACES[blockType][2] : 0; // Боковая текстура
    return this.getTileDataURL(tileIndex);
  }

  // Получить DataURL для конкретной грани блока (для крупного отображения в руке)
  getFaceTextureURL(blockType, faceIndex = 2) {
    if (typeof ASSET_DATA !== 'undefined') {
      if (blockType === BLOCK_TYPES.GRASS) {
        if (faceIndex === 0) return ASSET_DATA.grass_top;
        if (faceIndex === 1) return ASSET_DATA.dirt;
        return ASSET_DATA.grass_side;
      }
      if (blockType === BLOCK_TYPES.DIRT) return ASSET_DATA.dirt;
      if (blockType === BLOCK_TYPES.STONE) return ASSET_DATA.stone;
      if (blockType === BLOCK_TYPES.WOOD_LOG) {
        if (faceIndex === 0 || faceIndex === 1) return ASSET_DATA.oak_log_top;
        return ASSET_DATA.oak_log;
      }
      if (blockType === BLOCK_TYPES.WOOD_PLANKS) return ASSET_DATA.oak_planks;
      if (blockType === BLOCK_TYPES.LEAVES) return ASSET_DATA.oak_leaves;
      if (blockType === BLOCK_TYPES.SAND) return ASSET_DATA.sand;
      if (blockType === BLOCK_TYPES.BRICK) return ASSET_DATA.bricks;
      if (blockType === BLOCK_TYPES.GLASS) return ASSET_DATA.glass;
      if (blockType === BLOCK_TYPES.BEDROCK) return ASSET_DATA.bedrock;
      if (blockType === BLOCK_TYPES.COAL_ORE) return ASSET_DATA.coal_ore;
      if (blockType === BLOCK_TYPES.IRON_ORE) return ASSET_DATA.iron_ore;
      if (blockType === BLOCK_TYPES.GOLD_ORE) return ASSET_DATA.gold_ore;
      if (blockType === BLOCK_TYPES.DIAMOND_ORE) return ASSET_DATA.diamond_ore;
      if (blockType === BLOCK_TYPES.REDSTONE_ORE) return ASSET_DATA.redstone_ore;
      if (blockType === BLOCK_TYPES.EMERALD_ORE) return ASSET_DATA.emerald_ore;
      if (blockType === BLOCK_TYPES.LAPIS_ORE) return ASSET_DATA.lapis_ore;
    }

    const faces = BLOCK_FACES[blockType];
    const tileIndex = faces ? faces[faceIndex] : 0;
    return this.getTileDataURL(tileIndex);
  }

  getTileDataURL(tileIndex) {
    const col = tileIndex % this.tilesPerRow;
    const row = Math.floor(tileIndex / this.tilesPerRow);

    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 32;
    iconCanvas.height = 32;
    const iconCtx = iconCanvas.getContext('2d');
    iconCtx.imageSmoothingEnabled = false;

    iconCtx.drawImage(
      this.canvas,
      col * 16, row * 16, 16, 16,
      0, 0, 32, 32
    );

    return iconCanvas.toDataURL('image/png');
  }

  // Загрузка текстур блоков и трещин напрямую из ASSET_DATA (встроенных файлов assets/)
  loadFromAssets(onUpdated) {
    if (typeof ASSET_DATA === 'undefined') return;

    const assetsMap = [
      { tile: ATLAS_TILES.GRASS_TOP, data: ASSET_DATA.grass_top },
      { tile: ATLAS_TILES.GRASS_SIDE, data: ASSET_DATA.grass_side },
      { tile: ATLAS_TILES.DIRT, data: ASSET_DATA.dirt },
      { tile: ATLAS_TILES.STONE, data: ASSET_DATA.stone },
      { tile: ATLAS_TILES.LOG_SIDE, data: ASSET_DATA.oak_log },
      { tile: ATLAS_TILES.LOG_TOP, data: ASSET_DATA.oak_log_top },
      { tile: ATLAS_TILES.PLANKS, data: ASSET_DATA.oak_planks },
      { tile: ATLAS_TILES.LEAVES, data: ASSET_DATA.oak_leaves },
      { tile: ATLAS_TILES.SAND, data: ASSET_DATA.sand },
      { tile: ATLAS_TILES.BRICK, data: ASSET_DATA.bricks },
      { tile: ATLAS_TILES.GLASS, data: ASSET_DATA.glass },
      { tile: ATLAS_TILES.BEDROCK, data: ASSET_DATA.bedrock },
      { tile: ATLAS_TILES.COAL_ORE, data: ASSET_DATA.coal_ore },
      { tile: ATLAS_TILES.IRON_ORE, data: ASSET_DATA.iron_ore },
      { tile: ATLAS_TILES.GOLD_ORE, data: ASSET_DATA.gold_ore },
      { tile: ATLAS_TILES.DIAMOND_ORE, data: ASSET_DATA.diamond_ore },
      { tile: ATLAS_TILES.REDSTONE_ORE, data: ASSET_DATA.redstone_ore },
      { tile: ATLAS_TILES.EMERALD_ORE, data: ASSET_DATA.emerald_ore },
      { tile: ATLAS_TILES.LAPIS_ORE, data: ASSET_DATA.lapis_ore },
      { tile: ATLAS_TILES.CRACK_0, data: ASSET_DATA.destroy_0 },
      { tile: ATLAS_TILES.CRACK_1, data: ASSET_DATA.destroy_1 },
      { tile: ATLAS_TILES.CRACK_2, data: ASSET_DATA.destroy_2 },
      { tile: ATLAS_TILES.CRACK_3, data: ASSET_DATA.destroy_3 },
      { tile: ATLAS_TILES.CRACK_4, data: ASSET_DATA.destroy_4 },
      { tile: ATLAS_TILES.CRACK_5, data: ASSET_DATA.destroy_5 },
      { tile: ATLAS_TILES.CRACK_6, data: ASSET_DATA.destroy_6 },
      { tile: ATLAS_TILES.CRACK_7, data: ASSET_DATA.destroy_7 },
      { tile: ATLAS_TILES.CRACK_8, data: ASSET_DATA.destroy_8 },
      { tile: ATLAS_TILES.CRACK_9, data: ASSET_DATA.destroy_9 }
    ];

    let pending = assetsMap.length;

    assetsMap.forEach(item => {
      const img = new Image();
      img.onload = () => {
        const col = item.tile % this.tilesPerRow;
        const row = Math.floor(item.tile / this.tilesPerRow);
        const ox = col * this.tileSize;
        const oy = row * this.tileSize;

        this.ctx.clearRect(ox, oy, this.tileSize, this.tileSize);
        this.ctx.drawImage(img, 0, 0, img.width, img.height, ox, oy, this.tileSize, this.tileSize);

        pending--;
        if (pending === 0 && onUpdated) {
          onUpdated();
        }
      };
      img.onerror = () => {
        pending--;
        if (pending === 0 && onUpdated) {
          onUpdated();
        }
      };
      img.src = item.data;
    });
  }

  // Загрузка текстуры свиньи из ASSET_DATA.pig
  loadPigTexture(onLoaded) {
    const img = new Image();
    img.onload = () => {
      onLoaded(img);
    };
    img.onerror = () => {
      // Резервная текстура свинки
      const pigCanvas = document.createElement('canvas');
      pigCanvas.width = 64;
      pigCanvas.height = 32;
      const pctx = pigCanvas.getContext('2d');
      pctx.fillStyle = '#f09890';
      pctx.fillRect(0, 0, 64, 32);
      onLoaded(pigCanvas);
    };
    img.src = (typeof ASSET_DATA !== 'undefined' && ASSET_DATA.pig) ? ASSET_DATA.pig : 'assets/entity/pig/pig.png';
  }
}
