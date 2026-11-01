/**
 * Главный файл приложения: связывает компоненты, обрабатывает ввод
 * пользователя, управляет игровым циклом (Game Loop) и обновлением интерфейса.
 */

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');
  const overlay = document.getElementById('overlay');
  const hotbarContainer = document.getElementById('hotbar');
  const toast = document.getElementById('toast');
  const debugInfo = document.getElementById('debugInfo');
  const targetInfo = document.getElementById('targetInfo');
  const fileInput = document.getElementById('fileInput');
  const firstPersonHand = document.getElementById('firstPersonHand');
  const handItem = document.getElementById('handItem');
  const progressSvg = document.getElementById('progressSvg');
  const progressCircle = document.getElementById('progressCircle');

  // Время разрушения (в секундах) для разных типов блоков
  const BLOCK_HARDNESS = {
    [BLOCK_TYPES.LEAVES]: 0.22,
    [BLOCK_TYPES.GLASS]: 0.35,
    [BLOCK_TYPES.SAND]: 0.45,
    [BLOCK_TYPES.DIRT]: 0.60,
    [BLOCK_TYPES.GRASS]: 0.65,
    [BLOCK_TYPES.WOOD_PLANKS]: 0.85,
    [BLOCK_TYPES.WOOD_LOG]: 1.10,
    [BLOCK_TYPES.STONE]: 1.35,
    [BLOCK_TYPES.COAL_ORE]: 1.40,
    [BLOCK_TYPES.IRON_ORE]: 1.50,
    [BLOCK_TYPES.LAPIS_ORE]: 1.50,
    [BLOCK_TYPES.BRICK]: 1.50,
    [BLOCK_TYPES.GOLD_ORE]: 1.60,
    [BLOCK_TYPES.REDSTONE_ORE]: 1.60,
    [BLOCK_TYPES.EMERALD_ORE]: 1.70,
    [BLOCK_TYPES.DIAMOND_ORE]: 1.80,
    [BLOCK_TYPES.BEDROCK]: Infinity // Бедрок несокрушим
  };

  // 1. Инициализация ключевых компонентов
  const textureManager = new TextureManager();
  const world = new VoxelWorld(48, 32, 48);
  const renderer = new WebGLRenderer(canvas);
  const player = new Player(world, 24.5, 20, 24.5);

  renderer.loadTextureAtlas(textureManager);

  // Создаем моба свинью (прямо в поле зрения игрока)
  const mobs = [
    new Pig(world, 24.5, 20, 20.5)
  ];

  // Загрузка текстур блоков и стадий разрушения напрямую из папки assets/
  textureManager.loadFromAssets(() => {
    renderer.loadTextureAtlas(textureManager);
    createHotbar();
    updateHandTextures(availableBlocks[activeSlotIndex]);
    world.isDirty = true;
  });

  // Загрузка текстуры свиньи из assets/entity/pig/pig.png
  textureManager.loadPigTexture((img) => {
    renderer.loadPigTexture(img);
  });

  // 2. Генерация начального мира
  world.generate();
  player.respawn();
  mobs.forEach(m => m.snapToSurface());

  // 3. Настройка слотов панели быстрого доступа (Hotbar)
  const availableBlocks = [
    BLOCK_TYPES.GRASS,
    BLOCK_TYPES.DIRT,
    BLOCK_TYPES.STONE,
    BLOCK_TYPES.COAL_ORE,
    BLOCK_TYPES.IRON_ORE,
    BLOCK_TYPES.GOLD_ORE,
    BLOCK_TYPES.DIAMOND_ORE,
    BLOCK_TYPES.REDSTONE_ORE,
    BLOCK_TYPES.EMERALD_ORE,
    BLOCK_TYPES.LAPIS_ORE,
    BLOCK_TYPES.WOOD_LOG,
    BLOCK_TYPES.WOOD_PLANKS,
    BLOCK_TYPES.LEAVES,
    BLOCK_TYPES.SAND,
    BLOCK_TYPES.BRICK,
    BLOCK_TYPES.GLASS,
    BLOCK_TYPES.BEDROCK
  ];

  let activeSlotIndex = 0;

  function createHotbar() {
    hotbarContainer.innerHTML = '';
    availableBlocks.forEach((blockType, idx) => {
      const slot = document.createElement('div');
      slot.className = `hotbar-slot ${idx === activeSlotIndex ? 'active' : ''}`;
      slot.setAttribute('data-index', idx);

      const iconImg = document.createElement('img');
      iconImg.src = textureManager.getBlockIcon(blockType);
      iconImg.alt = BLOCK_NAMES[blockType];

      const numBadge = document.createElement('span');
      numBadge.className = 'slot-key';
      if (idx < 9) numBadge.textContent = (idx + 1);
      else if (idx === 9) numBadge.textContent = '0';
      else numBadge.textContent = '';

      slot.appendChild(iconImg);
      if (numBadge.textContent) slot.appendChild(numBadge);

      slot.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSlot(idx);
      });

      hotbarContainer.appendChild(slot);
    });
  }

  function selectSlot(index) {
    if (index < 0 || index >= availableBlocks.length) return;
    activeSlotIndex = index;
    const slots = hotbarContainer.querySelectorAll('.hotbar-slot');
    slots.forEach((s, i) => {
      s.classList.toggle('active', i === activeSlotIndex);
    });
    updateHandTextures(availableBlocks[activeSlotIndex]);
    if (window.audioManager) window.audioManager.playSelect();
  }

  // Обновление текстуры блока в руке от первого лица
  function updateHandTextures(blockType) {
    if (!handItem) return;
    const topUrl = textureManager.getFaceTextureURL(blockType, 0);
    const bottomUrl = textureManager.getFaceTextureURL(blockType, 1);
    const sideUrl = textureManager.getFaceTextureURL(blockType, 2);

    const setBg = (selector, url) => {
      const el = handItem.querySelector(selector);
      if (el) el.style.backgroundImage = `url("${url}")`;
    };

    setBg('.front', sideUrl);
    setBg('.back', sideUrl);
    setBg('.top', topUrl);
    setBg('.bottom', bottomUrl);
    setBg('.left', sideUrl);
    setBg('.right', sideUrl);
  }

  createHotbar();
  updateHandTextures(availableBlocks[activeSlotIndex]);

  // Всплывающее уведомление
  let toastTimer = null;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  }

  // 4. Запуск игры и захват курсора мыши (Pointer Lock API)
  let isPointerLocked = false;

  function startGame() {
    window.audioManager.init();
    overlay.classList.add('hidden');
    isPointerLocked = true;
    try {
      canvas.requestPointerLock();
    } catch (err) {
      console.warn('Pointer lock request error:', err);
    }
  }

  // Клик по оверлею, кнопке "Играть" или канвасу
  const btnPlay = document.getElementById('btnPlay');
  if (btnPlay) {
    btnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      startGame();
    });
  }

  overlay.addEventListener('click', () => {
    startGame();
  });

  canvas.addEventListener('click', () => {
    if (!isPointerLocked) {
      startGame();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = (document.pointerLockElement === canvas);
    if (!isPointerLocked) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  });

  document.addEventListener('pointerlockerror', (e) => {
    console.warn('Pointer lock error:', e);
    // Даже если браузер временно ограничил захват курсора, убираем оверлей
    overlay.classList.add('hidden');
    isPointerLocked = true;
  });

  // Управление мышью (обзор)
  document.addEventListener('mousemove', (e) => {
    if (!isPointerLocked && !overlay.classList.contains('hidden')) return;
    player.onMouseMove(e.movementX, e.movementY);
  });

  // Переключение слотов колесиком мыши
  window.addEventListener('wheel', (e) => {
    if (!isPointerLocked) return;
    if (e.deltaY > 0) {
      selectSlot((activeSlotIndex + 1) % availableBlocks.length);
    } else {
      selectSlot((activeSlotIndex - 1 + availableBlocks.length) % availableBlocks.length);
    }
  });

  // 5. Логика разрушения и установки блоков
  let currentTarget = { hit: false };
  let isLeftMouseDown = false;
  let miningTarget = null;
  let miningProgressTime = 0;
  let hitSoundTimer = 0;
  let currentBreakProgress = 0;

  window.addEventListener('mousedown', (e) => {
    if (!isPointerLocked) return;

    // Проверяем, не целится ли игрок в свинью
    const [eyeX, eyeY, eyeZ] = player.getEyePosition();
    const [dirX, dirY, dirZ] = player.getDirection();
    let hitMob = null;
    for (const mob of mobs) {
      if (mob.health > 0) {
        const res = mob.raycast(eyeX, eyeY, eyeZ, dirX, dirY, dirZ, 4.5);
        if (res.hit) {
          hitMob = mob;
          break;
        }
      }
    }

    if (hitMob) {
      if (e.button === 0) {
        // Удар по свинье
        hitMob.takeDamage(2, player.x, player.z);
        if (firstPersonHand) {
          firstPersonHand.classList.add('punch');
          setTimeout(() => firstPersonHand.classList.remove('punch'), 150);
        }
      } else if (e.button === 2) {
        // Погладить / покормить свинку
        if (window.audioManager) window.audioManager.playPigOink();
        showToast('Вы погладили свинку! Она радостно хрюкает.');
        if (firstPersonHand) {
          firstPersonHand.classList.add('punch');
          setTimeout(() => firstPersonHand.classList.remove('punch'), 150);
        }
      }
      return; // Не копаем и не ставим блоки сквозь моба
    }

    // Зажатие ЛКМ: начало процесса копания блока с анимацией
    if (e.button === 0) {
      isLeftMouseDown = true;
    }
    // Клик ПКМ: моментальная установка выбранного блока
    else if (e.button === 2) {
      if (currentTarget.hit) {
        const placeX = currentTarget.x + currentTarget.face.x;
        const placeY = currentTarget.y + currentTarget.face.y;
        const placeZ = currentTarget.z + currentTarget.face.z;

        // Проверяем, не пересечет ли новый блок хитбокс игрока
        const pMinX = player.x - player.radius;
        const pMaxX = player.x + player.radius;
        const pMinY = player.y;
        const pMaxY = player.y + player.height;
        const pMinZ = player.z - player.radius;
        const pMaxZ = player.z + player.radius;

        const overlapsPlayer = (
          placeX + 1 > pMinX && placeX < pMaxX &&
          placeY + 1 > pMinY && placeY < pMaxY &&
          placeZ + 1 > pMinZ && placeZ < pMaxZ
        );

        if (!overlapsPlayer) {
          const selectedBlock = availableBlocks[activeSlotIndex];
          world.setBlock(placeX, placeY, placeZ, selectedBlock);
          window.audioManager.playPlace();

          // Анимация взмаха рукой при установке блока
          if (firstPersonHand) {
            firstPersonHand.classList.add('punch');
            setTimeout(() => firstPersonHand.classList.remove('punch'), 150);
          }
        }
      }
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      isLeftMouseDown = false;
    }
  });

  // Отключаем стандартное контекстное меню браузера по правой кнопке
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // 6. Управление с клавиатуры
  window.addEventListener('keydown', (e) => {
    // Если виден экран паузы/старта, нажатие Space или Enter запускает игру
    if (!overlay.classList.contains('hidden')) {
      if (e.code === 'Space' || e.code === 'Enter') {
        startGame();
        return;
      }
    }

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        player.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        player.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        player.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        player.keys.right = true;
        break;
      case 'Space':
        player.keys.jump = true;
        break;
      case 'Digit1': selectSlot(0); break;
      case 'Digit2': selectSlot(1); break;
      case 'Digit3': selectSlot(2); break;
      case 'Digit4': selectSlot(3); break;
      case 'Digit5': selectSlot(4); break;
      case 'Digit6': selectSlot(5); break;
      case 'Digit7': selectSlot(6); break;
      case 'Digit8': selectSlot(7); break;
      case 'Digit9': selectSlot(8); break;
      case 'Digit0': selectSlot(9); break;
      case 'KeyR':
        player.respawn();
        showToast('Возврат на начальную точку');
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        player.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        player.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        player.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        player.keys.right = false;
        break;
      case 'Space':
        player.keys.jump = false;
        break;
    }
  });

  // 7. Кнопки сохранения, загрузки и нового мира
  document.getElementById('btnSave').addEventListener('click', (e) => {
    e.stopPropagation();
    const res = WorldStorage.saveToLocalStorage(world, player);
    showToast(res.message);
  });

  document.getElementById('btnLoad').addEventListener('click', (e) => {
    e.stopPropagation();
    const res = WorldStorage.loadFromLocalStorage(world, player);
    showToast(res.message);
  });

  document.getElementById('btnExport').addEventListener('click', (e) => {
    e.stopPropagation();
    const res = WorldStorage.exportToFile(world, player);
    showToast(res.message);
  });

  document.getElementById('btnImport').addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      WorldStorage.importFromFile(file, world, player, (res) => {
        showToast(res.message);
        fileInput.value = '';
      });
    }
  });

  document.getElementById('btnNewWorld').addEventListener('click', (e) => {
    e.stopPropagation();
    world.generate();
    player.respawn();
    mobs.forEach(m => m.respawn());
    showToast('Сгенерирован новый процедурный мир!');
  });

  // 8. Игровой цикл (Game Loop)
  let lastTime = performance.now();
  let frameCount = 0;
  let fpsTimer = 0;
  let currentFps = 60;

  function gameLoop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Расчет FPS
    frameCount++;
    fpsTimer += dt;
    if (fpsTimer >= 1.0) {
      currentFps = frameCount;
      frameCount = 0;
      fpsTimer = 0;
    }

    // Обновление физики и положения игрока
    player.update(dt);

    // Обновление мобов (свинья: ИИ, ходьба, коллизии с миром)
    for (const mob of mobs) {
      mob.update(dt, player);
    }

    // Трассировка луча взгляда для выбора блока или моба
    const [eyeX, eyeY, eyeZ] = player.getEyePosition();
    const [dirX, dirY, dirZ] = player.getDirection();
    currentTarget = VoxelRaycaster.raycast(world, eyeX, eyeY, eyeZ, dirX, dirY, dirZ, 5.5);

    // Проверка наведения прицела на моба
    let targetedMob = null;
    for (const mob of mobs) {
      if (mob.health > 0) {
        const res = mob.raycast(eyeX, eyeY, eyeZ, dirX, dirY, dirZ, 5.0);
        if (res.hit) {
          targetedMob = mob;
          break;
        }
      }
    }

    // --- Логика задержки и анимации копания блока при зажатой ЛКМ ---
    if (isLeftMouseDown && currentTarget.hit) {
      if (currentTarget.y === 0 || currentTarget.blockId === BLOCK_TYPES.BEDROCK) {
        // Бедрок несокрушим
        if (firstPersonHand) firstPersonHand.classList.add('mining');
        currentBreakProgress = 0;
        if (progressSvg) progressSvg.style.opacity = '0';
      } else {
        // Проверяем, копаем ли мы тот же самый блок
        if (!miningTarget || miningTarget.x !== currentTarget.x || miningTarget.y !== currentTarget.y || miningTarget.z !== currentTarget.z) {
          miningTarget = { x: currentTarget.x, y: currentTarget.y, z: currentTarget.z, blockId: currentTarget.blockId };
          miningProgressTime = 0;
          hitSoundTimer = 0;
        }

        if (firstPersonHand) firstPersonHand.classList.add('mining');

        miningProgressTime += dt;
        hitSoundTimer += dt;

        // Ритмичный звук ударов по блоку в процессе копания
        if (hitSoundTimer >= 0.2) {
          hitSoundTimer = 0;
          window.audioManager.playHit();
        }

        const requiredTime = BLOCK_HARDNESS[miningTarget.blockId] || 0.8;
        currentBreakProgress = Math.min(1.0, miningProgressTime / requiredTime);

        // Обновление кругового индикатора на прицеле (длина окружности 88px)
        if (progressSvg && progressCircle) {
          progressSvg.style.opacity = '1';
          progressCircle.style.strokeDashoffset = (88 - 88 * currentBreakProgress);
        }

        // Блок полностью разрушен!
        if (currentBreakProgress >= 1.0) {
          world.setBlock(miningTarget.x, miningTarget.y, miningTarget.z, BLOCK_TYPES.AIR);
          window.audioManager.playBreak();

          miningTarget = null;
          miningProgressTime = 0;
          currentBreakProgress = 0;
          if (progressSvg) progressSvg.style.opacity = '0';
          if (firstPersonHand) firstPersonHand.classList.remove('mining');
        }
      }
    } else {
      // Игрок отпустил ЛКМ или отвел взгляд: сбрасываем прогресс
      miningTarget = null;
      miningProgressTime = 0;
      currentBreakProgress = 0;
      if (progressSvg) progressSvg.style.opacity = '0';
      if (firstPersonHand) firstPersonHand.classList.remove('mining');
    }

    // Если блоки были изменены, перестраиваем полигональную сетку
    if (world.isDirty) {
      const meshData = world.buildMesh(textureManager);
      renderer.updateWorldMesh(meshData);
    }

    // Отрисовка сцены через WebGL с отображением блоков, мобов и трещин
    renderer.render(player, currentTarget, currentBreakProgress, mobs);

    // Обновление диагностического HUD
    debugInfo.textContent = `FPS: ${currentFps} | X: ${player.x.toFixed(1)} Y: ${player.y.toFixed(1)} Z: ${player.z.toFixed(1)}`;
    if (targetedMob) {
      targetInfo.textContent = `Цель: 🐷 Свинья [HP: ${targetedMob.health}/${targetedMob.maxHealth}]`;
    } else if (currentTarget.hit) {
      targetInfo.textContent = `Цель: ${BLOCK_NAMES[currentTarget.blockId]} [${currentTarget.x}, ${currentTarget.y}, ${currentTarget.z}]`;
    } else {
      targetInfo.textContent = '';
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
