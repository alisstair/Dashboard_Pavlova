// Точка входа: создаём панель и подключаем кнопки добавления виджетов
import { Dashboard } from './js/Dashboard.js';
import { createMetalTexture } from './js/metalTexture.js';
import * as sound from './js/sound.js';

// Текстура металла от WebGL-шейдера → CSS-переменная --metal (её используют приборы).
// Если WebGL нет, в CSS останется запасная шумовая текстура
const metal = createMetalTexture(1024); // плитка 1024×1024 — больше любого прибора, повтор не заметен
if (metal) {
  document.documentElement.style.setProperty('--metal', `url(${metal})`);
}

const dashboard = new Dashboard(
  document.querySelector('#dashboard'),
  document.querySelector('#announcer'),
);

// Кнопки добавления: тип виджета записан в атрибуте data-widget у кнопки.
// Новый виджет добавляется в конец панели — сразу прокручиваем к нему
for (const button of document.querySelectorAll('[data-widget]')) {
  button.addEventListener('click', () => {
    const widget = dashboard.addWidget(button.dataset.widget);
    dashboard.reveal(widget);
  });
}

// Тумблеры в шапке. Каждый переключается по клику, запоминает положение
// в localStorage и вызывает apply(включён ли он)
function setupSwitch(button, storageKey, defaultOn, apply) {
  function set(on) {
    button.setAttribute('aria-checked', String(on));
    apply(on);
    try {
      localStorage.setItem(storageKey, on ? 'on' : 'off');
    } catch {
      // хранилище может быть недоступно (приватный режим) — просто не запоминаем
    }
  }

  button.addEventListener('click', () => set(button.getAttribute('aria-checked') !== 'true'));

  let saved = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    // нет доступа к хранилищу — берём положение по умолчанию
  }
  set(saved === null ? defaultOn : saved === 'on');
}

// «Боевое освещение»: ночью рубку подлодки переводят на красный свет.
// Цвета меняет CSS по атрибуту data-light на <html>
setupSwitch(document.querySelector('#light-switch'), 'redLight', false, (on) => {
  document.documentElement.dataset.light = on ? 'red' : 'normal';
});

// «Звук»: щелчки кнопок и фоновый сонар (js/sound.js)
setupSwitch(document.querySelector('#sound-switch'), 'sound', true, (on) => sound.setEnabled(on));

// Браузер разрешает звук только после первого нажатия — «включаем» его тогда
document.addEventListener('pointerdown', sound.unlock);
document.addEventListener('keydown', sound.unlock);

// Фоновый сонар — тихий «пинг» время от времени, для атмосферы
sound.startAmbientSonar();

// Звуки нажатий для всех кнопок сразу — делегирование событий на документ.
// Срабатывает и для мыши, и для Enter/пробела с клавиатуры
document.addEventListener('click', (event) => {
  if (event.target.closest('.toggle')) sound.toggle();
  else if (event.target.closest('.push, .icon-btn, .btn')) sound.click();
});

// Машинный телеграф и выбор точки — щелчок при смене положения
document.addEventListener('change', (event) => {
  if (event.target.matches('.telegraph__input')) sound.toggle();
  else if (event.target.matches('.select')) sound.click();
});

// Конденсат на корпусе: капли иногда набухают и стекают вниз.
// Анимацию делает CSS (см. .drop в main.css), а JS только раскладывает капли
// по случайным местам через CSS-переменные.
function placeDrop(drop) {
  drop.style.setProperty('--x', `${Math.random() * 100}%`);
  drop.style.setProperty('--y', `${Math.random() * 70}%`);
  drop.style.setProperty('--size', `${5 + Math.random() * 7}px`);
  drop.style.setProperty('--run', `${60 + Math.random() * 160}px`); // насколько стечёт
}

function createCondensation(count) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layer = document.createElement('div');
  layer.className = 'drops';
  layer.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < count; i++) {
    const drop = document.createElement('span');
    drop.className = 'drop';
    placeDrop(drop);
    // Длинный цикл и случайная задержка — капли стекают «иногда», не все сразу
    drop.style.setProperty('--duration', `${14 + Math.random() * 16}s`);
    drop.style.setProperty('--delay', `${-Math.random() * 30}s`);
    // Капля стекла — в следующий раз появится в другом месте.
    // Проверяем pseudoElement, потому что у следа (::after) своя анимация и своё событие
    drop.addEventListener('animationiteration', (event) => {
      if (!event.pseudoElement) placeDrop(drop);
    });
    layer.append(drop);
  }
  document.body.prepend(layer);
}

createCondensation(16);

// Стартовый набор. Сначала приборы ходового поста — двигатель, компас, прожекторы:
// они есть всегда в одном экземпляре, кнопок добавления у них нет
for (const type of ['engine', 'compass', 'lights', 'creature', 'ocean', 'wind']) {
  dashboard.addWidget(type);
}
