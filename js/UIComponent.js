// Базовый класс виджета: общая обёртка (шапка с кнопками), учёт обработчиков,
// отмена запросов и общие состояния «загрузка / пусто / ошибка».

// Маленький помощник: создать элемент с классом и текстом.
// Текст всегда кладём через textContent — так данные из API не превратятся в HTML.
export function createEl(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

// Круглая красная кнопка «как на пульте» с подписью справа (стили .push в main.css).
// Подпись потом можно поменять: button.querySelector('.push__label').textContent = '…'
export function createPushButton(label) {
  const button = createEl('button', 'push');
  button.type = 'button';
  const bezel = createEl('span', 'push__bezel');
  bezel.setAttribute('aria-hidden', 'true');
  bezel.append(createEl('span', 'push__cap'));
  button.append(bezel, createEl('span', 'push__label', label));
  return button;
}

export class UIComponent {
  // Приватные поля (инкапсуляция): снаружи и из наследников к ним не добраться
  #listeners = [];    // все навешанные обработчики, чтобы снять их в destroy()
  #controller = null; // AbortController текущего запроса
  #timers = [];       // таймеры (setInterval / setTimeout), чтобы остановить их в destroy()
  #isClosing = false; // защита от двойного нажатия «Закрыть»

  constructor({ id, title, onClose = null }) {
    this.id = id;
    this.title = title;
    this.onClose = onClose; // колбэк от Dashboard: «меня закрыли, убери из списка»
    this.element = null;    // корневой <article> виджета
    this.view = null;       // область для данных — её создаёт наследник
    this.isMinimized = false;
  }

  // Короткая метка в шапке. Наследники переопределяют (полиморфизм).
  get badge() {
    return 'Виджет';
  }

  // Можно ли закрыть виджет. Приборы ходового поста существуют в одном
  // экземпляре и переопределяют это свойство на false (полиморфизм)
  get closable() {
    return true;
  }

  // Содержимое виджета. Наследники обязаны переопределить (полиморфизм).
  renderContent(body) {
    body.append(createEl('p', '', 'Пустой виджет'));
  }

  // Повесить обработчик и запомнить его
  listen(target, type, handler) {
    target.addEventListener(type, handler);
    this.#listeners.push({ target, type, handler });
  }

  // Повторять fn каждые ms миллисекунд, пока виджет жив
  every(ms, fn) {
    this.#timers.push({ id: setInterval(fn, ms), repeat: true });
  }

  // Выполнить fn один раз через ms миллисекунд (если виджет ещё жив)
  after(ms, fn) {
    this.#timers.push({ id: setTimeout(fn, ms), repeat: false });
  }

  // Начать новый запрос: отменить предыдущий и вернуть signal для fetch
  newSignal() {
    this.#controller?.abort();
    this.#controller = new AbortController();
    return this.#controller.signal;
  }

  // Собрать DOM виджета: шапка (метка, заголовок, кнопки) + тело
  render() {
    const article = createEl('article', 'widget');
    article.tabIndex = -1; // чтобы панель могла перевести сюда фокус
    article.setAttribute('aria-labelledby', `${this.id}-title`);

    const head = createEl('header', 'widget__head');
    // Сигнальная лампа: цвет зависит от состояния виджета (data-state, см. setView)
    const lamp = createEl('span', 'lamp');
    lamp.setAttribute('aria-hidden', 'true');

    const heading = createEl('div', 'widget__heading');
    const title = createEl('h2', 'widget__title', this.title);
    title.id = `${this.id}-title`;
    heading.append(createEl('span', 'widget__tag', this.badge), title);

    const body = createEl('div', 'widget__body');
    body.id = `${this.id}-body`;

    const controls = createEl('div', 'widget__controls');
    this.minButton = this.#createIconButton('–', `Свернуть «${this.title}»`);
    this.minButton.setAttribute('aria-expanded', 'true');
    this.minButton.setAttribute('aria-controls', body.id);
    controls.append(this.minButton);
    this.listen(this.minButton, 'click', () => this.minimize());

    // Кнопка «Закрыть» — только у тех виджетов, которые можно закрыть
    if (this.closable) {
      const closeButton = this.#createIconButton('×', `Закрыть «${this.title}»`);
      closeButton.classList.add('icon-btn--close');
      controls.append(closeButton);
      this.listen(closeButton, 'click', () => this.close());
    }

    // Ручка для перетаскивания. Саму логику (мышь, палец, стрелки) ведёт Dashboard,
    // потому что порядок виджетов — это забота панели, а не виджета.
    const handle = this.#createIconButton('⠿', `Переместить «${this.title}», стрелки сдвигают`);
    handle.classList.add('widget__handle');
    handle.title = 'Перетащите или нажимайте стрелки';

    head.append(handle, lamp, heading, controls);
    article.append(head, body);
    this.element = article;
    this.body = body;

    this.renderContent(body); // тут наследник рисует своё и запускает загрузку
    return article;
  }

  // Свернуть / развернуть тело виджета
  minimize() {
    this.isMinimized = !this.isMinimized;
    this.body.hidden = this.isMinimized;
    this.element.classList.toggle('is-minimized', this.isMinimized);

    const action = this.isMinimized ? 'Развернуть' : 'Свернуть';
    this.minButton.setAttribute('aria-expanded', String(!this.isMinimized));
    this.minButton.setAttribute('aria-label', `${action} «${this.title}»`);
    this.minButton.title = action;
    this.minButton.firstChild.textContent = this.isMinimized ? '+' : '–';
  }

  // Закрыть: проиграть анимацию ухода, потом попросить Dashboard удалить виджет
  close() {
    if (this.#isClosing) return;
    this.#isClosing = true;

    const finish = () => (this.onClose ? this.onClose(this.id) : this.destroy());
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      finish();
      return;
    }

    this.element.classList.add('is-leaving');
    this.listen(this.element, 'animationend', (event) => {
      // animationend «всплывает» от детей (например, от сонара) — ждём именно свою анимацию
      if (event.target === this.element) finish();
    });
    // Запасной вариант: в фоновой вкладке браузер может заморозить анимацию,
    // и animationend не придёт. Повторный вызов безопасен: removeWidget
    // просто не найдёт уже удалённый виджет.
    setTimeout(finish, 700);
  }

  // Полная уборка: отменить запрос, снять обработчики, удалить из DOM
  destroy() {
    this.#controller?.abort();
    this.#controller = null;

    for (const { id, repeat } of this.#timers) {
      if (repeat) clearInterval(id);
      else clearTimeout(id);
    }
    this.#timers = [];

    for (const { target, type, handler } of this.#listeners) {
      target.removeEventListener(type, handler);
    }
    this.#listeners = [];

    this.element?.remove();
    this.element = null;
  }

  // ---------- Общие состояния (успех каждый виджет рисует сам) ----------

  // Заменить содержимое области данных.
  // state — состояние виджета: loading / empty / error / ok / danger.
  // Его видно по лампе в шапке (CSS смотрит на атрибут data-state).
  setView(node, state = 'ok') {
    this.view.replaceChildren(node);
    this.setState(state);
  }

  // Поменять только состояние (лампу), не трогая содержимое экрана.
  // Кроме состояний API-виджетов есть 'off' — прибор выключен, лампа не горит
  setState(state) {
    this.element.dataset.state = state;
    this.view?.setAttribute('aria-busy', String(state === 'loading'));
  }

  showLoading(text) {
    const box = createEl('div', 'status status--loading');
    const sonar = createEl('div', 'sonar');
    sonar.setAttribute('aria-hidden', 'true');
    box.append(sonar, createEl('p', 'status__text', text));
    this.setView(box, 'loading');
  }

  showEmpty(title, text, onRetry) {
    this.setView(this.#createStatus('empty', '∅', title, text, onRetry), 'empty');
  }

  showError(text, onRetry) {
    this.setView(this.#createStatus('error', '!', 'Не удалось загрузить', text, onRetry), 'error');
  }

  // Понятное сообщение для разных видов ошибок
  describeError(error) {
    if (error instanceof TypeError) {
      return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
    }
    return error.message;
  }

  #createStatus(kind, icon, title, text, onRetry) {
    const box = createEl('div', `status status--${kind}`);
    const mark = createEl('span', 'status__icon', icon);
    mark.setAttribute('aria-hidden', 'true');
    box.append(mark, createEl('p', 'status__title', title), createEl('p', 'status__text', text));

    if (onRetry) {
      const retry = createEl('button', 'btn btn--screen', 'Попробовать снова');
      retry.type = 'button';
      this.listen(retry, 'click', onRetry);
      box.append(retry);
    }
    return box;
  }

  #createIconButton(symbol, label) {
    const button = createEl('button', 'icon-btn');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label.split(' ')[0]; // всплывающая подсказка: «Свернуть» / «Закрыть»
    const glyph = createEl('span', '', symbol);
    glyph.setAttribute('aria-hidden', 'true');
    button.append(glyph);
    return button;
  }
}
