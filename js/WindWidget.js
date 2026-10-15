// Виджет «Ветер над водой»: скорость, порывы и направление ветра из Open-Meteo
import { UIComponent, createEl } from './UIComponent.js';
import { OceanWidget } from './OceanWidget.js';

// Два адреса Open-Meteo с одинаковыми прогнозами. Первым идёт historical-forecast-api:
// он хранит те же прогнозы и обновляется с каждым запуском модели. Основной адрес
// api.open-meteo.com у некоторых провайдеров блокируется и «висит» ~10 секунд,
// поэтому он только запасной.
const API_URLS = [
  'https://historical-forecast-api.open-meteo.com/v1/forecast',
  'https://api.open-meteo.com/v1/forecast',
];

const SAFE_BEAUFORT = 5; // баллов — с 5 баллов дайв-лодки обычно не выходят
const SAFE_GUSTS = 12;   // м/с — порывы сильнее этого тоже опасны

// Шкала Бофорта: верхняя граница скорости (м/с) и название ветра
const BEAUFORT = [
  [0.2, 'штиль'], [1.5, 'тихий'], [3.3, 'лёгкий'], [5.4, 'слабый'],
  [7.9, 'умеренный'], [10.7, 'свежий'], [13.8, 'сильный'], [17.1, 'крепкий'],
  [20.7, 'очень крепкий'], [24.4, 'шторм'], [28.4, 'сильный шторм'],
  [32.6, 'жестокий шторм'], [Infinity, 'ураган'],
];

// 16 румбов компаса — откуда дует ветер
const DIRECTIONS = ['северный', 'северо-северо-восточный', 'северо-восточный', 'восточно-северо-восточный',
  'восточный', 'восточно-юго-восточный', 'юго-восточный', 'юго-юго-восточный',
  'южный', 'юго-юго-западный', 'юго-западный', 'западно-юго-западный',
  'западный', 'западно-северо-западный', 'северо-западный', 'северо-северо-западный'];

// Число с одним знаком после запятой, по-русски: 9,2
const num = (value) => value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export class WindWidget extends UIComponent {
  get badge() {
    return 'Ветер';
  }

  renderContent(body) {
    // Те же точки погружения, что и у «Морской обстановки»
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

  async load() {
    const spot = OceanWidget.SPOTS.find((s) => s.id === this.select.value);
    const signal = this.newSignal();
    this.showLoading(`Измеряю ветер: ${spot.name}…`);

    const params = new URLSearchParams({
      latitude: spot.lat,
      longitude: spot.lon,
      current: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover',
      wind_speed_unit: 'ms', // метры в секунду вместо км/ч
      timezone: 'auto',
    });

    try {
      const response = await this.#fetchWithMirror(params, signal);
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.reason || `Open-Meteo ответил ошибкой ${response.status}.`);
      }
      const data = await response.json();
      const current = data.current;

      // Пустой результат: модель не дала скорость ветра
      if (!current || current.wind_speed_10m === null || current.wind_speed_10m === undefined) {
        this.showEmpty('Нет данных о ветре', 'Для этой точки модель не дала прогноз. Выберите другую.');
        return;
      }

      this.showWind(current);
    } catch (error) {
      if (signal.aborted) return; // запрос отменили сами
      this.showError(this.describeError(error), () => this.load());
    }
  }

  // Пробуем адреса по очереди: если первый недоступен по сети, берём второй
  async #fetchWithMirror(params, signal) {
    for (const [index, url] of API_URLS.entries()) {
      try {
        return await fetch(`${url}?${params}`, { signal });
      } catch (error) {
        const isLast = index === API_URLS.length - 1;
        if (signal.aborted || isLast) throw error;
      }
    }
  }

  // Состояние «успех»
  showWind(current) {
    const speed = current.wind_speed_10m;
    const gusts = current.wind_gusts_10m;
    const beaufort = BEAUFORT.findIndex(([max]) => speed <= max);
    const isSafe = beaufort < SAFE_BEAUFORT && (gusts === null || gusts < SAFE_GUSTS);

    const box = createEl('div', 'conditions');

    const readouts = createEl('div', 'readouts');
    readouts.append(
      this.#readout('Ветер', num(speed), 'м/с', `${beaufort} б. — ${BEAUFORT[beaufort][1]}`),
      this.#readout('Порывы', gusts === null ? '—' : num(gusts), 'м/с', `опасно от ${SAFE_GUSTS} м/с`),
    );

    box.append(readouts, this.#direction(current), this.#gauge(beaufort, isSafe), this.#verdict(beaufort, gusts, isSafe));

    const time = current.time ? current.time.slice(11, 16) : '—';
    box.append(createEl('p', 'footnote', `Модель Open-Meteo · ${time} местного времени`));
    this.setView(box, isSafe ? 'ok' : 'danger');
  }

  #readout(label, value, unit, note) {
    const item = createEl('div', 'readout');
    const valueEl = createEl('p', 'readout__value', value);
    valueEl.append(createEl('span', 'readout__unit', unit));
    item.append(createEl('p', 'readout__label', label), valueEl, createEl('p', 'readout__note', note));
    return item;
  }

  // Направление: стрелка показывает, куда дует ветер; текст — откуда
  #direction(current) {
    const degrees = current.wind_direction_10m;
    const row = createEl('div', 'wind-dir');

    const compass = createEl('span', 'wind-dir__compass');
    compass.setAttribute('aria-hidden', 'true');
    const arrow = createEl('span', 'wind-dir__arrow', '↓');
    arrow.style.transform = `rotate(${degrees ?? 0}deg)`;
    compass.append(arrow);

    const text = createEl('div', 'wind-dir__text');
    const name = degrees === null
      ? 'Направление неизвестно'
      : `Ветер ${DIRECTIONS[Math.round(degrees / 22.5) % 16]}, ${Math.round(degrees)}°`;
    const clouds = current.cloud_cover === null ? '' : `Облачность ${Math.round(current.cloud_cover)}%`;
    text.append(createEl('p', 'wind-dir__name', name), createEl('p', 'readout__note', clouds));

    row.append(compass, text);
    return row;
  }

  // Шкала Бофорта 0–12 с отметкой порога 5 баллов
  #gauge(beaufort, isSafe) {
    const gauge = createEl('div', 'gauge');
    const track = createEl('div', 'gauge__track');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `Ветер ${beaufort} баллов по шкале Бофорта из 12, порог ${SAFE_BEAUFORT}`);

    const fill = createEl('div', isSafe ? 'gauge__fill' : 'gauge__fill is-danger');
    fill.style.width = `${Math.max(beaufort / 12, 0.02) * 100}%`;
    const limit = createEl('div', 'gauge__limit');
    limit.style.left = `${(SAFE_BEAUFORT / 12) * 100}%`;
    track.append(fill, limit);

    // Подписи по краям; порог подписан в вердикте
    const scale = createEl('div', 'gauge__scale');
    scale.setAttribute('aria-hidden', 'true');
    scale.append(createEl('span', '', '0 б.'), createEl('span', '', 'шкала Бофорта'), createEl('span', '', '12 б.'));

    gauge.append(track, scale);
    return gauge;
  }

  #verdict(beaufort, gusts, isSafe) {
    const verdict = createEl('div', isSafe ? 'verdict' : 'verdict verdict--danger');
    const mark = createEl('span', 'verdict__mark', isSafe ? '✓' : '!');
    mark.setAttribute('aria-hidden', 'true');

    let reason = `${beaufort} б. — ниже порога ${SAFE_BEAUFORT} баллов`;
    if (beaufort >= SAFE_BEAUFORT) reason = `${beaufort} б. — лодки с ${SAFE_BEAUFORT} баллов обычно не выходят`;
    else if (!isSafe) reason = `Порывы ${num(gusts)} м/с — сильнее ${SAFE_GUSTS} м/с`;

    const text = createEl('div', 'verdict__text');
    text.append(
      createEl('p', 'verdict__title', isSafe ? 'Можно погружаться' : 'Опасно'),
      createEl('p', 'verdict__reason', reason),
    );
    verdict.append(mark, text);
    return verdict;
  }
}
