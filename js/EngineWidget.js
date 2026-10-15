// Виджет «Двигатель»: пуск и остановка, машинный телеграф, тахометр и скорость.
// API нет — это симуляция: обороты плавно тянутся к значению, заданному телеграфом.
import { UIComponent, createEl, createPushButton } from './UIComponent.js';

const MAX_RPM = 3000;     // конец шкалы тахометра
const RED_ZONE = 2700;    // с этих оборотов шкала красная
const IDLE_RPM = 600;     // холостой ход
const KNOTS_AT_MAX = 16;  // скорость на максимальных оборотах, узлов

// Положения машинного телеграфа и обороты для каждого
const TELEGRAPH = [
  { name: 'Стоп', rpm: IDLE_RPM },
  { name: 'Малый', rpm: 1200 },
  { name: 'Средний', rpm: 1900 },
  { name: 'Полный', rpm: 2500 },
];

export class EngineWidget extends UIComponent {
  #running = false;  // двигатель работает
  #starting = false; // идёт запуск (крутит стартер)
  #rpm = 0;          // текущие обороты
  #gear = 0;         // положение телеграфа (индекс в TELEGRAPH)

  get badge() {
    return 'Машина';
  }

  // Прибор ходового поста один на всю лодку — закрыть его нельзя
  get closable() {
    return false;
  }

  renderContent(body) {
    // Экран: тахометр, обороты, скорость, строка состояния
    this.view = createEl('div', 'widget__view');
    const screen = createEl('div', 'engine');

    const dial = createEl('div', 'dial');
    dial.setAttribute('aria-hidden', 'true');
    this.needle = createEl('div', 'dial__needle');
    dial.append(this.needle, createEl('span', 'dial__hub'), createEl('span', 'dial__label', 'об/мин × 100'));
    this.#placeDialNumbers(dial);

    const readouts = createEl('div', 'readouts');
    this.rpmValue = createEl('p', 'readout__value', '0');
    this.speedValue = createEl('p', 'readout__value', '0,0');
    this.speedNote = createEl('p', 'readout__note', '0,0 км/ч');
    readouts.append(
      this.#readout('Обороты, об/мин', this.rpmValue, ''),
      this.#readout('Скорость', this.speedValue, 'уз', this.speedNote),
    );

    // Строку состояния читает экранный диктор (обороты — нет, они меняются постоянно)
    this.statusLine = createEl('p', 'engine__status', 'Двигатель заглушён');
    this.statusLine.setAttribute('aria-live', 'polite');

    screen.append(dial, readouts, this.statusLine);
    this.view.append(screen);

    // Машинный телеграф: обычные радиокнопки — стрелки на клавиатуре работают сами
    const telegraph = createEl('fieldset', 'telegraph');
    telegraph.append(createEl('legend', 'field__label', 'Машинный телеграф'));
    TELEGRAPH.forEach((position, index) => {
      const option = createEl('label', 'telegraph__option');
      const input = createEl('input', 'telegraph__input');
      input.type = 'radio';
      input.name = `${this.id}-telegraph`;
      input.checked = index === 0;
      this.listen(input, 'change', () => this.#setGear(index));
      option.append(input, createEl('span', 'telegraph__mark', position.name));
      telegraph.append(option);
    });

    // Кнопка пуска/остановки. aria-pressed — «нажата/отжата» для экранного диктора
    this.startButton = createPushButton('Пуск');
    this.startButton.setAttribute('aria-pressed', 'false');
    this.listen(this.startButton, 'click', () => this.#toggleEngine());
    const actions = createEl('div', 'widget__actions');
    actions.append(this.startButton, createEl('span', 'widget__hint', 'Симуляция, без API'));

    body.append(this.view, telegraph, actions);
    this.setState('off');

    // 10 раз в секунду пересчитываем обороты и обновляем приборы
    this.every(100, () => this.#tick());
  }

  #toggleEngine() {
    if (this.#starting) return; // пока крутит стартер — ждём

    if (this.#running) {
      this.#running = false;
      this.#setButton('Пуск', false);
      this.statusLine.textContent = 'Двигатель заглушён';
      this.setState('off');
      return;
    }

    // Запуск: секунду с небольшим крутит стартер (лампа мигает), потом мотор схватывает
    this.#starting = true;
    this.#setButton('Стоп', true);
    this.statusLine.textContent = 'Запуск…';
    this.setState('loading');
    this.after(1400, () => {
      this.#starting = false;
      this.#running = true;
      this.statusLine.textContent = `Двигатель работает · ${TELEGRAPH[this.#gear].name}`;
      this.setState('ok');
    });
  }

  #setGear(index) {
    this.#gear = index;
    if (this.#running) {
      this.statusLine.textContent = `Двигатель работает · ${TELEGRAPH[index].name}`;
    }
  }

  // Один шаг симуляции
  #tick() {
    let target = 0;
    if (this.#starting) target = 250 + Math.random() * 150; // стартер — стрелка дрожит
    else if (this.#running) target = TELEGRAPH[this.#gear].rpm;

    // Обороты меняются не скачком, а плавно: каждый шаг — 8% от оставшейся разницы
    this.#rpm += (target - this.#rpm) * 0.08;
    if (this.#rpm < 5) this.#rpm = 0;

    // Винт толкает лодку только выше холостого хода
    const knots = this.#running ? Math.max(0, this.#rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM) * KNOTS_AT_MAX : 0;

    const angle = -120 + (this.#rpm / MAX_RPM) * 240; // шкала — дуга в 240°
    this.needle.style.transform = `rotate(${angle}deg)`;
    this.rpmValue.firstChild.textContent = String(Math.round(this.#rpm / 10) * 10);
    this.speedValue.firstChild.textContent = this.#format(knots);
    this.speedNote.textContent = `${this.#format(knots * 1.852)} км/ч`;
  }

  #setButton(label, pressed) {
    this.startButton.querySelector('.push__label').textContent = label;
    this.startButton.setAttribute('aria-pressed', String(pressed));
  }

  #readout(label, valueEl, unit, noteEl) {
    const item = createEl('div', 'readout');
    if (unit) valueEl.append(createEl('span', 'readout__unit', unit));
    item.append(createEl('p', 'readout__label', label), valueEl);
    if (noteEl) item.append(noteEl);
    return item;
  }

  // Цифры 0, 5, 10 … 30 по дуге тахометра
  #placeDialNumbers(dial) {
    for (let value = 0; value <= MAX_RPM; value += 500) {
      const angle = (-120 + (value / MAX_RPM) * 240) * (Math.PI / 180);
      const mark = createEl('span', 'dial__number', String(value / 100));
      mark.style.left = `${50 + Math.sin(angle) * 33}%`;
      mark.style.top = `${50 - Math.cos(angle) * 33}%`;
      if (value >= RED_ZONE) mark.classList.add('is-red');
      dial.append(mark);
    }
  }

  #format(value) {
    return value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
}
