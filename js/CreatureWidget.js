// Виджет «Сканер существ»: случайное морское животное из iNaturalist
import { UIComponent, createEl, createPushButton } from './UIComponent.js';

const API_URL = 'https://api.inaturalist.org/v1/observations';

// Берём случайную страницу из первых 1000 (по 1 наблюдению на странице).
// У iNaturalist page × per_page не может быть больше 10 000.
const MAX_PAGE = 1000;

export class CreatureWidget extends UIComponent {
  // Группы морских животных — ID таксонов iNaturalist.
  // Весь класс «Лучепёрые рыбы» не берём: в нём много пресноводных рыб.
  static GROUPS = [
    { id: 47459, name: 'Головоногие' },
    { id: 48332, name: 'Медузы' },
    { id: 47273, name: 'Акулы и скаты' },
    { id: 47113, name: 'Голожаберные моллюски' },
    { id: 47668, name: 'Морские звёзды' },
    { id: 47318, name: 'Рыбы-бабочки' },
    { id: 48313, name: 'Рыбы-ласточки и клоуны' },
    { id: 49284, name: 'Губановые рыбы' },
    { id: 47177, name: 'Иглобрюхообразные' },
    { id: 372234, name: 'Морские черепахи' },
    { id: 152871, name: 'Китообразные' },
  ];

  get badge() {
    return 'Сонар';
  }

  renderContent(body) {
    // Область данных: aria-live — экранный диктор прочитает результат
    this.view = createEl('div', 'widget__view');
    this.view.setAttribute('aria-live', 'polite');

    const actions = createEl('div', 'widget__actions');
    // Круглая красная кнопка в металлическом кольце, подпись справа
    const scanButton = createPushButton('Сканировать');
    this.listen(scanButton, 'click', () => this.scan());
    actions.append(scanButton, createEl('span', 'widget__hint', 'Фото и определение — iNaturalist'));

    body.append(this.view, actions);
    this.scan();
  }

  // Загрузить случайное существо. Повторное нажатие отменяет прошлый запрос.
  async scan() {
    const signal = this.newSignal();
    const groups = CreatureWidget.GROUPS;
    const group = groups[Math.floor(Math.random() * groups.length)];
    const page = 1 + Math.floor(Math.random() * MAX_PAGE);

    this.showLoading(`Сканирую: ${group.name.toLowerCase()}…`);

    const params = new URLSearchParams({
      taxon_id: group.id,
      photos: 'true',             // только наблюдения с фото
      quality_grade: 'research',  // только подтверждённые сообществом
      per_page: '1',
      page: String(page),         // случайная страница = случайное наблюдение
      locale: 'ru',               // русские названия, если они есть
    });

    try {
      const response = await fetch(`${API_URL}?${params}`, { signal });
      if (response.status === 429) {
        throw new Error('Слишком много запросов к iNaturalist. Подождите минуту.');
      }
      if (!response.ok) {
        throw new Error(`iNaturalist ответил ошибкой ${response.status}.`);
      }

      const data = await response.json();
      const observation = data.results?.[0];

      // Пустой результат: страница за пределами выборки или нет фото
      if (!observation || !observation.taxon || !observation.photos?.length) {
        this.showEmpty(
          'Никого не нашли',
          `В этом квадрате (${group.name.toLowerCase()}) пусто. Попробуйте ещё раз.`,
          () => this.scan(),
        );
        return;
      }

      this.showCreature(observation, group);
    } catch (error) {
      if (signal.aborted) return; // запрос отменили сами — это не ошибка
      this.showError(this.describeError(error), () => this.scan());
    }
  }

  // Состояние «успех»: карточка существа
  showCreature(observation, group) {
    const { taxon } = observation;
    const photo = observation.photos[0];
    const latinName = taxon.name;
    const ruName = taxon.preferred_common_name; // может отсутствовать

    const figure = createEl('figure', 'specimen');

    const img = createEl('img', 'specimen__photo');
    img.src = photo.url.replace('/square.', '/medium.'); // API отдаёт миниатюру, берём размер побольше
    img.alt = ruName || latinName;
    img.decoding = 'async';

    const caption = createEl('figcaption', 'specimen__caption');
    const name = createEl('h3', 'specimen__name', ruName || latinName);
    const latin = createEl('p', 'specimen__latin', ruName ? latinName : 'Русского названия нет');

    const facts = createEl('dl', 'facts');
    this.#addFact(facts, 'Место', observation.place_guess || 'Скрыто наблюдателем');
    this.#addFact(facts, 'Дата', this.#formatDate(observation.observed_on));

    // Ссылку собираем сами из числового id, а не берём адрес из ответа
    const link = createEl('a', 'link', 'Открыть наблюдение на iNaturalist ↗');
    link.href = `https://www.inaturalist.org/observations/${Number(observation.id)}`;
    link.target = '_blank';
    link.rel = 'noopener';

    // Фото на iNaturalist под лицензиями — указываем автора
    const credit = createEl('p', 'specimen__credit', photo.attribution || '');

    caption.append(createEl('span', 'chip', group.name), name, latin, facts, link, credit);
    figure.append(img, caption);
    this.setView(figure);
  }

  #addFact(list, term, value) {
    list.append(createEl('dt', '', term), createEl('dd', '', value));
  }

  #formatDate(isoDate) {
    if (!isoDate) return 'Не указана';
    const date = new Date(`${isoDate}T00:00:00`);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
