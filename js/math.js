/**
 * Математический модуль для работы с матрицами 4x4, векторами и AABB (хитбоксами).
 * Написан на чистом JS с использованием Float32Array для максимальной скорости.
 */

const Mat4 = {
  create() {
    const out = new Float32Array(16);
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
  },

  identity(out) {
    for (let i = 0; i < 16; i++) out[i] = 0;
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
  },

  // Матрица перспективной проекции
  perspective(out, fovYRad, aspect, near, far) {
    const f = 1.0 / Math.tan(fovYRad / 2);
    const nf = 1 / (near - far);

    for (let i = 0; i < 16; i++) out[i] = 0;

    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[14] = (2 * far * near) * nf;
    return out;
  },

  // Матрица вида от первого лица (FPS View Matrix)
  // yaw: вращение вокруг оси Y (влево/вправо)
  // pitch: вращение вокруг оси X (вверх/вниз)
  fpsView(out, eyeX, eyeY, eyeZ, pitch, yaw) {
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    // Row 0: Right вектор
    const r00 = cosYaw;
    const r01 = 0;
    const r02 = -sinYaw;

    // Row 1: Up вектор
    const r10 = sinYaw * sinPitch;
    const r11 = cosPitch;
    const r12 = cosYaw * sinPitch;

    // Row 2: Backward (-Forward) вектор
    const r20 = sinYaw * cosPitch;
    const r21 = -sinPitch;
    const r22 = cosYaw * cosPitch;

    // Column 0
    out[0] = r00;
    out[1] = r10;
    out[2] = r20;
    out[3] = 0;

    // Column 1
    out[4] = r01;
    out[5] = r11;
    out[6] = r21;
    out[7] = 0;

    // Column 2
    out[8] = r02;
    out[9] = r12;
    out[10] = r22;
    out[11] = 0;

    // Column 3 (Смещение: -R * eye)
    out[12] = -(r00 * eyeX + r01 * eyeY + r02 * eyeZ);
    out[13] = -(r10 * eyeX + r11 * eyeY + r12 * eyeZ);
    out[14] = -(r20 * eyeX + r21 * eyeY + r22 * eyeZ);
    out[15] = 1;

    return out;
  },

  // Умножение матриц: out = a * b
  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    return out;
  }
};
