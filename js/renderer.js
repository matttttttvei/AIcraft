/**
 * WebGL Рендерер воксельного мира.
 * Отвечает за компиляцию шейдеров, загрузку текстурного атласа,
 * отрисовку чанка с направленным освещением, дистанционным туманом
 * и подсветкой целевого блока (Wireframe Outline).
 */

class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: false, alpha: false });

    if (!this.gl) {
      alert('WebGL не поддерживается вашим браузером!');
      throw new Error('WebGL not supported');
    }

    const gl = this.gl;

    // Включение глубинного буфера и отсечения задних граней
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    // Включение альфа-смешивания для прозрачных блоков (стекло, листва)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Цвет неба (очистки экрана и тумана) в мягком приятном стиле Minecraft 1.16+
    this.skyColor = [0.38, 0.54, 0.82];
    gl.clearColor(this.skyColor[0], this.skyColor[1], this.skyColor[2], 1.0);

    // Инициализация шейдерных программ
    this.initVoxelShader();
    this.initOutlineShader();
    this.initCrackShader();
    this.initPigShader();

    // Буферы геометрии мира
    this.posBuffer = gl.createBuffer();
    this.uvBuffer = gl.createBuffer();
    this.lightBuffer = gl.createBuffer();
    this.vertexCount = 0;

    // Буфер рамки выделения блока
    this.outlineBuffer = gl.createBuffer();
    this.initOutlineGeometry();

    // Буферы наложения трещин
    this.crackPosBuffer = gl.createBuffer();
    this.crackUVBuffer = gl.createBuffer();
    this.initCrackGeometry();

    // Буферы и текстура моба свиньи
    this.pigPosBuffer = gl.createBuffer();
    this.pigUVBuffer = gl.createBuffer();
    this.pigLightBuffer = gl.createBuffer();
    this.pigTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.pigTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([240, 152, 144, 255]));

    // Матрицы
    this.projMatrix = Mat4.create();
    this.viewMatrix = Mat4.create();
    this.mvpMatrix = Mat4.create();
  }

  // Создание шейдера
  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Ошибка компиляции шейдера:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  // Шейдер для блоков мира
  initVoxelShader() {
    const gl = this.gl;

    const vsSource = `
      attribute vec3 aPosition;
      attribute vec2 aUV;
      attribute float aLight;

      uniform mat4 uMVP;

      varying vec2 vUV;
      varying float vLight;
      varying float vDist;

      void main() {
        vec4 pos = uMVP * vec4(aPosition, 1.0);
        gl_Position = pos;
        vUV = aUV;
        vLight = aLight;
        vDist = pos.z;
      }
    `;

    const fsSource = `
      precision mediump float;

      varying vec2 vUV;
      varying float vLight;
      varying float vDist;

      uniform sampler2D uSampler;
      uniform vec3 uSkyColor;
      uniform float uFogNear;
      uniform float uFogFar;

      void main() {
        vec4 texColor = texture2D(uSampler, vUV);

        // Отсекаем полностью прозрачные пиксели (для листвы и стекла)
        if (texColor.a < 0.1) discard;

        // Мягкое, приглушенное освещение Minecraft 1.16+ (кратно снижена яркость)
        vec3 ambient = vec3(0.15, 0.16, 0.18);
        vec3 sun = vec3(0.45, 0.44, 0.42);
        vec3 litColor = texColor.rgb * (ambient + sun * vLight);

        // Мягкий дистанционный туман
        float fogFactor = smoothstep(uFogNear, uFogFar, vDist);
        vec3 finalColor = mix(litColor, uSkyColor, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    this.voxelProgram = {
      program,
      attribs: {
        position: gl.getAttribLocation(program, 'aPosition'),
        uv: gl.getAttribLocation(program, 'aUV'),
        light: gl.getAttribLocation(program, 'aLight')
      },
      uniforms: {
        mvp: gl.getUniformLocation(program, 'uMVP'),
        sampler: gl.getUniformLocation(program, 'uSampler'),
        skyColor: gl.getUniformLocation(program, 'uSkyColor'),
        fogNear: gl.getUniformLocation(program, 'uFogNear'),
        fogFar: gl.getUniformLocation(program, 'uFogFar')
      }
    };
  }

  // Шейдер для черной рамки вокруг выбранного блока
  initOutlineShader() {
    const gl = this.gl;

    const vsSource = `
      attribute vec3 aPosition;
      uniform mat4 uMVP;
      uniform vec3 uBlockPos;

      void main() {
        // Слегка расширяем рамку (1.003), чтобы избежать z-файтинга с гранями куба
        vec3 expanded = (aPosition - 0.5) * 1.003 + 0.5;
        gl_Position = uMVP * vec4(expanded + uBlockPos, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      void main() {
        gl_FragColor = vec4(0.1, 0.1, 0.1, 0.85); // Полупрозрачный темно-серый цвет
      }
    `;

    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    this.outlineProgram = {
      program,
      attribs: {
        position: gl.getAttribLocation(program, 'aPosition')
      },
      uniforms: {
        mvp: gl.getUniformLocation(program, 'uMVP'),
        blockPos: gl.getUniformLocation(program, 'uBlockPos')
      }
    };
  }

  // Шейдер для прогрессивных трещин при разрушении блока
  initCrackShader() {
    const gl = this.gl;

    const vsSource = `
      attribute vec3 aPosition;
      attribute vec2 aUV;

      uniform mat4 uMVP;
      uniform vec3 uBlockPos;
      uniform vec4 uCrackUV; // vec4(u0, v0, u1, v1)

      varying vec2 vUV;

      void main() {
        // Расширяем куб на 1.002, чтобы лежал поверх граней блока
        vec3 expanded = (aPosition - 0.5) * 1.002 + 0.5;
        gl_Position = uMVP * vec4(expanded + uBlockPos, 1.0);

        // Интерполяция текстурных координат внутри тайла трещин
        vUV = vec2(
          mix(uCrackUV.x, uCrackUV.z, aUV.x),
          mix(uCrackUV.w, uCrackUV.y, aUV.y)
        );
      }
    `;

    const fsSource = `
      precision mediump float;
      varying vec2 vUV;
      uniform sampler2D uSampler;

      void main() {
        vec4 texColor = texture2D(uSampler, vUV);
        if (texColor.a < 0.1) discard;

        // Прямое наслоение оригинальной текстуры разрушения из папки destroy (0..9)
        gl_FragColor = vec4(texColor.rgb, 0.85);
      }
    `;

    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    this.crackProgram = {
      program,
      attribs: {
        position: gl.getAttribLocation(program, 'aPosition'),
        uv: gl.getAttribLocation(program, 'aUV')
      },
      uniforms: {
        mvp: gl.getUniformLocation(program, 'uMVP'),
        blockPos: gl.getUniformLocation(program, 'uBlockPos'),
        crackUV: gl.getUniformLocation(program, 'uCrackUV'),
        sampler: gl.getUniformLocation(program, 'uSampler')
      }
    };
  }

  // Вершины для 6 граней куба трещин (36 вершин, CCW)
  initCrackGeometry() {
    const gl = this.gl;
    const positions = [];
    const uvs = [];

    const addCrackFace = (v0, v1, v2, v3) => {
      positions.push(
        v0[0], v0[1], v0[2],
        v1[0], v1[1], v1[2],
        v2[0], v2[1], v2[2],

        v0[0], v0[1], v0[2],
        v2[0], v2[1], v2[2],
        v3[0], v3[1], v3[2]
      );

      // uvs: [0, 0] bottom-left, [1, 0] bottom-right, [1, 1] top-right, [0, 1] top-left
      uvs.push(
        0, 0,  1, 0,  1, 1,
        0, 0,  1, 1,  0, 1
      );
    };

    // 1. Верх (+Y)
    addCrackFace([0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]);
    // 2. Низ (-Y)
    addCrackFace([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]);
    // 3. Север (+Z)
    addCrackFace([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]);
    // 4. Юг (-Z)
    addCrackFace([1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]);
    // 5. Восток (+X)
    addCrackFace([1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]);
    // 6. Запад (-X)
    addCrackFace([0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.crackPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.crackUVBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  }

  // Шейдер для отрисовки моба свиньи
  initPigShader() {
    const gl = this.gl;

    const vsSource = `
      attribute vec3 aPosition;
      attribute vec2 aUV;
      attribute float aLight;

      uniform mat4 uMVP;

      varying vec2 vUV;
      varying float vLight;
      varying float vDist;

      void main() {
        vec4 pos = uMVP * vec4(aPosition, 1.0);
        gl_Position = pos;
        vUV = aUV;
        vLight = aLight;
        vDist = pos.z;
      }
    `;

    const fsSource = `
      precision mediump float;

      varying vec2 vUV;
      varying float vLight;
      varying float vDist;

      uniform sampler2D uSampler;
      uniform vec3 uSkyColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uHurt;

      void main() {
        vec4 texColor = texture2D(uSampler, vUV);

        // Мягкое освещение мобов Minecraft 1.16+ (кратно снижена яркость)
        vec3 ambient = vec3(0.15, 0.16, 0.18);
        vec3 sun = vec3(0.45, 0.44, 0.42);
        vec3 litColor = texColor.rgb * (ambient + sun * vLight);

        // Эффект вспышки красного при получении урона
        if (uHurt > 0.0) {
          litColor = mix(litColor, vec3(1.0, 0.2, 0.2), 0.75);
        }

        float fogFactor = smoothstep(uFogNear, uFogFar, vDist);
        vec3 finalColor = mix(litColor, uSkyColor, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    this.pigProgram = {
      program,
      attribs: {
        position: gl.getAttribLocation(program, 'aPosition'),
        uv: gl.getAttribLocation(program, 'aUV'),
        light: gl.getAttribLocation(program, 'aLight')
      },
      uniforms: {
        mvp: gl.getUniformLocation(program, 'uMVP'),
        sampler: gl.getUniformLocation(program, 'uSampler'),
        skyColor: gl.getUniformLocation(program, 'uSkyColor'),
        fogNear: gl.getUniformLocation(program, 'uFogNear'),
        fogFar: gl.getUniformLocation(program, 'uFogFar'),
        hurt: gl.getUniformLocation(program, 'uHurt')
      }
    };
  }

  // Загрузка текстуры свиньи в память WebGL
  loadPigTexture(image) {
    const gl = this.gl;
    if (!this.pigTexture) {
      this.pigTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.pigTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Вершины для 12 ребер куба (gl.LINES)
  initOutlineGeometry() {
    const gl = this.gl;
    const lines = new Float32Array([
      // Нижний периметр
      0, 0, 0,  1, 0, 0,
      1, 0, 0,  1, 0, 1,
      1, 0, 1,  0, 0, 1,
      0, 0, 1,  0, 0, 0,
      // Верхний периметр
      0, 1, 0,  1, 1, 0,
      1, 1, 0,  1, 1, 1,
      1, 1, 1,  0, 1, 1,
      0, 1, 1,  0, 1, 0,
      // 4 вертикальные стойки
      0, 0, 0,  0, 1, 0,
      1, 0, 0,  1, 1, 0,
      1, 0, 1,  1, 1, 1,
      0, 0, 1,  0, 1, 1
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
  }

  // Загрузка текстурного атласа в память видеокарты
  loadTextureAtlas(textureManager) {
    this.textureManager = textureManager;
    const gl = this.gl;
    if (!this.atlasTexture) {
      this.atlasTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);

    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      gl.RGBA, gl.UNSIGNED_BYTE,
      textureManager.canvas
    );

    // Пиксельная фильтрация (NEAREST) для аутентичного ретро-вида Minecraft
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Обновление буферов полигональной сетки мира
  updateWorldMesh(meshData) {
    const gl = this.gl;
    this.vertexCount = meshData.vertexCount;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, meshData.positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, meshData.uvs, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, meshData.lights, gl.DYNAMIC_DRAW);
  }

  // Изменение размера канваса под окно браузера
  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  // Отрисовка кадра
  render(player, targetBlock, breakProgress = 0, mobs = []) {
    this.resize();
    const gl = this.gl;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (this.vertexCount === 0) return;

    // 1. Расчет матриц Проекции, Вида и MVP
    const aspect = this.canvas.width / this.canvas.height;
    Mat4.perspective(this.projMatrix, Math.PI / 3, aspect, 0.1, 90.0);

    const [eyeX, eyeY, eyeZ] = player.getEyePosition();
    Mat4.fpsView(this.viewMatrix, eyeX, eyeY, eyeZ, player.pitch, player.yaw);

    Mat4.multiply(this.mvpMatrix, this.projMatrix, this.viewMatrix);

    // 2. Отрисовка блоков мира (без альфа-смешивания для монолитных ребер)
    gl.disable(gl.BLEND);
    gl.useProgram(this.voxelProgram.program);

    gl.uniformMatrix4fv(this.voxelProgram.uniforms.mvp, false, this.mvpMatrix);
    gl.uniform3fv(this.voxelProgram.uniforms.skyColor, this.skyColor);
    gl.uniform1f(this.voxelProgram.uniforms.fogNear, 42.0);
    gl.uniform1f(this.voxelProgram.uniforms.fogFar, 75.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.uniform1i(this.voxelProgram.uniforms.sampler, 0);

    // Подключение атрибутов вершин
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(this.voxelProgram.attribs.position);
    gl.vertexAttribPointer(this.voxelProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.voxelProgram.attribs.uv);
    gl.vertexAttribPointer(this.voxelProgram.attribs.uv, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
    gl.enableVertexAttribArray(this.voxelProgram.attribs.light);
    gl.vertexAttribPointer(this.voxelProgram.attribs.light, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    // 3. Отрисовка мобов (свинья)
    if (mobs && mobs.length > 0 && this.pigTexture) {
      this.renderMobs(mobs);
    }

    // 4. Отрисовка анимации трещин при разрушении блока (поэтапно от 0 до 9)
    if (targetBlock && targetBlock.hit && breakProgress > 0) {
      gl.enable(gl.BLEND);
      const crackStage = Math.min(9, Math.floor(breakProgress * 10));
      this.renderCrackOverlay(targetBlock, crackStage);
    }

    // 5. Отрисовка рамки выделенного блока
    if (targetBlock && targetBlock.hit) {
      gl.enable(gl.BLEND);
      gl.useProgram(this.outlineProgram.program);
      gl.uniformMatrix4fv(this.outlineProgram.uniforms.mvp, false, this.mvpMatrix);
      gl.uniform3f(this.outlineProgram.uniforms.blockPos, targetBlock.x, targetBlock.y, targetBlock.z);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineBuffer);
      gl.enableVertexAttribArray(this.outlineProgram.attribs.position);
      gl.vertexAttribPointer(this.outlineProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.lineWidth(2.0);
      gl.drawArrays(gl.LINES, 0, 24);
    }
  }

  // Отрисовка 3D-моделей мобов
  renderMobs(mobs) {
    const gl = this.gl;
    if (!this.pigTexture) return;

    // Отключаем Backface Culling для мобов, чтобы ноги и сочленения не были прозрачными
    gl.disable(gl.CULL_FACE);

    gl.useProgram(this.pigProgram.program);
    gl.uniformMatrix4fv(this.pigProgram.uniforms.mvp, false, this.mvpMatrix);
    gl.uniform3fv(this.pigProgram.uniforms.skyColor, this.skyColor);
    gl.uniform1f(this.pigProgram.uniforms.fogNear, 42.0);
    gl.uniform1f(this.pigProgram.uniforms.fogFar, 75.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pigTexture);
    gl.uniform1i(this.pigProgram.uniforms.sampler, 0);

    for (const mob of mobs) {
      if (mob.health <= 0) continue;
      const mesh = mob.buildMesh();
      if (mesh.vertexCount === 0) continue;

      gl.uniform1f(this.pigProgram.uniforms.hurt, mesh.isHurt ? 1.0 : 0.0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.pigPosBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.pigProgram.attribs.position);
      gl.vertexAttribPointer(this.pigProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.pigUVBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.pigProgram.attribs.uv);
      gl.vertexAttribPointer(this.pigProgram.attribs.uv, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.pigLightBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.lights, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.pigProgram.attribs.light);
      gl.vertexAttribPointer(this.pigProgram.attribs.light, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
    }

    gl.enable(gl.CULL_FACE);
  }

  // Отрисовка полупрозрачных текстурных трещин поверх блока
  renderCrackOverlay(targetBlock, stage) {
    const gl = this.gl;
    if (!this.textureManager) return;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.crackProgram.program);
    gl.uniformMatrix4fv(this.crackProgram.uniforms.mvp, false, this.mvpMatrix);
    gl.uniform3f(this.crackProgram.uniforms.blockPos, targetBlock.x, targetBlock.y, targetBlock.z);

    const uv = this.textureManager.getTileUV(ATLAS_TILES.CRACK_0 + stage);
    gl.uniform4f(this.crackProgram.uniforms.crackUV, uv.u0, uv.v0, uv.u1, uv.v1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.uniform1i(this.crackProgram.uniforms.sampler, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.crackPosBuffer);
    gl.enableVertexAttribArray(this.crackProgram.attribs.position);
    gl.vertexAttribPointer(this.crackProgram.attribs.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.crackUVBuffer);
    gl.enableVertexAttribArray(this.crackProgram.attribs.uv);
    gl.vertexAttribPointer(this.crackProgram.attribs.uv, 2, gl.FLOAT, false, 0, 0);

    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    gl.depthMask(true);

    gl.disable(gl.BLEND);
  }
}
