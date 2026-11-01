/**
 * Алгоритм быстрого обхода воксельной сетки (Fast Voxel Traversal / DDA)
 * Реализация алгоритма Аманатидеса и Ву (Amanatides & Woo).
 * Позволяет со 100% точностью определить блок, на который смотрит игрок,
 * и грань (нормаль) блока для установки нового блока.
 */

class VoxelRaycaster {
  static raycast(world, originX, originY, originZ, dirX, dirY, dirZ, maxDistance = 6.0) {
    let x = Math.floor(originX);
    let y = Math.floor(originY);
    let z = Math.floor(originZ);

    const stepX = dirX > 0 ? 1 : (dirX < 0 ? -1 : 0);
    const stepY = dirY > 0 ? 1 : (dirY < 0 ? -1 : 0);
    const stepZ = dirZ > 0 ? 1 : (dirZ < 0 ? -1 : 0);

    const tDeltaX = dirX !== 0 ? Math.abs(1 / dirX) : Infinity;
    const tDeltaY = dirY !== 0 ? Math.abs(1 / dirY) : Infinity;
    const tDeltaZ = dirZ !== 0 ? Math.abs(1 / dirZ) : Infinity;

    let tMaxX = dirX > 0 ? (Math.floor(originX) + 1 - originX) * tDeltaX : (originX - Math.floor(originX)) * tDeltaX;
    let tMaxY = dirY > 0 ? (Math.floor(originY) + 1 - originY) * tDeltaY : (originY - Math.floor(originY)) * tDeltaY;
    let tMaxZ = dirZ > 0 ? (Math.floor(originZ) + 1 - originZ) * tDeltaZ : (originZ - Math.floor(originZ)) * tDeltaZ;

    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;

    let currentDist = 0;

    while (currentDist <= maxDistance) {
      // Проверяем блок в текущих координатах
      const block = world.getBlock(x, y, z);
      if (block !== BLOCK_TYPES.AIR) {
        return {
          hit: true,
          x, y, z,
          face: { x: normalX, y: normalY, z: normalZ },
          blockId: block,
          distance: currentDist
        };
      }

      // Переходим к следующей воксельной ячейке
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          currentDist = tMaxX;
          tMaxX += tDeltaX;
          normalX = -stepX;
          normalY = 0;
          normalZ = 0;
        } else {
          z += stepZ;
          currentDist = tMaxZ;
          tMaxZ += tDeltaZ;
          normalX = 0;
          normalY = 0;
          normalZ = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          currentDist = tMaxY;
          tMaxY += tDeltaY;
          normalX = 0;
          normalY = -stepY;
          normalZ = 0;
        } else {
          z += stepZ;
          currentDist = tMaxZ;
          tMaxZ += tDeltaZ;
          normalX = 0;
          normalY = 0;
          normalZ = -stepZ;
        }
      }
    }

    return { hit: false };
  }
}
