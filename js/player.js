/**
 * Модуль игрока: управление от первого лица, физика, гравитация,
 * прыжки и AABB-коллизии с воксельным миром.
 */

class Player {
  constructor(world, x = 24, y = 20, z = 24) {
    this.world = world;

    // Координаты основания игрока (ноги)
    this.x = x;
    this.y = y;
    this.z = z;

    // Скорости
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;

    // Параметры хитбокса (AABB)
    this.radius = 0.3; // Полуширина (диаметр 0.6м)
    this.height = 1.8; // Высота игрока
    this.eyeHeight = 1.62; // Уровень глаз

    // Углы обзора (в радианах)
    this.yaw = 0;
    this.pitch = 0;

    // Физические константы
    this.speed = 4.8;
    this.jumpForce = 8.5;
    this.gravity = -24.0;
    this.isGrounded = false;

    // Состояние клавиш
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false
    };

    // Чувствительность мыши
    this.sensitivity = 0.0022;
  }

  // Получить координаты глаз для камеры
  getEyePosition() {
    return [this.x, this.y + this.eyeHeight, this.z];
  }

  // Получить нормализованный вектор взгляда
  getDirection() {
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);

    return [
      -sinYaw * cosPitch,
      sinPitch,
      -cosYaw * cosPitch
    ];
  }

  // Обработка движения мыши
  onMouseMove(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;

    // Ограничение вертикального угла обзора (чтобы не переворачивалась камера)
    const maxPitch = Math.PI * 0.49;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
  }

  // Проверка пересечения хитбокса игрока с твердыми блоками
  collidesWithWorld(px, py, pz) {
    const minX = Math.floor(px - this.radius);
    const maxX = Math.floor(px + this.radius);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + this.height - 0.01);
    const minZ = Math.floor(pz - this.radius);
    const maxZ = Math.floor(pz + this.radius);

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

  // Обновление физики и положения игрока каждый кадр
  update(dt) {
    // Ограничиваем dt при просадках кадров
    const delta = Math.min(dt, 0.05);

    // Расчет вектора горизонтального движения
    let moveForward = 0;
    let moveRight = 0;

    if (this.keys.forward) moveForward += 1;
    if (this.keys.backward) moveForward -= 1;
    if (this.keys.right) moveRight += 1;
    if (this.keys.left) moveRight -= 1;

    // Нормализация вектора движения при одновременном нажатии двух клавиш
    const moveLen = Math.hypot(moveForward, moveRight);
    let wishDirX = 0;
    let wishDirZ = 0;

    if (moveLen > 0.001) {
      const normF = moveForward / moveLen;
      const normR = moveRight / moveLen;

      const cosYaw = Math.cos(this.yaw);
      const sinYaw = Math.sin(this.yaw);

      // Вперед: [-sin(yaw), -cos(yaw)], Вправо: [cos(yaw), -sin(yaw)]
      wishDirX = normF * -sinYaw + normR * cosYaw;
      wishDirZ = normF * -cosYaw + normR * -sinYaw;
    }

    this.vx = wishDirX * this.speed;
    this.vz = wishDirZ * this.speed;

    // Прыжок
    if (this.keys.jump && this.isGrounded) {
      this.vy = this.jumpForce;
      this.isGrounded = false;
      if (window.audioManager) window.audioManager.playJump();
    }

    // Применение гравитации
    this.vy += this.gravity * delta;

    // --- Раздельное разрешение AABB коллизий по осям (X, Z, Y) ---

    // 1. Движение по оси X
    const newX = this.x + this.vx * delta;
    if (!this.collidesWithWorld(newX, this.y, this.z)) {
      this.x = newX;
    } else {
      this.vx = 0;
    }

    // 2. Движение по оси Z
    const newZ = this.z + this.vz * delta;
    if (!this.collidesWithWorld(this.x, this.y, newZ)) {
      this.z = newZ;
    } else {
      this.vz = 0;
    }

    // 3. Движение по оси Y (вертикаль)
    const newY = this.y + this.vy * delta;
    if (!this.collidesWithWorld(this.x, newY, this.z)) {
      this.y = newY;
      this.isGrounded = false;
    } else {
      if (this.vy < 0) {
        // Падение на блок: приземление
        this.isGrounded = true;
        this.y = Math.floor(newY) + 1; // Точная фиксация на поверхности
      }
      this.vy = 0;
    }

    // Защита от выпадения за пределы мира (спавн сверху)
    if (this.y < -5) {
      this.respawn();
    }
  }

  // Возврат игрока на верхнюю безопасную точку
  respawn() {
    this.x = Math.floor(this.world.width / 2) + 0.5;
    this.z = Math.floor(this.world.depth / 2) + 0.5;
    this.y = this.world.height - 2;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
  }
}
