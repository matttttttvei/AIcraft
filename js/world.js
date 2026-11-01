/**
 * Модуль воксельного мира и процедурной генерации.
 * Хранит 3D-сетку блоков, генерирует рельеф с холмами и деревьями,
 * а также строит полигональную сетку (Mesh) с отсечением невидимых граней (Face Culling).
 */

class VoxelWorld {
  constructor(width = 48, height = 32, depth = 48) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.blocks = new Uint8Array(width * height * depth);
    this.isDirty = true; // Флаг перестроения полигональной сетки
  }

  // Индекс в одномерном массиве блоков
  getIndex(x, y, z) {
    return (y * this.depth + z) * this.width + x;
  }

  // Проверка нахождения координат внутри границ мира
  inBounds(x, y, z) {
    return x >= 0 && x < this.width &&
           y >= 0 && y < this.height &&
           z >= 0 && z < this.depth;
  }

  // Получить блок по координатам
  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) {
      if (y < 0) return BLOCK_TYPES.BEDROCK; // Дно мира непроходимо (бедрок)
      return BLOCK_TYPES.AIR;
    }
    return this.blocks[this.getIndex(x, y, z)];
  }

  // Установить блок по координатам
  setBlock(x, y, z, blockType) {
    if (!this.inBounds(x, y, z)) return false;
    const idx = this.getIndex(x, y, z);
    if (this.blocks[idx] !== blockType) {
      this.blocks[idx] = blockType;
      this.isDirty = true;
      return true;
    }
    return false;
  }

  // Считается ли блок прозрачным (для отсечения скрытых граней)
  isTransparent(blockType) {
    return blockType === BLOCK_TYPES.AIR ||
           blockType === BLOCK_TYPES.GLASS ||
           blockType === BLOCK_TYPES.LEAVES;
  }

  // Является ли блок физически твердым (для коллизий)
  isSolid(blockType) {
    return blockType !== BLOCK_TYPES.AIR;
  }

  // Процедурная генерация мира
  generate(seed = Math.random() * 1000) {
    this.blocks.fill(BLOCK_TYPES.AIR);

    // Функция гладкого 2D шума на основе комбинации гармоник
    const getSurfaceHeight = (x, z) => {
      const nx = (x + seed) * 0.08;
      const nz = (z + seed) * 0.08;

      // Комбинация синусов и косинусов разной частоты
      const h1 = Math.sin(nx * 1.0) * Math.cos(nz * 1.0) * 4.5;
      const h2 = Math.sin(nx * 2.3 + nz * 1.7) * 2.2;
      const h3 = Math.cos(nx * 4.1 - nz * 3.2) * 1.0;

      const baseHeight = 11;
      const finalH = Math.floor(baseHeight + h1 + h2 + h3);
      return Math.max(3, Math.min(this.height - 7, finalH));
    };

    // Заполнение ландшафта (бедрока, камня, земли, травы и песка)
    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.depth; z++) {
        const surfaceY = getSurfaceHeight(x, z);

        for (let y = 0; y <= surfaceY; y++) {
          if (y === 0) {
            // Нижний нерушимый слой — БЕДРОК
            this.setBlock(x, y, z, BLOCK_TYPES.BEDROCK);
          } else if (y === surfaceY) {
            // Верхний слой: на низинах — песок (пляж/озеро), на холмах — трава
            if (surfaceY <= 8) {
              this.setBlock(x, y, z, BLOCK_TYPES.SAND);
            } else {
              this.setBlock(x, y, z, BLOCK_TYPES.GRASS);
            }
          } else if (y >= surfaceY - 3) {
            // Подповерхностный слой земли или песка
            if (surfaceY <= 8) {
              this.setBlock(x, y, z, BLOCK_TYPES.SAND);
            } else {
              this.setBlock(x, y, z, BLOCK_TYPES.DIRT);
            }
          } else {
            // Глубинные породы — камень и естественные жилы руд
            let blockType = BLOCK_TYPES.STONE;
            const oreNoise = Math.sin(x * 37.17 + y * 71.31 + z * 53.43 + seed) * 43758.5453;
            const r = oreNoise - Math.floor(oreNoise);

            if (y <= 3 && r < 0.035) {
              blockType = BLOCK_TYPES.DIAMOND_ORE;   // Алмазы у самого дна (y = 1..3)
            } else if (y <= 4 && r < 0.075) {
              blockType = BLOCK_TYPES.REDSTONE_ORE;  // Редстоун в глубинах (y = 1..4)
            } else if (y <= 6 && r < 0.065) {
              blockType = BLOCK_TYPES.GOLD_ORE;      // Золото в нижней толще (y = 1..6)
            } else if (y <= 7 && r < 0.055) {
              blockType = BLOCK_TYPES.LAPIS_ORE;     // Лазурит (y = 1..7)
            } else if (r < 0.09) {
              blockType = BLOCK_TYPES.IRON_ORE;      // Железо по всей глубине
            } else if (r < 0.17) {
              blockType = BLOCK_TYPES.COAL_ORE;      // Уголь (частая руда)
            } else if (surfaceY > 11 && r > 0.982) {
              blockType = BLOCK_TYPES.EMERALD_ORE;   // Изумруды в горных высотах
            }

            this.setBlock(x, y, z, blockType);
          }
        }
      }
    }

    // Генерация деревьев
    for (let x = 3; x < this.width - 3; x++) {
      for (let z = 3; z < this.depth - 3; z++) {
        const surfaceY = getSurfaceHeight(x, z);

        // Деревья растут только на траве
        if (this.getBlock(x, surfaceY, z) === BLOCK_TYPES.GRASS) {
          // Псевдослучайная проверка шанса спавна дерева с достаточным расстоянием
          const treeNoise = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
          const spawnTree = (treeNoise - Math.floor(treeNoise)) < 0.045;

          if (spawnTree) {
            this.spawnTree(x, surfaceY + 1, z);
          }
        }
      }
    }

    this.isDirty = true;
  }

  // Создание одного дерева (ствол из бревен и шапка из листвы)
  spawnTree(x, baseY, z) {
    const trunkHeight = 4;

    // Ствол
    for (let y = 0; y < trunkHeight; y++) {
      this.setBlock(x, baseY + y, z, BLOCK_TYPES.WOOD_LOG);
    }

    // Крона из листвы (купол 3x3x2 + верхушка)
    const leafBaseY = baseY + trunkHeight - 2;
    for (let ly = 0; ly <= 3; ly++) {
      const curY = leafBaseY + ly;
      const radius = ly >= 2 ? 1 : 2;

      for (let lx = -radius; lx <= radius; lx++) {
        for (let lz = -radius; lz <= radius; lz++) {
          // Срезаем углы кроны для естественной формы
          if (Math.abs(lx) === radius && Math.abs(lz) === radius && radius > 1) {
            continue;
          }

          const targetX = x + lx;
          const targetZ = z + lz;

          // Не заменяем ствол листвой
          if (this.getBlock(targetX, curY, targetZ) === BLOCK_TYPES.AIR) {
            this.setBlock(targetX, curY, targetZ, BLOCK_TYPES.LEAVES);
          }
        }
      }
    }
  }

  /**
   * Генерация полигональной сетки (Mesh) с Face Culling.
   * Отрисовываются только грани, соприкасающиеся с воздухом или прозрачными блоками.
   */
  buildMesh(textureManager) {
    const positions = [];
    const uvs = [];
    const lights = [];

    // Вспомогательная функция добавления одной прямоугольной грани (2 треугольника = 6 вершин)
    // Вершины v0, v1, v2, v3 задаются в порядке против часовой стрелки (CCW) при взгляде снаружи блока:
    // v0 (bottom-left), v1 (bottom-right), v2 (top-right), v3 (top-left)
    const addFace = (v0, v1, v2, v3, tileIndex, l0, l1, l2, l3) => {
      const { u0, v0: tv0, u1, v1: tv1 } = textureManager.getTileUV(tileIndex);

      // Треугольник 1: v0 -> v1 -> v2 (CCW)
      // Треугольник 2: v0 -> v2 -> v3 (CCW)
      const faceVerts = [
        v0, v1, v2,
        v0, v2, v3
      ];

      const faceUVs = [
        [u0, tv1], [u1, tv1], [u1, tv0],
        [u0, tv1], [u1, tv0], [u0, tv0]
      ];

      const faceLights = [
        l0, l1, l2,
        l0, l2, l3
      ];

      for (let i = 0; i < 6; i++) {
        positions.push(faceVerts[i][0], faceVerts[i][1], faceVerts[i][2]);
        uvs.push(faceUVs[i][0], faceUVs[i][1]);
        lights.push(faceLights[i]);
      }
    };

    const isOcc = (bx, by, bz) => this.isSolid(this.getBlock(bx, by, bz)) ? 1 : 0;
    const vAO = (s1, s2, diag) => (s1 && s2) ? 0.55 : (1.0 - (s1 + s2 + diag) * 0.15);

    for (let y = 0; y < this.height; y++) {
      for (let z = 0; z < this.depth; z++) {
        for (let x = 0; x < this.width; x++) {
          const block = this.getBlock(x, y, z);
          if (block === BLOCK_TYPES.AIR) continue;

          const faces = BLOCK_FACES[block];
          if (!faces) continue;

          // 1. Верхняя грань (+Y) - максимальное освещение (солнце)
          // Нормаль: [0, 1, 0] (смотрит вверх, наружу)
          const topBlock = this.getBlock(x, y + 1, z);
          if (this.isTransparent(topBlock) && (block !== topBlock || block === BLOCK_TYPES.LEAVES)) {
            const lBase = 1.0;
            const l0 = lBase * vAO(isOcc(x - 1, y + 1, z), isOcc(x, y + 1, z + 1), isOcc(x - 1, y + 1, z + 1));
            const l1 = lBase * vAO(isOcc(x + 1, y + 1, z), isOcc(x, y + 1, z + 1), isOcc(x + 1, y + 1, z + 1));
            const l2 = lBase * vAO(isOcc(x + 1, y + 1, z), isOcc(x, y + 1, z - 1), isOcc(x + 1, y + 1, z - 1));
            const l3 = lBase * vAO(isOcc(x - 1, y + 1, z), isOcc(x, y + 1, z - 1), isOcc(x - 1, y + 1, z - 1));
            addFace(
              [x,     y + 1, z + 1],
              [x + 1, y + 1, z + 1],
              [x + 1, y + 1, z    ],
              [x,     y + 1, z    ],
              faces[0],
              l0, l1, l2, l3
            );
          }

          // 2. Нижняя грань (-Y) - глубокая тень
          // Нормаль: [0, -1, 0] (смотрит вниз, наружу)
          const bottomBlock = this.getBlock(x, y - 1, z);
          if (y > 0 && this.isTransparent(bottomBlock) && (block !== bottomBlock || block === BLOCK_TYPES.LEAVES)) {
            const lBase = 0.5;
            const l0 = lBase * vAO(isOcc(x - 1, y - 1, z), isOcc(x, y - 1, z - 1), isOcc(x - 1, y - 1, z - 1));
            const l1 = lBase * vAO(isOcc(x + 1, y - 1, z), isOcc(x, y - 1, z - 1), isOcc(x + 1, y - 1, z - 1));
            const l2 = lBase * vAO(isOcc(x + 1, y - 1, z), isOcc(x, y - 1, z + 1), isOcc(x + 1, y - 1, z + 1));
            const l3 = lBase * vAO(isOcc(x - 1, y - 1, z), isOcc(x, y - 1, z + 1), isOcc(x - 1, y - 1, z + 1));
            addFace(
              [x,     y, z    ],
              [x + 1, y, z    ],
              [x + 1, y, z + 1],
              [x,     y, z + 1],
              faces[1],
              l0, l1, l2, l3
            );
          }

          // 3. Северная грань (+Z)
          // Нормаль: [0, 0, 1] (смотрит вперед, наружу)
          const northBlock = this.getBlock(x, y, z + 1);
          if (this.isTransparent(northBlock) && (block !== northBlock || block === BLOCK_TYPES.LEAVES)) {
            const lBase = 0.8;
            const l0 = lBase * vAO(isOcc(x - 1, y, z + 1), isOcc(x, y - 1, z + 1), isOcc(x - 1, y - 1, z + 1));
            const l1 = lBase * vAO(isOcc(x + 1, y, z + 1), isOcc(x, y - 1, z + 1), isOcc(x + 1, y - 1, z + 1));
            const l2 = lBase * vAO(isOcc(x + 1, y, z + 1), isOcc(x, y + 1, z + 1), isOcc(x + 1, y + 1, z + 1));
            const l3 = lBase * vAO(isOcc(x - 1, y, z + 1), isOcc(x, y + 1, z + 1), isOcc(x - 1, y + 1, z + 1));
            addFace(
              [x,     y,     z + 1],
              [x + 1, y,     z + 1],
              [x + 1, y + 1, z + 1],
              [x,     y + 1, z + 1],
              faces[2],
              l0, l1, l2, l3
            );
          }

          // 4. Южная грань (-Z)
          // Нормаль: [0, 0, -1] (смотрит назад, наружу)
          const southBlock = this.getBlock(x, y, z - 1);
          if (this.isTransparent(southBlock) && (block !== southBlock || block === BLOCK_TYPES.LEAVES)) {
            const lBase = 0.8;
            const l0 = lBase * vAO(isOcc(x + 1, y, z - 1), isOcc(x, y - 1, z - 1), isOcc(x + 1, y - 1, z - 1));
            const l1 = lBase * vAO(isOcc(x - 1, y, z - 1), isOcc(x, y - 1, z - 1), isOcc(x - 1, y - 1, z - 1));
            const l2 = lBase * vAO(isOcc(x - 1, y, z - 1), isOcc(x, y + 1, z - 1), isOcc(x - 1, y + 1, z - 1));
            const l3 = lBase * vAO(isOcc(x + 1, y, z - 1), isOcc(x, y + 1, z - 1), isOcc(x + 1, y + 1, z - 1));
            addFace(
              [x + 1, y,     z],
              [x,     y,     z],
              [x,     y + 1, z],
              [x + 1, y + 1, z],
              faces[3],
              l0, l1, l2, l3
            );
          }

          // 5. Восточная грань (+X)
          // Нормаль: [1, 0, 0] (смотрит вправо, наружу)
          const eastBlock = this.getBlock(x + 1, y, z);
          if (this.isTransparent(eastBlock) && (block !== eastBlock || block === BLOCK_TYPES.LEAVES)) {
            const lBase = 0.65;
            const l0 = lBase * vAO(isOcc(x + 1, y, z + 1), isOcc(x + 1, y - 1, z), isOcc(x + 1, y - 1, z + 1));
            const l1 = lBase * vAO(isOcc(x + 1, y, z - 1), isOcc(x + 1, y - 1, z), isOcc(x + 1, y - 1, z - 1));
            const l2 = lBase * vAO(isOcc(x + 1, y, z - 1), isOcc(x + 1, y + 1, z), isOcc(x + 1, y + 1, z - 1));
            const l3 = lBase * vAO(isOcc(x + 1, y, z + 1), isOcc(x + 1, y + 1, z), isOcc(x + 1, y + 1, z + 1));
            addFace(
              [x + 1, y,     z + 1],
              [x + 1, y,     z    ],
              [x + 1, y + 1, z    ],
              [x + 1, y + 1, z + 1],
              faces[4],
              l0, l1, l2, l3
            );
          }

          // 6. Западная грань (-X)
          // Нормаль: [-1, 0, 0] (смотрит влево, наружу)
          const westBlock = this.getBlock(x - 1, y, z);
          if (this.isTransparent(westBlock) && (block !== westBlock || block === BLOCK_TYPES.LEAVES)) {
            const lBase = 0.65;
            const l0 = lBase * vAO(isOcc(x - 1, y, z - 1), isOcc(x - 1, y - 1, z), isOcc(x - 1, y - 1, z - 1));
            const l1 = lBase * vAO(isOcc(x - 1, y, z + 1), isOcc(x - 1, y - 1, z), isOcc(x - 1, y - 1, z + 1));
            const l2 = lBase * vAO(isOcc(x - 1, y, z + 1), isOcc(x - 1, y + 1, z), isOcc(x - 1, y + 1, z + 1));
            const l3 = lBase * vAO(isOcc(x - 1, y, z - 1), isOcc(x - 1, y + 1, z), isOcc(x - 1, y + 1, z - 1));
            addFace(
              [x, y,     z    ],
              [x, y,     z + 1],
              [x, y + 1, z + 1],
              [x, y + 1, z    ],
              faces[5],
              l0, l1, l2, l3
            );
          }
        }
      }
    }

    this.isDirty = false;

    return {
      positions: new Float32Array(positions),
      uvs: new Float32Array(uvs),
      lights: new Float32Array(lights),
      vertexCount: positions.length / 3
    };
  }
}
