// Виджет «Морская обстановка»: температура воды и волны из Open-Meteo Marine
import { UIComponent, createEl } from './UIComponent.js';

const API_URL = 'https://marine-api.open-meteo.com/v1/marine';
const SAFE_WAVE = 1.5; // м — выше этой волны погружение с берега считаем опасным
const GAUGE_MAX = 3;   // м — правый край шкалы волн

// Число с одним знаком после запятой, по-русски: 26,8
const num = (value) => value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export class OceanWidget extends UIComponent {
  // Точки погружения с координатами
  static SPOTS = [
    { id: 'red-sea', name: 'Красное море · Хургада', lat: 27.25, lon: 34.0 },
    { id: 'black-sea', name: 'Чёрное море', lat: 43.2, lon: 34.5 },
    { id: 'malta', name: 'Средиземное море · Мальта', lat: 35.95, lon: 14.55 },
    { id: 'reef', name: 'Большой Барьерный риф', lat: -18.3, lon: 147.7 },
    { id: 'maldives', name: 'Мальдивы · Мале', lat: 4.17, lon: 73.5 },
    { id: 'japan-sea', name: 'Японское море · Владивосток', lat: 42.95, lon: 131.95 },
    { id: 'white-sea', name: 'Белое море · Карелия', lat: 66.3, lon: 33.9 },
    { id: 'baikal', name: 'Байкал (пресное озеро)', lat: 53.5, lon: 108.0 },
  ];

  get badge() {
    return 'Метео';
  }

  renderContent(body) {
    // Выпадающий список точек с подписью <label>
    const field = createEl('div', 'field');
    const label = createEl('label', 'field__label', 'Точка погружения');
    label.htmlFor = `${this.id}-spot`;

    this.select = createEl('select', 'select');
    this.select.id = `${this.id}-spot`;
    for (const spot of OceanWidget.SPOTS) {
      const option = createEl('option', '', spot.name);
      option.value = spot.id;
      this.select.append(option);
    }
    this.listen(this.select, 'change', () => this.load());
    field.append(label, this.select);

    this.view = createEl('div', 'widget__view');
    this.view.setAttribute('aria-live', 'polite');

    body.append(field, this.view);
    this.load();
  }

  // Загрузить обстановку для выбранной точки. Смена точки отменяет прошлый запрос.
  async load() {
    const spot = OceanWidget.SPOTS.find((s) => s.id === this.select.value);
    const signal = this.newSignal();
    this.showLoading(`Запрашиваю обстановку: ${spot.name}…`);

    const params = new URLSearchParams({
      latitude: spot.lat,
      longitude: spot.lon,
      current: 'wave_height,wave_period,sea_surface_temperature',
      timezone: 'auto', // время — местное для точки
    });

    try {
      const response = await fetch(`${API_URL}?${params}`, { signal });
      if (!response.ok) {
        // Open-Meteo обычно объясняет ошибку в JSON-поле reason
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.reason || `Open-Meteo ответил ошибкой ${response.status}.`);
      }
      const data = await response.json();

      const current = data.current;

      // Пустой результат: для суши и озёр (Байкал) модель отдаёт null
      if (!current || current.wave_height === null || current.wave_height === undefined) {
        const text = spot.id === 'baikal'
          ? 'Байкал — пресное озеро, морская модель волн его не покрывает. Выберите море.'
          : 'Для этой точки модель не даёт морских данных. Выберите другую.';
        this.showEmpty('Нет морских данных', text);
        return;
      }

      this.showConditions(current);
    } catch (error) {
      if (signal.aborted) return; // запрос отменили сами — это не ошибка
      this.showError(this.describeError(error), () => this.load());
    }
  }

  // Состояние «успех»: показания и вердикт
  showConditions(current) {
    const wave = current.wave_height;
    const temp = current.sea_surface_temperature;
    const isSafe = wave < SAFE_WAVE;

    const box = createEl('div', 'conditions');

    // Два прибора: температура и волны
    const readouts = createEl('div', 'readouts');
    readouts.append(
      this.#readout('Вода', temp === null ? '—' : num(temp), '°C', this.#suitAdvice(temp)),
      this.#readout('Волны', num(wave), 'м', current.wave_period ? `период ${Math.round(current.wave_period)} с` : ''),
    );

    box.append(readouts, this.#gauge(wave, isSafe), this.#verdict(wave, isSafe));

    // Время замера по местному времени точки (формат API: 2026-10-09T13:15)
    const time = current.time ? current.time.slice(11, 16) : '—';
    box.append(createEl('p', 'footnote', `Модель Open-Meteo · ${time} местного времени`));

    this.setView(box, isSafe ? 'ok' : 'danger');
  }

  #readout(label, value, unit, note) {
    const item = createEl('div', 'readout');
    const valueEl = createEl('p', 'readout__value', value);
    valueEl.append(createEl('span', 'readout__unit', unit));
    item.append(createEl('p', 'readout__label', label), valueEl);
    if (note) item.append(createEl('p', 'readout__note', note));
    return item;
  }

  // Шкала волн 0–3 м с отметкой порога 1,5 м
  #gauge(wave, isSafe) {
    const gauge = createEl('div', 'gauge');
    const track = createEl('div', 'gauge__track');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `Волна ${num(wave)} м на шкале до ${GAUGE_MAX} м, порог ${num(SAFE_WAVE)} м`);

    const fill = createEl('div', isSafe ? 'gauge__fill' : 'gauge__fill is-danger');
    fill.style.width = `${Math.min(wave / GAUGE_MAX, 1) * 100}%`;
    const limit = createEl('div', 'gauge__limit');
    limit.style.left = `${(SAFE_WAVE / GAUGE_MAX) * 100}%`;
    track.append(fill, limit);

    const scale = createEl('div', 'gauge__scale');
    scale.setAttribute('aria-hidden', 'true');
    scale.append(createEl('span', '', '0 м'), createEl('span', '', `порог ${num(SAFE_WAVE)} м`), createEl('span', '', `${GAUGE_MAX} м`));

    gauge.append(track, scale);
    return gauge;
  }

  // Простой вердикт по высоте волны
  #verdict(wave, isSafe) {
    const verdict = createEl('div', isSafe ? 'verdict' : 'verdict verdict--danger');
    const mark = createEl('span', 'verdict__mark', isSafe ? '✓' : '!');
    mark.setAttribute('aria-hidden', 'true');

    const text = createEl('div', 'verdict__text');
    const reason = isSafe
      ? `Волна ${num(wave)} м — ниже порога ${num(SAFE_WAVE)} м`
      : `Волна ${num(wave)} м — выше порога ${num(SAFE_WAVE)} м`;
    text.append(
      createEl('p', 'verdict__title', isSafe ? 'Можно погружаться' : 'Опасно'),
      createEl('p', 'verdict__reason', reason),
    );

    verdict.append(mark, text);
    return verdict;
  }

  // Подсказка по гидрокостюму в зависимости от температуры воды
  #suitAdvice(temp) {
    if (temp === null) return '';
    if (temp >= 27) return 'хватит лайкры или 3 мм';
    if (temp >= 22) return 'гидрокостюм 5 мм';
    if (temp >= 16) return 'гидрокостюм 7 мм';
    return 'нужен сухой гидрокостюм';
  }
}
