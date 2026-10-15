// Звуки пульта: щелчки кнопок, тумблеры и фоновый сонар.
// Щелчки синтезируются прямо в браузере через Web Audio API: генераторы тона
// (OscillatorNode), шум, фильтры и регуляторы громкости (GainNode).
// Фоновый сонар — запись sounds/sonar.mp3 (Big Sound Bank №1416, лицензия CC0),
// а если файл не загрузился — синтезированный импульс.

const SONAR_FILE = 'sounds/sonar.mp3';
const AMBIENT_VOLUME = 0.12; // фон — тихо

let context = null;    // AudioContext создаём только после первого нажатия пользователя
let master = null;     // общая громкость
let enabled = true;    // тумблер «Звук»
let noiseBuffer = null;
let ambientWanted = false;  // main.js попросил включить фон
let ambientStarted = false; // фон уже запущен
let ambientGain = null;     // громкость фона (тумблер «Звук» её плавно гасит)

// Браузеры не дают играть звук, пока человек ничего не нажал на странице.
// Поэтому «включаем» звук по первому нажатию (main.js вызывает unlock)
export function unlock() {
  if (!context) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return; // очень старый браузер — просто без звука
    context = new AudioCtx();
    master = context.createGain();
    master.gain.value = 0.6;
    master.connect(context.destination);
  }
  if (context.state === 'suspended' && !document.hidden) context.resume();
  if (ambientWanted && !ambientStarted) beginAmbient();
}

export function setEnabled(on) {
  enabled = on;
  // фон не обрываем резко, а плавно убираем или возвращаем громкость
  ambientGain?.gain.setTargetAtTime(on ? AMBIENT_VOLUME : 0, context.currentTime, 0.3);
}

// Вкладку свернули — ставим весь звук на паузу, вернули — продолжаем
document.addEventListener('visibilitychange', () => {
  if (!context) return;
  if (document.hidden) context.suspend();
  else context.resume();
});

// Можно ли играть прямо сейчас
function ready() {
  return enabled && context && context.state === 'running';
}

// Белый шум длиной 0,1 с — из него делаем щелчки
function getNoise() {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.1, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

// Короткий щелчок: всплеск шума через полосовой фильтр + низкий «бум» корпуса
function snap(time, pitch, volume) {
  const noise = context.createBufferSource();
  noise.buffer = getNoise();
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = pitch;
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(volume, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  noise.connect(filter).connect(noiseGain).connect(master);
  noise.start(time);
  noise.stop(time + 0.05);

  const body = context.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(pitch / 14, time);
  const bodyGain = context.createGain();
  bodyGain.gain.setValueAtTime(volume * 0.6, time);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
  body.connect(bodyGain).connect(master);
  body.start(time);
  body.stop(time + 0.07);
}

// Нажатие кнопки
export function click() {
  if (!ready()) return;
  snap(context.currentTime, 2600, 0.5);
}

// Тумблер: два щелчка подряд — рычаг перескакивает через пружину
export function toggle() {
  if (!ready()) return;
  const now = context.currentTime;
  snap(now, 1500, 0.6);
  snap(now + 0.03, 900, 0.45);
}

// Гулкое пространство: реверберация через ConvolverNode.
// Импульсный отклик синтезируем сами — стерео-шум, который плавно затухает
// за 3,5 секунды (так звучит «огромная толща воды»). Создаём один раз
let reverb = null;

function getReverb() {
  if (!reverb) {
    const length = Math.floor(context.sampleRate * 3.5);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
      }
    }
    reverb = context.createConvolver();
    reverb.buffer = impulse;
    // реверберация тоже приглушена — верха под водой гаснут
    const muffle = context.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 1200;
    reverb.connect(muffle).connect(master);
  }
  return reverb;
}

// Плавная огибающая громкости: тишина → пик за attack секунд → затухание к end
function envelope(time, peak, attack, end) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + end);
  return gain;
}

// Импульс гидролокатора в духе Циклопа из Subnautica (своя синтезированная
// версия, не оригинальный звук). Четыре слоя:
//  1) глухой низкий удар — корпус «толкает» воду;
//  2) основной тон — два почти одинаковых синуса, их разница даёт «биение»;
//  3) волна — шум, фильтр которого проезжает снизу вверх: импульс расходится;
//  4) всё это уходит в длинную реверберацию.
function sonarPing() {
  if (!ready()) return;
  const now = context.currentTime;
  const space = getReverb();

  // Сухой сигнал тихий, «мокрый» (реверберация) — громче: звук издалека
  const dry = context.createGain();
  dry.gain.value = 0.35;
  const wet = context.createGain();
  wet.gain.value = 0.9;
  const bus = context.createBiquadFilter(); // общий фильтр — убираем звон
  bus.type = 'lowpass';
  bus.frequency.value = 1500;
  bus.connect(dry).connect(master);
  bus.connect(wet).connect(space);

  // 1) низкий удар: 95 Гц быстро съезжает до 50 Гц
  const thump = context.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(95, now);
  thump.frequency.exponentialRampToValueAtTime(50, now + 0.5);
  thump.connect(envelope(now, 0.35, 0.01, 0.7)).connect(bus);
  thump.start(now);
  thump.stop(now + 0.75);

  // 2) основной тон с «биением» и лёгким спадом высоты
  const pitch = 510 + Math.random() * 20;
  const toneGain = envelope(now, 0.07, 0.03, 2.6);
  toneGain.connect(bus);
  for (const detune of [0, 3.5]) {
    const tone = context.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(pitch + detune, now);
    tone.frequency.exponentialRampToValueAtTime((pitch + detune) * 0.96, now + 2.6);
    tone.connect(toneGain);
    tone.start(now);
    tone.stop(now + 2.7);
  }
  // тихий обертон на октаву выше — делает тон «металлическим»
  const overtone = context.createOscillator();
  overtone.type = 'sine';
  overtone.frequency.setValueAtTime(pitch * 2, now);
  overtone.connect(envelope(now, 0.015, 0.02, 1.2)).connect(bus);
  overtone.start(now);
  overtone.stop(now + 1.3);

  // 3) волна: шум через полосовой фильтр, который за 1,3 с уходит с 250 до 1600 Гц
  const wave = context.createBufferSource();
  wave.buffer = getNoise();
  wave.loop = true;
  const sweep = context.createBiquadFilter();
  sweep.type = 'bandpass';
  sweep.Q.value = 4;
  sweep.frequency.setValueAtTime(250, now);
  sweep.frequency.exponentialRampToValueAtTime(1600, now + 1.3);
  wave.connect(sweep).connect(envelope(now, 0.05, 0.15, 1.5)).connect(bus);
  wave.start(now);
  wave.stop(now + 1.6);
}

// Фоновый сонар. Сам звук начнётся после первого нажатия на странице
// (раньше браузер не разрешит) — его запустит unlock()
export function startAmbientSonar() {
  ambientWanted = true;
}

// Запись sounds/sonar.mp3 по кругу: тихо, через фильтр (срезаем звон — как
// сквозь корпус) и с той же гулкой реверберацией, что у синтезированного импульса
async function beginAmbient() {
  ambientStarted = true;

  ambientGain = context.createGain();
  ambientGain.gain.value = enabled ? AMBIENT_VOLUME : 0;
  const muffle = context.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 900;
  const wet = context.createGain();
  wet.gain.value = 0.6;
  ambientGain.connect(muffle);
  muffle.connect(master);                  // прямой звук
  muffle.connect(wet).connect(getReverb()); // и гулкий отзвук

  try {
    const response = await fetch(SONAR_FILE);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // В начале и в конце MP3 бывает пара миллисекунд тишины — отрезаем,
    // чтобы на стыке повтора не было щелчка
    source.loopStart = 0.05;
    source.loopEnd = buffer.duration - 0.05;
    source.connect(ambientGain);
    source.start();
  } catch (error) {
    // Файла нет или он не читается — играем синтезированный импульс
    console.warn('Фоновый сонар: файл не загрузился, включаю синтезированный звук.', error.message);
    startSynthSonar();
  }
}

// Запасной вариант: синтезированный импульс раз в 6–10 секунд
function startSynthSonar() {
  const next = () => setTimeout(() => {
    if (!document.hidden) sonarPing();
    next();
  }, 6000 + Math.random() * 4000);
  next();
}
