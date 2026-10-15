// Текстура крашеного металла, нарисованная WebGL-шейдером.
// Рисуем один раз при загрузке в невидимый canvas и отдаём как картинку (data URL),
// которую CSS кладёт на приборы. Без библиотек — только WebGL браузера.
//
// Получается шлифованная сталь с царапинами: облачные пятна, потёки,
// следы шлифовки и много тонких царапин под разными углами.
// Шейдер выдаёт серую картинку: 0.5 — «как есть», светлее — блестит, темнее — грязь.
// CSS накладывает её на цвет краски режимом overlay, поэтому одна и та же
// текстура подходит и для зелёной, и для красной (боевой) подсветки.

const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform float uSize;

// Псевдослучайное число по координате клетки
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Плавный шум. period — через сколько клеток узор повторяется,
// благодаря mod() текстура бесшовная: её можно класть плиткой
float noise(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(mod(i, period));
  float b = hash(mod(i + vec2(1.0, 0.0), period));
  float c = hash(mod(i + vec2(0.0, 1.0), period));
  float d = hash(mod(i + vec2(1.0, 1.0), period));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Фрактальный шум: несколько слоёв шума всё мельче и мельче — облачные пятна
float fbm(vec2 uv, float period) {
  float value = 0.0;
  float amp = 0.5;
  for (int k = 0; k < 5; k++) {
    value += amp * noise(uv * period, vec2(period));
    period *= 2.0;
    amp *= 0.5;
  }
  return value;
}

// Слой царапин. Поле делим на cells × cells клеток, в большинстве клеток —
// тонкий отрезок со случайными углом, длиной и яркостью (светлая царапина
// блестит, тёмная — забита грязью). Проверяем и соседние клетки, чтобы
// длинные царапины не обрывались на границе клетки.
float scratchLayer(vec2 uv, float cells, float seed, float maxLength) {
  vec2 grid = uv * cells;
  vec2 cell = floor(grid);
  float width = cells / uSize * 0.7; // толщина ≈ 0.7 пикселя
  float result = 0.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = cell + vec2(float(x), float(y));
      vec2 key = mod(id, cells) + seed; // mod — чтобы плитка была бесшовной
      if (hash(key) < 0.3) continue;    // в части клеток царапин нет

      float angle = hash(key + 1.3) * 3.1416;
      vec2 dir = vec2(cos(angle), sin(angle));
      vec2 center = id + vec2(hash(key + 2.7), hash(key + 5.1));
      float halfLength = (0.2 + 0.8 * hash(key + 8.3)) * maxLength;

      vec2 d = grid - center;
      float along = abs(dot(d, dir));                     // расстояние вдоль царапины
      float across = abs(dot(d, vec2(-dir.y, dir.x)));    // расстояние поперёк
      float line = (1.0 - smoothstep(0.0, width, across))
                 * (1.0 - smoothstep(halfLength * 0.6, halfLength, along)); // концы тают

      float tone = hash(key + 4.4) < 0.6 ? 1.0 : -1.0;    // светлая или тёмная
      result += line * tone * (0.4 + 0.6 * hash(key + 9.9));
    }
  }
  return result;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float grey = 0.5; // 0.5 — «ничего не меняем» при наложении overlay

  grey += (fbm(uv, 2.0) - 0.5) * 0.42;                                       // мягкие облачные пятна
  // вертикальные потёки — только местами: полосы гаснут там, где крупный шум тёмный
  float streaks = noise(uv * vec2(70.0, 3.0), vec2(70.0, 3.0)) - 0.5;
  grey += streaks * smoothstep(0.45, 0.7, fbm(uv + 0.5, 3.0)) * 0.10;
  grey += (noise(uv * vec2(4.0, 700.0), vec2(4.0, 700.0)) - 0.5) * 0.035;   // шлифовка по горизонтали
  grey += (noise(uv * vec2(700.0, 4.0), vec2(700.0, 4.0)) - 0.5) * 0.03;    // шлифовка по вертикали
  grey += (noise(uv * 600.0, vec2(600.0)) - 0.5) * 0.06;                    // мелкое зерно

  grey += scratchLayer(uv, 7.0, 0.0, 1.3) * 0.24;   // длинные царапины
  grey += scratchLayer(uv, 16.0, 17.0, 1.1) * 0.18; // средние
  grey += scratchLayer(uv, 34.0, 41.0, 0.9) * 0.12; // короткие
  grey += scratchLayer(uv, 64.0, 73.0, 0.8) * 0.08; // совсем мелкие, густо

  gl_FragColor = vec4(vec3(clamp(grey, 0.0, 1.0)), 1.0);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

// Вернёт картинку (data URL) или null, если WebGL недоступен —
// тогда в CSS останется запасная шумовая текстура
export function createMetalTexture(size = 1024) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) return null;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    gl.useProgram(program);

    // Прямоугольник на весь canvas из двух треугольников — шейдер раскрасит каждый пиксель
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(gl.getUniformLocation(program, 'uSize'), size);
    gl.viewport(0, 0, size, size);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const url = canvas.toDataURL('image/jpeg', 0.9);
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // освобождаем видеокарту
    return url;
  } catch (error) {
    console.warn('Текстура металла не нарисована:', error.message);
    return null;
  }
}
