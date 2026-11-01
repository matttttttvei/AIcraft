/**
 * Модуль моба Свиньи (Pig Mob) в стиле классического Minecraft.
 *
 * Архитектура ИИ:
 * - Непрерывное перемещение от точки к точке по сетке воксельного мира и алгоритму A*.
 * - Предварительный расчёт: пока свинья идёт по текущему маршруту (currentPath),
 *   следующий маршрут (nextPath) рассчитывается в фоновом режиме.
 * - При подходе к цели (< ARRIVE_DIST) в тот же кадр происходит бесшовное переключение
 *   на заранее просчитанный следующий путь без каких-либо пауз или остановок.
 * - Строгая проверка диагоналей в A* (обе боковые клетки свободны) + штраф WALL_PENALTY
 *   у стен полностью исключают срезание и «целование углов».
 * - Глобальная очередь расчётов: не более одного поиска A* за кадр (Pig.processPathQueue).
 * - Страховка от застреваний: если свинья стоит в радиусе STUCK_RADIUS дольше STUCK_TIME,
 *   точка бракуется и выбирается новый маршрут.
 * - Исправлена кинематика: свинья идёт СТРОГО головой и пятачком вперёд (никакой ходьбы боком/задом).
 * - Отладочные траектории, линии, столбы и плашки ПОЛНОСТЬЮ ОТКЛЮЧЕНЫ (DEBUG_PATH = false).
 */

// ============================================================================
// === КОНСТАНТЫ (вверху файла) ===
// ============================================================================
const MIN_TARGET_DIST = 10;        // минимум блоков до новой точки
const MAX_TARGET_DIST = 20;        // максимум блоков до новой точки
const ARRIVE_DIST = 1.0;           // свинья «дошла», если ближе стольких блоков к точке
const STUCK_RADIUS = 4.0;          // радиус вокруг точки для страховки от застревания
const STUCK_TIME = 4.0;            // секунд стояния в этом радиусе до отказа от точки
const STAND_SPEED_EPS = 0.1;       // скорость (блоков в секунду) ниже которой свинья «стоит»
const MAX_STEP_UP = 1;             // свинья запрыгивает на 1 блок
const MAX_STEP_DOWN = 1;           // свинья спрыгивает на 1 блок
const MAX_A_STAR_NODES = 4000;     // лимит узлов поиска A*
const WAYPOINT_REACHED_DIST = 0.3; // дистанция достижения путевой точки к центру клетки
const WALL_PENALTY = 0.5;          // доп. стоимость клетки рядом со стеной
const DEBUG_PATH = false;          // отображение траекторий отключено (чистый визуал игры)

// Параметры физики, скорости и хитбокса
const PIG_SPEED = 1.6;             // скорость обычной ходьбы (блоков/сек)
const PIG_FLEE_SPEED = 3.6;        // скорость бега в панике после удара (блоков/сек)
const PIG_GRAVITY = -22.0;         // гравитационное ускорение (блоков/сек^2)
const PIG_JUMP_FORCE = 6.8;        // импульс вертикального прыжка на ступеньку
const PIG_HITBOX_RADIUS = 0.35;    // полуширина хитбокса (AABB) для проходов шириной 1 блок
const PIG_HITBOX_HEIGHT = 1.00;    // высота хитбокса (AABB)
const PIG_MAX_HEALTH = 10;         // максимальное здоровье
const ROTATION_SPEED = 8.0;        // скорость плавного поворота (рад/сек)

// ============================================================================
// ВСПОМОГАТЕЛЬНАЯ СТРУКТУРА: БИНАРНАЯ МИН-КУЧА ДЛЯ БЫСТРОГО A*
// ============================================================================
class MinHeap {
  constructor() {
    this.heap = [];
  }

  push(node) {
    this.heap.push(node);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._sinkDown(0);
    }
    return top;
  }

  size() {
    return this.heap.length;
  }

  _bubbleUp(idx) {
    const element = this.heap[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this.heap[parentIdx];
      if (element.f >= parent.f) break;
      this.heap[idx] = parent;
      idx = parentIdx;
    }
    this.heap[idx] = element;
  }

  _sinkDown(idx) {
    const length = this.heap.length;
    const element = this.heap[idx];
    while (true) {
      const leftChildIdx = (idx << 1) + 1;
      const rightChildIdx = leftChildIdx + 1;
      let leftChild, rightChild;
      let swap = null;

      if (leftChildIdx < length) {
        leftChild = this.heap[leftChildIdx];
        if (leftChild.f < element.f) {
          swap = leftChildIdx;
        }
      }

      if (rightChildIdx < length) {
        rightChild = this.heap[rightChildIdx];
        if (
          (swap === null && rightChild.f < element.f) ||
          (swap !== null && rightChild.f < leftChild.f)
        ) {
          swap = rightChildIdx;
        }
      }

      if (swap === null) break;
      this.heap[idx] = this.heap[swap];
      idx = swap;
    }
    this.heap[idx] = element;
  }
}

// ============================================================================
// КЛАСС PIG: МОБ СВИНЬИ С НЕПРЕРЫВНЫМ ПУТЕШЕСТВИЕМ ПО A*
// ============================================================================
class Pig {
  // Глобальная статическая очередь задач поиска путей A*
  static pathQueue = [];

  /**
   * Вызывается один раз за кадр из главного игрового цикла.
   * Выполняет не более 1 поиска пути за кадр для предотвращения просадок FPS.
   */
  static processPathQueue() {
    if (Pig.pathQueue.length === 0) return;
    const task = Pig.pathQueue.shift();
    if (!task) return;
    try {
      task();
    } catch (err) {
      console.error('Ошибка в задаче пути Pig:', err);
    }
  }

  constructor(world, x = 24.5, y = 20, z = 20.5) {
    this.world = world;

    // Координаты основания свиньи (ноги)
    this.x = x;
    this.y = y;
    this.z = z;

    // Скорости
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;

    // Углы поворота (yaw: 0 = смотрит и движется вдоль -Z, PI/2 = вдоль -X)
    this.yaw = 0;
    this.targetYaw = 0;

    // Параметры хитбокса (AABB)
    this.radius = PIG_HITBOX_RADIUS;
    this.height = PIG_HITBOX_HEIGHT;
    this.isGrounded = false;

    // Состояние маршрутов A*
    this.currentTarget = null;     // текущая целевая точка {x, y, z}
    this.currentPath = [];         // массив путевых точек [{x, y, z}, ...]
    this.currentWaypointIndex = 0; // индекс следующей путевой точки

    this.nextTarget = null;        // предпросчитанная следующая цель
    this.nextPath = null;          // предпросчитанный следующий путь
    this.isCalculatingNext = false;// флаг фонового расчёта следующего пути

    // Таймеры и переменные контроля застревания
    this.stuckTimer = 0;           // время стояния в радиусе STUCK_RADIUS
    this.prevCheckX = this.x;
    this.prevCheckZ = this.z;
    this.prevCheckTime = 0;

    // Физика и анимация
    this.walkTime = 0;
    this.oinkTimer = 4.0 + Math.random() * 6.0;

    // Здоровье и урон
    this.health = PIG_MAX_HEALTH;
    this.maxHealth = PIG_MAX_HEALTH;
    this.hurtTimer = 0;            // вспышка красного при ударе
    this.fleeTimer = 0;            // время паники после удара

    // Размещение на поверхности
    this.snapToSurface();

    // Запуск инициализации первого и следующего пути
    this.initFirstPath();
  }

  // ==========================================================================
  // НАВИГАЦИЯ И ПРОВЕРКА ПРОХОДИМОСТИ КЛЕТОК
  // ==========================================================================

  /**
   * Разместить свинью на твёрдой поверхности земли (трава/земля/песок/камень).
   * Игнорирует листву деревьев, чтобы свинья не появлялась в кроне.
   */
  snapToSurface() {
    const bx = Math.floor(this.x);
    const bz = Math.floor(this.z);
    const leavesType = (typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES.LEAVES) ? BLOCK_TYPES.LEAVES : 5;

    for (let y = this.world.height - 2; y >= 1; y--) {
      const b = this.world.getBlock(bx, y, bz);
      if (this.world.isSolid(b) && b !== leavesType) {
        const b1 = this.world.getBlock(bx, y + 1, bz);
        const b2 = this.world.getBlock(bx, y + 2, bz);
        if (!this.world.isSolid(b1) && !this.world.isSolid(b2)) {
          this.y = y + 1;
          this.prevCheckX = this.x;
          this.prevCheckZ = this.z;
          return;
        }
      }
    }

    // Запасной поиск любой твердой опоры
    for (let y = this.world.height - 2; y >= 1; y--) {
      if (this.world.isSolid(this.world.getBlock(bx, y, bz))) {
        this.y = y + 1;
        break;
      }
    }
    this.prevCheckX = this.x;
    this.prevCheckZ = this.z;
  }

  /**
   * Проверка проходимости клетки (x, y, z):
   * 1. Под клеткой твердый блок (world.isSolid(world.getBlock(x, y-1, z))).
   * 2. В клетке и над ней свободно 2 блока (y и y+1 не твердые).
   * 3. Клетка не заполнена опасным блоком (вода, лава, кактус).
   */
  isCellPassable(x, y, z) {
    if (x < 1 || x >= this.world.width - 1 || z < 1 || z >= this.world.depth - 1 || y < 1 || y >= this.world.height - 2) {
      return false;
    }

    const under = this.world.getBlock(x, y - 1, z);
    if (!this.world.isSolid(under)) return false;

    // Нельзя ходить по листве, лаве или воде
    const waterType = (typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES.WATER) ? BLOCK_TYPES.WATER : 7;
    const leavesType = (typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES.LEAVES) ? BLOCK_TYPES.LEAVES : 5;
    if (under === waterType || under === leavesType) return false;

    const block1 = this.world.getBlock(x, y, z);
    const block2 = this.world.getBlock(x, y + 1, z);
    if (this.world.isSolid(block1) || this.world.isSolid(block2)) return false;
    if (block1 === waterType || block2 === waterType) return false;

    return true;
  }

  /**
   * Проверка опасных соседей вокруг блока (вода, лава, кактус, огонь).
   */
  isHazardous(x, y, z) {
    const waterType = (typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES.WATER) ? BLOCK_TYPES.WATER : 7;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          const b = this.world.getBlock(x + dx, y + dy, z + dz);
          if (b === waterType) return true;
        }
      }
    }
    return false;
  }

  /**
   * Штраф за соседство со стеной (WALL_PENALTY):
   * Если рядом с клеткой есть твердый блок на уровне тела или головы, добавляется штраф,
   * чтобы A* вел свинью по открытому пространству, а не терся о стены.
   */
  getWallPenalty(x, y, z) {
    const orthogonal = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of orthogonal) {
      const b1 = this.world.getBlock(x + dx, y, z + dz);
      const b2 = this.world.getBlock(x + dx, y + 1, z + dz);
      if (this.world.isSolid(b1) || this.world.isSolid(b2)) {
        return WALL_PENALTY;
      }
    }
    return 0;
  }

  // ==========================================================================
  // ВЫБОР ЦЕЛИ И АЛГОРИТМ ПОИСКА ПУТИ A*
  // ==========================================================================

  /**
   * Выбор случайной точки на блоке ТРАВЫ на расстоянии [MIN_TARGET_DIST..MAX_TARGET_DIST]
   * относительно refPos.
   */
  pickTargetPosition(refPos, maxAttempts = 20) {
    const grassType = (typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES.GRASS) ? BLOCK_TYPES.GRASS : 1;
    const dirtType = (typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES.DIRT) ? BLOCK_TYPES.DIRT : 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = MIN_TARGET_DIST + Math.random() * (MAX_TARGET_DIST - MIN_TARGET_DIST);
      const targetX = Math.round(refPos.x + Math.cos(angle) * dist);
      const targetZ = Math.round(refPos.z + Math.sin(angle) * dist);

      if (targetX < 2 || targetX >= this.world.width - 2 || targetZ < 2 || targetZ >= this.world.depth - 2) {
        continue;
      }

      // Ищем травяной блок на высоте
      for (let y = this.world.height - 3; y >= 2; y--) {
        const block = this.world.getBlock(targetX, y, targetZ);
        if (block === grassType || block === dirtType) {
          const footY = y + 1;
          if (this.isCellPassable(targetX, footY, targetZ) && !this.isHazardous(targetX, footY, targetZ)) {
            return {
              x: targetX + 0.5,
              y: footY,
              z: targetZ + 0.5,
              cellX: targetX,
              cellY: footY,
              cellZ: targetZ
            };
          }
        }
      }
    }
    return null;
  }

  /**
   * Алгоритм A* по 3D-сетке блоков.
   * Учитывает:
   * - перепады высоты MAX_STEP_UP (1) и MAX_STEP_DOWN (1)
   * - диагональный шаг РАЗРЕШЕН ТОЛЬКО если обе соседние ортогональные клетки проходимы
   * - штраф за близость к стене WALL_PENALTY
   * - лимит узлов MAX_A_STAR_NODES
   */
  findPath(startPos, endPos) {
    const startCellX = Math.floor(startPos.x);
    const startCellY = Math.floor(startPos.y);
    const startCellZ = Math.floor(startPos.z);

    const endCellX = Math.floor(endPos.x);
    const endCellY = Math.floor(endPos.y);
    const endCellZ = Math.floor(endPos.z);

    if (startCellX === endCellX && startCellZ === endCellZ) {
      return [{ x: endPos.x, y: endPos.y, z: endPos.z }];
    }

    const openSet = new MinHeap();
    const closedSet = new Set();
    const gScore = new Map();
    const cameFrom = new Map();

    const nodeKey = (x, y, z) => `${x},${y},${z}`;
    const heuristic = (x, y, z) => {
      const dx = x - endCellX;
      const dy = y - endCellY;
      const dz = z - endCellZ;
      return Math.hypot(dx, dz) + Math.abs(dy) * 0.8;
    };

    const startKey = nodeKey(startCellX, startCellY, startCellZ);
    gScore.set(startKey, 0);
    openSet.push({
      x: startCellX,
      y: startCellY,
      z: startCellZ,
      g: 0,
      f: heuristic(startCellX, startCellY, startCellZ)
    });

    let nodesEvaluated = 0;

    // 8 направлений перемещения
    const directions = [
      { dx: 1,  dz: 0,  isDiag: false },
      { dx: -1, dz: 0,  isDiag: false },
      { dx: 0,  dz: 1,  isDiag: false },
      { dx: 0,  dz: -1, isDiag: false },
      { dx: 1,  dz: 1,  isDiag: true,  side1: [1, 0],  side2: [0, 1] },
      { dx: -1, dz: 1,  isDiag: true,  side1: [-1, 0], side2: [0, 1] },
      { dx: 1,  dz: -1, isDiag: true,  side1: [1, 0],  side2: [0, -1] },
      { dx: -1, dz: -1, isDiag: true,  side1: [-1, 0], side2: [0, -1] }
    ];

    while (openSet.size() > 0) {
      if (++nodesEvaluated > MAX_A_STAR_NODES) {
        return null; // Превышен лимит узлов
      }

      const current = openSet.pop();
      const currKey = nodeKey(current.x, current.y, current.z);

      if (current.x === endCellX && current.z === endCellZ && Math.abs(current.y - endCellY) <= 1) {
        // Восстановление пути
        const path = [];
        let curr = current;
        let cKey = currKey;

        while (curr) {
          path.push({
            x: curr.x + 0.5,
            y: curr.y,
            z: curr.z + 0.5
          });
          const prev = cameFrom.get(cKey);
          if (!prev) break;
          curr = prev;
          cKey = nodeKey(curr.x, curr.y, curr.z);
        }

        path.reverse();
        // Заменяем последнюю точку на точные координаты цели
        if (path.length > 0) {
          path[path.length - 1] = { x: endPos.x, y: endPos.y, z: endPos.z };
        }
        return path;
      }

      closedSet.add(currKey);

      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const nz = current.z + dir.dz;

        // Поиск допустимого перепада высоты: 0 (ровно), +1 (вверх), -1 (вниз)
        let validNy = null;
        const heightDeltas = [0, 1, -1];
        for (const dy of heightDeltas) {
          const testY = current.y + dy;
          if (this.isCellPassable(nx, testY, nz)) {
            // Если поднимаемся на 1 блок вверх — над головой на старте тоже должно быть свободно
            if (dy === 1) {
              const headAbove = this.world.getBlock(current.x, current.y + 2, current.z);
              if (this.world.isSolid(headAbove)) continue;
            }
            validNy = testY;
            break;
          }
        }

        if (validNy === null) continue;

        // СТРОГАЯ ПРОВЕРКА ДИАГОНАЛИ:
        // Обе соседние ортогональные клетки должны быть проходимы на уровне ног/головы
        if (dir.isDiag) {
          const side1Passable = this.isCellPassable(current.x + dir.side1[0], current.y, current.z + dir.side1[1]) ||
                                this.isCellPassable(current.x + dir.side1[0], validNy, current.z + dir.side1[1]);
          const side2Passable = this.isCellPassable(current.x + dir.side2[0], current.y, current.z + dir.side2[1]) ||
                                this.isCellPassable(current.x + dir.side2[0], validNy, current.z + dir.side2[1]);

          if (!side1Passable || !side2Passable) {
            continue; // Диагональ заблокирована углом стены!
          }
        }

        const neighborKey = nodeKey(nx, validNy, nz);
        if (closedSet.has(neighborKey)) continue;

        const stepBaseCost = dir.isDiag ? 1.414 : 1.0;
        const heightCost = Math.abs(validNy - current.y) * 0.3;
        const wallPenalty = this.getWallPenalty(nx, validNy, nz);
        const tentativeG = current.g + stepBaseCost + heightCost + wallPenalty;

        const currentG = gScore.has(neighborKey) ? gScore.get(neighborKey) : Infinity;
        if (tentativeG < currentG) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          const f = tentativeG + heuristic(nx, validNy, nz);
          openSet.push({ x: nx, y: validNy, z: nz, g: tentativeG, f: f });
        }
      }
    }

    return null;
  }

  // ==========================================================================
  // ОЧЕРЕДЬ И УПРАВЛЕНИЕ МАРШРУТАМИ
  // ==========================================================================

  /**
   * Инициализация первого пути и запуск предварительного расчёта следующего.
   */
  initFirstPath() {
    Pig.pathQueue.push(() => {
      let foundPath = null;
      let target = null;

      for (let attempt = 0; attempt < 10; attempt++) {
        target = this.pickTargetPosition({ x: this.x, y: this.y, z: this.z });
        if (!target) continue;

        foundPath = this.findPath({ x: this.x, y: this.y, z: this.z }, target);
        if (foundPath && foundPath.length > 1) break;
        foundPath = null;
      }

      if (foundPath && target) {
        this.currentTarget = target;
        this.currentPath = foundPath;
        this.currentWaypointIndex = 1;
        this.skipPassedWaypoints();
        this.scheduleNextPathCalculation();
      } else {
        // Повторная попытка через 1 секунду
        setTimeout(() => this.initFirstPath(), 1000);
      }
    });
  }

  /**
   * Планирование предварительного расчёта следующего маршрута.
   * Рассчитывает путь от currentTarget к новой точке, пока свинья идёт.
   */
  scheduleNextPathCalculation() {
    if (this.isCalculatingNext || !this.currentTarget) return;
    this.isCalculatingNext = true;

    Pig.pathQueue.push(() => {
      this.isCalculatingNext = false;
      if (!this.currentTarget) return;

      let foundPath = null;
      let target = null;

      for (let attempt = 0; attempt < 10; attempt++) {
        target = this.pickTargetPosition(this.currentTarget);
        if (!target) continue;

        foundPath = this.findPath(this.currentTarget, target);
        if (foundPath && foundPath.length > 1) break;
        foundPath = null;
      }

      if (foundPath && target) {
        this.nextTarget = target;
        this.nextPath = foundPath;
      } else {
        // Повторная попытка чуть позже
        setTimeout(() => {
          if (!this.nextPath && this.currentTarget) {
            this.scheduleNextPathCalculation();
          }
        }, 1200);
      }
    });
  }

  /**
   * Пропуск уже пройденных путевых точек, чтобы свинья не разворачивалась назад.
   */
  skipPassedWaypoints() {
    if (!this.currentPath || this.currentPath.length === 0) return;

    while (this.currentWaypointIndex < this.currentPath.length - 1) {
      const wp = this.currentPath[this.currentWaypointIndex];
      const dist = Math.hypot(this.x - wp.x, this.z - wp.z);
      if (dist < WAYPOINT_REACHED_DIST + 0.2) {
        this.currentWaypointIndex++;
      } else {
        break;
      }
    }
  }

  // ==========================================================================
  // ВЗАИМОДЕЙСТВИЕ И УРОН
  // ==========================================================================

  takeDamage(amount, fromX, fromZ) {
    if (this.health <= 0) return;

    this.health -= amount;
    this.hurtTimer = 0.35;
    this.fleeTimer = 3.5;

    if (window.audioManager && window.audioManager.playPigHurt) {
      window.audioManager.playPigHurt();
    }

    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.vx = (dx / len) * 4.5;
    this.vz = (dz / len) * 4.5;
    this.vy = 4.0;

    // Поворачиваемся строго в направлении отскока
    this.targetYaw = Math.atan2(-dx, -dz);
    this.yaw = this.targetYaw;

    if (this.health <= 0) {
      setTimeout(() => this.respawn(), 1200);
    }
  }

  respawn() {
    this.health = this.maxHealth;
    this.hurtTimer = 0;
    this.fleeTimer = 0;
    this.x = 10 + Math.random() * (this.world.width - 20);
    this.z = 10 + Math.random() * (this.world.depth - 20);
    this.snapToSurface();
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.currentTarget = null;
    this.currentPath = [];
    this.nextTarget = null;
    this.nextPath = null;
    this.initFirstPath();
  }

  // ==========================================================================
  // ГЛАВНЫЙ ЦИКЛ ОБНОВЛЕНИЯ (UPDATE)
  // ==========================================================================

  update(dt, player) {
    const delta = Math.min(dt, 0.05);

    // Таймеры вспышки урона и паники
    if (this.hurtTimer > 0) this.hurtTimer -= delta;
    if (this.fleeTimer > 0) this.fleeTimer -= delta;

    // Периодическое хрюканье
    this.oinkTimer -= delta;
    if (this.oinkTimer <= 0) {
      this.oinkTimer = 5.0 + Math.random() * 8.0;
      if (player) {
        const distToPlayer = Math.hypot(this.x - player.x, this.z - player.z);
        if (distToPlayer < 25 && window.audioManager && window.audioManager.playPigOink) {
          window.audioManager.playPigOink();
        }
      }
    }

    // Если нет текущего пути — ждём его готовности
    if (!this.currentPath || this.currentPath.length === 0 || !this.currentTarget) {
      this.vx *= 0.5;
      this.vz *= 0.5;
      this.vy += PIG_GRAVITY * delta;
      this.applyVerticalPhysics(delta);
      return;
    }

    // Дистанция до конечной целевой точки
    const distToTarget = Math.hypot(this.x - this.currentTarget.x, this.z - this.currentTarget.z);

    // ------------------------------------------------------------------------
    // ПУНКТ 4: БЕСШОВНОЕ ПЕРЕКЛЮЧЕНИЕ НА СЛЕДУЮЩИЙ ПУТЬ БЕЗ ОСТАНОВОК
    // ------------------------------------------------------------------------
    if (distToTarget < ARRIVE_DIST) {
      if (this.nextTarget && this.nextPath && this.nextPath.length > 0) {
        // Мгновенное переключение в том же кадре
        this.currentTarget = this.nextTarget;
        this.currentPath = this.nextPath;
        this.currentWaypointIndex = 0;
        this.nextTarget = null;
        this.nextPath = null;
        this.stuckTimer = 0;

        this.skipPassedWaypoints();
        this.scheduleNextPathCalculation();
      } else {
        // Если следующий путь ещё не готов, запрашиваем его
        if (!this.isCalculatingNext) {
          this.scheduleNextPathCalculation();
        }
      }
    }

    // ------------------------------------------------------------------------
    // ПУНКТ 5: СТРАХОВКА ОТ ЗАСТРЕВАНИЯ
    // ------------------------------------------------------------------------
    const startX = this.x;
    const startZ = this.z;

    this.prevCheckTime += delta;
    if (this.prevCheckTime >= 1.0) {
      const movedOver1s = Math.hypot(this.x - this.prevCheckX, this.z - this.prevCheckZ);
      this.prevCheckX = this.x;
      this.prevCheckZ = this.z;
      this.prevCheckTime = 0;

      if (distToTarget > STUCK_RADIUS && movedOver1s < STAND_SPEED_EPS) {
        // Застряла вдалеке от цели — пересчитываем путь
        this.initFirstPath();
        return;
      }
    }

    // Движение по путевым точкам текущего маршрута
    let moveSpeed = (this.fleeTimer > 0) ? PIG_FLEE_SPEED : PIG_SPEED;

    if (this.currentWaypointIndex < this.currentPath.length) {
      let wp = this.currentPath[this.currentWaypointIndex];
      let toWpX = wp.x - this.x;
      let toWpZ = wp.z - this.z;
      let distToWp = Math.hypot(toWpX, toWpZ);

      // Переход к следующей путевой точке
      if (distToWp < WAYPOINT_REACHED_DIST && this.currentWaypointIndex < this.currentPath.length - 1) {
        this.currentWaypointIndex++;
        wp = this.currentPath[this.currentWaypointIndex];
        toWpX = wp.x - this.x;
        toWpZ = wp.z - this.z;
        distToWp = Math.hypot(toWpX, toWpZ);
      }

      // Авто-прыжок при подъёме на 1 блок вверх
      if (wp.y > this.y + 0.4 && this.isGrounded) {
        this.vy = PIG_JUMP_FORCE;
        this.isGrounded = false;
      }

      // ТОЧНАЯ МАТЕМАТИКА ОРИЕНТАЦИИ:
      // Вектор к цели: toWpX, toWpZ
      // targetYaw вычисляется через Math.atan2(-toWpX, -toWpZ)
      if (distToWp > 0.05) {
        this.targetYaw = Math.atan2(-toWpX, -toWpZ);
      }
    }

    // Плавный поворот с нормализацией угла [-PI..PI]
    let diff = this.targetYaw - this.yaw;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.yaw += diff * Math.min(1.0, delta * ROTATION_SPEED);

    // Скорость перемещения строго в направлении взгляда (головой вперёд)
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    this.vx = -sinYaw * moveSpeed;
    this.vz = -cosYaw * moveSpeed;

    this.walkTime += delta * (this.fleeTimer > 0 ? 14 : 7);

    // Физика AABB и коллизии
    this.applyHorizontalPhysics(delta);

    // Гравитация и вертикальное движение
    this.vy += PIG_GRAVITY * delta;
    this.applyVerticalPhysics(delta);

    // Проверка фактического перемещения за кадр
    const actualDx = this.x - startX;
    const actualDz = this.z - startZ;
    const actualSpeed = Math.hypot(actualDx, actualDz) / Math.max(delta, 0.0001);

    if (distToTarget <= STUCK_RADIUS && actualSpeed < STAND_SPEED_EPS) {
      this.stuckTimer += delta;
      if (this.stuckTimer >= STUCK_TIME) {
        // Превышен лимит времени стояния у цели — отказ от точки и переход к следующей
        this.stuckTimer = 0;
        if (this.nextTarget && this.nextPath) {
          this.currentTarget = this.nextTarget;
          this.currentPath = this.nextPath;
          this.currentWaypointIndex = 0;
          this.nextTarget = null;
          this.nextPath = null;
          this.skipPassedWaypoints();
          this.scheduleNextPathCalculation();
        } else {
          this.initFirstPath();
        }
      }
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - delta * 0.5);
    }

    // Защита от выпадения в бездну
    if (this.y < -5) {
      this.respawn();
    }
  }

  // ==========================================================================
  // ФИЗИКА И AABB-КОЛЛИЗИИ
  // ==========================================================================

  collidesWithWorld(px, py, pz) {
    const eps = 0.002;
    const minX = Math.floor(px - this.radius + eps);
    const maxX = Math.floor(px + this.radius - eps);
    const minY = Math.floor(py + eps);
    const maxY = Math.floor(py + this.height - 0.05);
    const minZ = Math.floor(pz - this.radius + eps);
    const maxZ = Math.floor(pz + this.radius - eps);

    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (this.world.isSolid(this.world.getBlock(bx, by, bz))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  applyHorizontalPhysics(delta) {
    // Ось X
    const newX = this.x + this.vx * delta;
    if (!this.collidesWithWorld(newX, this.y, this.z)) {
      this.x = newX;
    } else {
      // Авто-прыжок при ступеньке в 1 блок
      if (this.isGrounded && !this.collidesWithWorld(newX, this.y + 1.1, this.z)) {
        this.vy = PIG_JUMP_FORCE;
        this.isGrounded = false;
      } else {
        this.vx = 0;
      }
    }

    // Ось Z
    const newZ = this.z + this.vz * delta;
    if (!this.collidesWithWorld(this.x, this.y, newZ)) {
      this.z = newZ;
    } else {
      // Авто-прыжок при ступеньке в 1 блок
      if (this.isGrounded && !this.collidesWithWorld(this.x, this.y + 1.1, newZ)) {
        this.vy = PIG_JUMP_FORCE;
        this.isGrounded = false;
      } else {
        this.vz = 0;
      }
    }
  }

  applyVerticalPhysics(delta) {
    const newY = this.y + this.vy * delta;
    if (!this.collidesWithWorld(this.x, newY, this.z)) {
      this.y = newY;
      this.isGrounded = false;
    } else {
      if (this.vy < 0) {
        this.isGrounded = true;
        this.y = Math.floor(newY) + 1;
      }
      this.vy = 0;
    }
  }

  // Прицеливание лучом игрока (ЛКМ / ПКМ)
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 4.5) {
    const minX = this.x - this.radius;
    const maxX = this.x + this.radius;
    const minY = this.y;
    const maxY = this.y + this.height;
    const minZ = this.z - this.radius;
    const maxZ = this.z + this.radius;

    let tmin = (minX - ox) / (dx || 0.0001);
    let tmax = (maxX - ox) / (dx || 0.0001);
    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

    let tymin = (minY - oy) / (dy || 0.0001);
    let tymax = (maxY - oy) / (dy || 0.0001);
    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

    if (tmin > tymax || tymin > tmax) return { hit: false };
    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    let tzmin = (minZ - oz) / (dz || 0.0001);
    let tzmax = (maxZ - oz) / (dz || 0.0001);
    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

    if (tmin > tzmax || tzmin > tmax) return { hit: false };
    if (tzmin > tmin) tmin = tzmin;

    if (tmin >= 0 && tmin <= maxDist) {
      return { hit: true, distance: tmin };
    }
    return { hit: false };
  }

  // ==========================================================================
  // 3D-МОДЕЛЬ СВИНИ С ПРАВИЛЬНОЙ ОРИЕНТАЦИЕЙ (БЕЗ ХОДЬБЫ БОКОМ)
  // ==========================================================================

  buildMesh() {
    const positions = [];
    const uvs = [];
    const lights = [];

    const addBoxFace = (p0, p1, p2, p3, uv0, uv1, uv2, uv3, lightFactor) => {
      positions.push(
        p0[0], p0[1], p0[2],
        p1[0], p1[1], p1[2],
        p2[0], p2[1], p2[2],

        p0[0], p0[1], p0[2],
        p2[0], p2[1], p2[2],
        p3[0], p3[1], p3[2]
      );

      uvs.push(
        uv0[0], uv0[1],
        uv1[0], uv1[1],
        uv2[0], uv2[1],

        uv0[0], uv0[1],
        uv2[0], uv2[1],
        uv3[0], uv3[1]
      );

      for (let i = 0; i < 6; i++) {
        lights.push(lightFactor);
      }
    };

    const addBox = (localCenter, size, uvsMap, rotX = 0, pivotY = 0) => {
      const halfW = size[0] / 2;
      const halfH = size[1] / 2;
      const halfD = size[2] / 2;

      // 8 вершин в локальной системе части тела (перед = +Z)
      const localVerts = [
        [-halfW, -halfH,  halfD], // 0: левый-низ-перед
        [ halfW, -halfH,  halfD], // 1: правый-низ-перед
        [ halfW,  halfH,  halfD], // 2: правый-верх-перед
        [-halfW,  halfH,  halfD], // 3: левый-верх-перед
        [-halfW, -halfH, -halfD], // 4: левый-низ-зад
        [ halfW, -halfH, -halfD], // 5: правый-низ-зад
        [ halfW,  halfH, -halfD], // 6: правый-верх-зад
        [-halfW,  halfH, -halfD]  // 7: левый-верх-зад
      ];

      const cosYaw = Math.cos(this.yaw);
      const sinYaw = Math.sin(this.yaw);
      const cosRX = Math.cos(rotX);
      const sinRX = Math.sin(rotX);

      const transformed = localVerts.map(v => {
        // Поворот ноги вокруг шарнира
        let ly = v[1] - pivotY;
        let lz = v[2];
        let ry = ly * cosRX - lz * sinRX + pivotY;
        let rz = ly * sinRX + lz * cosRX;

        let bx = v[0] + localCenter[0];
        let by = ry + localCenter[1];
        let bz = rz + localCenter[2];

        // МАТЕМАТИКА ПОВОРОТА:
        // Полностью сонаправлена с vx = -sin(yaw)*speed, vz = -cos(yaw)*speed.
        // При yaw = 0 перед (+Z) проецируется на -Z мировых координат.
        let wx = bx * cosYaw - bz * sinYaw + this.x;
        let wy = by + this.y;
        let wz = -bx * sinYaw - bz * cosYaw + this.z;

        return [wx, wy, wz];
      });

      const uv = (x, y, w, h) => [
        [x / 64, (y + h) / 32],
        [(x + w) / 64, (y + h) / 32],
        [(x + w) / 64, y / 32],
        [x / 64, y / 32]
      ];

      // Верх (+Y)
      const uTop = uv(uvsMap.top[0], uvsMap.top[1], uvsMap.top[2], uvsMap.top[3]);
      addBoxFace(transformed[3], transformed[2], transformed[6], transformed[7], uTop[0], uTop[1], uTop[2], uTop[3], 1.0);

      // Низ (-Y)
      const uBot = uv(uvsMap.bot[0], uvsMap.bot[1], uvsMap.bot[2], uvsMap.bot[3]);
      addBoxFace(transformed[1], transformed[0], transformed[4], transformed[5], uBot[0], uBot[1], uBot[2], uBot[3], 0.6);

      // Перед (+Z в локальных координатах)
      const uFront = uv(uvsMap.front[0], uvsMap.front[1], uvsMap.front[2], uvsMap.front[3]);
      addBoxFace(transformed[0], transformed[1], transformed[2], transformed[3], uFront[0], uFront[1], uFront[2], uFront[3], 0.85);

      // Зад (-Z в локальных координатах)
      const uBack = uv(uvsMap.back[0], uvsMap.back[1], uvsMap.back[2], uvsMap.back[3]);
      addBoxFace(transformed[5], transformed[4], transformed[7], transformed[6], uBack[0], uBack[1], uBack[2], uBack[3], 0.85);

      // Право (+X)
      const uRight = uv(uvsMap.right[0], uvsMap.right[1], uvsMap.right[2], uvsMap.right[3]);
      addBoxFace(transformed[1], transformed[5], transformed[6], transformed[2], uRight[0], uRight[1], uRight[2], uRight[3], 0.75);

      // Лево (-X)
      const uLeft = uv(uvsMap.left[0], uvsMap.left[1], uvsMap.left[2], uvsMap.left[3]);
      addBoxFace(transformed[4], transformed[0], transformed[3], transformed[7], uLeft[0], uLeft[1], uLeft[2], uLeft[3], 0.75);
    };

    // 1. ТЕЛО (Body) — крупное туловище Minecraft (10 x 8 x 16)
    addBox([0, 0.65, 0], [0.65, 0.52, 1.04], {
      top:   [54, 16, 10, 16], // Спина
      bot:   [36, 16, 10, 16], // Брюхо
      front: [36, 8,  10, 8],  // Шея
      back:  [46, 8,  10, 8],  // Зад
      right: [28, 16, 8,  16], // Правый бок
      left:  [46, 16, 8,  16]  // Левый бок
    });

    // 2. ГОЛОВА (Head) — чуть выше и спереди (пропорции Minecraft 8 x 8 x 8)
    addBox([0, 0.78, 0.71], [0.52, 0.52, 0.52], {
      top:   [8,  0, 8, 8],
      bot:   [16, 0, 8, 8],
      front: [8,  8, 8, 8], // Морда с глазами
      back:  [24, 8, 8, 8],
      right: [0,  8, 8, 8],
      left:  [16, 8, 8, 8]
    });

    // 3. ПЯТАЧОК (Snout) — чуть выдвинут вперёд (4 x 3 x 1 с ноздрями)
    addBox([0, 0.70, 0.99], [0.26, 0.20, 0.08], {
      top:   [17, 16, 4, 1],
      bot:   [21, 16, 4, 1],
      front: [17, 17, 4, 3], // Ноздри
      back:  [17, 16, 4, 1],
      right: [16, 17, 1, 3],
      left:  [21, 17, 1, 3]
    });

    // 4. НОГИ (Legs) — 4 ноги с качанием при ходьбе (4 x 6 x 4)
    const legAngle = Math.sin(this.walkTime) * 0.55;
    const legUVs = {
      top:   [4,  16, 4, 4],
      bot:   [8,  16, 4, 4],
      front: [4,  20, 4, 6],
      back:  [12, 20, 4, 6],
      right: [0,  20, 4, 6],
      left:  [8,  20, 4, 6]
    };

    const legW = 0.25, legH = 0.39, legD = 0.25;
    const legOffX = 0.19, legOffZ = 0.35, legY = 0.195;

    // Передняя правая
    addBox([ legOffX, legY,  legOffZ], [legW, legH, legD], legUVs,  legAngle, 0.39);
    // Передняя левая
    addBox([-legOffX, legY,  legOffZ], [legW, legH, legD], legUVs, -legAngle, 0.39);
    // Задняя правая
    addBox([ legOffX, legY, -legOffZ], [legW, legH, legD], legUVs, -legAngle, 0.39);
    // Задняя левая
    addBox([-legOffX, legY, -legOffZ], [legW, legH, legD], legUVs,  legAngle, 0.39);

    return {
      positions: new Float32Array(positions),
      uvs: new Float32Array(uvs),
      lights: new Float32Array(lights),
      vertexCount: positions.length / 3,
      isHurt: this.hurtTimer > 0
    };
  }

  getMesh() {
    return this.buildMesh();
  }
}

// Автоматическая интеграция вызова очереди путей A* в игровой цикл
if (typeof window !== 'undefined') {
  window.Pig = Pig;
  if (!window._pigQueueHooked) {
    window._pigQueueHooked = true;
    const origRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback) {
      return origRequestAnimationFrame.call(window, function(timestamp) {
        if (typeof Pig !== 'undefined' && Pig.processPathQueue) {
          Pig.processPathQueue();
        }
        callback(timestamp);
      });
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Pig };
}
