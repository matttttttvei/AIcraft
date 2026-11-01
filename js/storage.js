/**
 * Модуль сохранения и загрузки воксельного мира.
 * Поддерживает сохранение в LocalStorage браузера,
 * а также экспорт и импорт в виде компактного JSON-файла.
 */

class WorldStorage {
  // Сохранить текущее состояние в LocalStorage браузера
  static saveToLocalStorage(world, player) {
    try {
      const data = this.serializeWorld(world, player);
      localStorage.setItem('voxel_craft_save', JSON.stringify(data));
      return { success: true, message: 'Мир успешно сохранен в браузере!' };
    } catch (e) {
      console.error(e);
      return { success: false, message: 'Ошибка сохранения: ' + e.message };
    }
  }

  // Загрузить состояние из LocalStorage браузера
  static loadFromLocalStorage(world, player) {
    try {
      const raw = localStorage.getItem('voxel_craft_save');
      if (!raw) {
        return { success: false, message: 'Сохраненный мир не найден в браузере.' };
      }
      const data = JSON.parse(raw);
      this.deserializeWorld(data, world, player);
      return { success: true, message: 'Мир успешно загружен!' };
    } catch (e) {
      console.error(e);
      return { success: false, message: 'Ошибка загрузки: ' + e.message };
    }
  }

  // Экспорт мира в загружаемый JSON-файл
  static exportToFile(world, player) {
    try {
      const data = this.serializeWorld(world, player);
      const jsonStr = JSON.stringify(data);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `voxel_world_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true, message: 'Файл мира скачивается на компьютер.' };
    } catch (e) {
      console.error(e);
      return { success: false, message: 'Ошибка экспорта файла.' };
    }
  }

  // Импорт мира из выбранного пользователем JSON-файла
  static importFromFile(file, world, player, onComplete) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        WorldStorage.deserializeWorld(data, world, player);
        if (onComplete) onComplete({ success: true, message: 'Мир из файла успешно загружен!' });
      } catch (err) {
        if (onComplete) onComplete({ success: false, message: 'Неверный формат файла мира!' });
      }
    };
    reader.readAsText(file);
  }

  // Сериализация воксельного мира и игрока в JSON-объект
  static serializeWorld(world, player) {
    // Преобразуем Uint8Array в строку base64 для компактности
    let binary = '';
    const bytes = world.blocks;
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Blocks = btoa(binary);

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      dimensions: {
        width: world.width,
        height: world.height,
        depth: world.depth
      },
      blocks: base64Blocks,
      player: {
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw,
        pitch: player.pitch
      }
    };
  }

  // Восстановление воксельного мира и игрока из сериализованного объекта
  static deserializeWorld(data, world, player) {
    if (!data.blocks || !data.dimensions) {
      throw new Error('Поврежденные данные сохранения');
    }

    // Декодируем base64 обратно в Uint8Array
    const binary = atob(data.blocks);
    const len = binary.length;
    const blocks = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      blocks[i] = binary.charCodeAt(i);
    }

    world.blocks.set(blocks);
    world.isDirty = true;

    if (data.player && player) {
      player.x = data.player.x;
      player.y = data.player.y;
      player.z = data.player.z;
      player.yaw = data.player.yaw || 0;
      player.pitch = data.player.pitch || 0;
      player.vx = 0;
      player.vy = 0;
      player.vz = 0;
    }
  }
}
