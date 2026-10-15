// Панель: хранит активные виджеты, добавляет, удаляет и переставляет их,
// раскладывает «кирпичиками»
import { CreatureWidget } from './CreatureWidget.js';
import { OceanWidget } from './OceanWidget.js';
import { WindWidget } from './WindWidget.js';
import { EngineWidget } from './EngineWidget.js';
import { CompassWidget } from './CompassWidget.js';
import { LightsWidget } from './LightsWidget.js';

// Какие виджеты умеет создавать панель: тип → класс и название
const WIDGET_TYPES = {
  creature: { WidgetClass: CreatureWidget, title: 'Сканер существ' },
  ocean: { WidgetClass: OceanWidget, title: 'Морская обстановка' },
  wind: { WidgetClass: WindWidget, title: 'Ветер над водой' },
  engine: { WidgetClass: EngineWidget, title: 'Двигатель' },
  compass: { WidgetClass: CompassWidget, title: 'Гирокомпас' },
  lights: { WidgetClass: LightsWidget, title: 'Прожекторы' },
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Dashboard {
  #widgets = [];                          // активные виджеты (приватно); порядок = порядок на экране
  #counters = {};                         // сколько виджетов каждого типа создано — для id и номеров
  #container;
  #announcer;
  #emptyNote;
  #drag = null; // что сейчас перетаскиваем: { widget, offsetX, offsetY, lastTarget, moved }

  // Следит за высотой виджетов: изменилась высота — пересчитываем место в сетке
  #resizeObserver = new ResizeObserver((entries) => {
    this.#withGlide(() => {
      for (const entry of entries) this.#fitToGrid(entry.target);
    });
  });

  constructor(container, announcer) {
    this.#container = container;
    this.#announcer = announcer;

    // Подсказка для пустой панели
    this.#emptyNote = document.createElement('p');
    this.#emptyNote.className = 'dashboard__empty';
    this.#emptyNote.tabIndex = -1;
    this.#emptyNote.textContent = 'Панель пуста. Добавьте виджет кнопками вверху.';
    this.#container.append(this.#emptyNote);
    this.#resizeObserver.observe(this.#emptyNote);
    this.#update();

    // Перетаскивание. Делегирование событий: один обработчик на всю панель
    // вместо отдельного на каждом виджете. Панель живёт всё время, поэтому
    // эти обработчики снимать не нужно.
    container.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    container.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    container.addEventListener('pointerup', () => this.#endDrag());
    container.addEventListener('lostpointercapture', () => this.#endDrag());
    container.addEventListener('keydown', (e) => this.#onHandleKey(e));
  }

  // Создать виджет нужного типа и показать его
  addWidget(widgetType) {
    const type = WIDGET_TYPES[widgetType];
    if (!type) {
      throw new Error(`Неизвестный тип виджета: ${widgetType}`);
    }

    const number = (this.#counters[widgetType] ?? 0) + 1;
    this.#counters[widgetType] = number;

    const widget = new type.WidgetClass({
      id: `${widgetType}-${number}`,
      title: `${type.title} №${number}`,
      onClose: (id) => this.removeWidget(id),
    });

    // Полиморфизм: дальше панель работает с любым виджетом одинаково
    this.#widgets.push(widget);
    this.#container.append(widget.render());
    this.#resizeObserver.observe(widget.element);
    this.#playEntrance(widget.element);
    this.#update();
    this.#announce(`Добавлен виджет «${widget.title}»`);
    return widget;
  }

  // Удалить виджет: destroy() и убрать из массива
  removeWidget(widgetId) {
    const index = this.#widgets.findIndex((w) => w.id === widgetId);
    if (index === -1) return;

    const [widget] = this.#widgets.splice(index, 1);
    this.#resizeObserver.unobserve(widget.element);
    this.#withGlide(() => widget.destroy()); // остальные плавно сдвинутся на освободившееся место
    this.#update();
    this.#announce(`Виджет «${widget.title}» закрыт`);

    // Переводим фокус на соседний виджет, чтобы клавиатура не «потерялась»
    const neighbour = this.#widgets[index] ?? this.#widgets[index - 1];
    if (neighbour) neighbour.element.focus();
    else this.#emptyNote.focus();
  }

  // Переставить виджет на новое место (в массиве и в DOM)
  moveWidget(widget, newIndex) {
    const from = this.#widgets.indexOf(widget);
    if (from === -1 || newIndex < 0 || newIndex >= this.#widgets.length || newIndex === from) return;

    this.#withGlide(() => {
      this.#widgets.splice(from, 1);
      this.#widgets.splice(newIndex, 0, widget);

      // Порядок в DOM = порядок в массиве; сетка сама разложит виджеты заново.
      // Сам перемещаемый элемент не трогаем, а переставляем соседей вокруг него:
      // если вынуть его из DOM, браузер «отпустит» мышь и сбросит фокус.
      const pivot = widget.element;
      for (const w of this.#widgets.slice(0, newIndex)) this.#container.insertBefore(w.element, pivot);
      for (const w of this.#widgets.slice(newIndex + 1)) this.#container.append(w.element);
    });
  }

  // Показать виджет: прокрутить к нему, коротко подсветить и перевести на него фокус
  // (так и зрячий, и пользователь экранного диктора сразу оказываются у нового виджета)
  reveal(widget) {
    // Чуть ждём, чтобы сетка успела разложить новый виджет по своему месту
    setTimeout(() => {
      const element = widget.element;
      if (!element) return; // виджет успели закрыть

      element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      element.focus({ preventScroll: true });
      element.classList.add('is-highlighted');
      setTimeout(() => element.classList.remove('is-highlighted'), 1200);
    }, 60);
  }

  get count() {
    return this.#widgets.length;
  }

  // ---------- Перетаскивание мышью и пальцем ----------

  #onPointerDown(event) {
    // Тащить можно за шапку виджета, но не за кнопки «Свернуть» и «Закрыть»
    const head = event.target.closest('.widget__head');
    if (!head || event.button !== 0) return;
    if (event.target.closest('button:not(.widget__handle)')) return;
    // На телефоне шапку оставляем для прокрутки страницы, тащим только за ручку
    if (event.pointerType === 'touch' && !event.target.closest('.widget__handle')) return;

    const widget = this.#widgets.find((w) => w.element.contains(head));
    if (!widget) return;

    event.preventDefault(); // не выделять текст во время перетаскивания
    head.setPointerCapture(event.pointerId); // все движения мыши теперь придут сюда

    const rect = widget.element.getBoundingClientRect();
    this.#drag = {
      widget,
      offsetX: event.clientX - rect.left, // где внутри виджета его «взяли»
      offsetY: event.clientY - rect.top,
      lastTarget: null,
      moved: false, // был ли сдвиг (простой клик по шапке — не перетаскивание)
    };
    widget.element.classList.add('is-dragging');
  }

  #onPointerMove(event) {
    if (!this.#drag) return;
    const { widget } = this.#drag;
    this.#drag.moved = true;

    // Если курсор над другим виджетом — занимаем его место
    const target = this.#widgetAt(event.clientX, event.clientY, widget);
    if (target && target !== this.#drag.lastTarget) {
      this.moveWidget(widget, this.#widgets.indexOf(target));
    }
    // Запоминаем, над кем были: так виджеты разного размера не «мигают» туда-обратно
    this.#drag.lastTarget = target;

    this.#followPointer(event.clientX, event.clientY);
  }

  // Виджет едет за курсором: сдвигаем его от «своего» места в сетке
  #followPointer(x, y) {
    const { widget, offsetX, offsetY } = this.#drag;
    const el = widget.element;
    el.style.transform = '';
    const slot = el.getBoundingClientRect(); // где виджет стоял бы без сдвига
    const dx = x - offsetX - slot.left;
    const dy = y - offsetY - slot.top;
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(1.5deg)`;
  }

  // Какой виджет под точкой (x, y). Берём offsetLeft/offsetTop — это места
  // в сетке без учёта анимаций, поэтому проверка не дёргается, пока соседи едут.
  #widgetAt(x, y, except) {
    const origin = this.#container.offsetParent.getBoundingClientRect();
    const px = x - origin.left;
    const py = y - origin.top;
    return this.#widgets.find((w) => {
      if (w === except) return false;
      const el = w.element;
      return px >= el.offsetLeft && px <= el.offsetLeft + el.offsetWidth
        && py >= el.offsetTop && py <= el.offsetTop + el.offsetHeight;
    });
  }

  // Отпустили: виджет мягко встаёт на своё новое место
  #endDrag() {
    if (!this.#drag) return;
    const { widget, moved } = this.#drag;
    this.#drag = null;

    const el = widget.element;
    const from = el.style.transform;
    el.style.transform = '';
    el.classList.remove('is-dragging');
    if (from && !prefersReducedMotion()) {
      el.animate([{ transform: from }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
    }
    if (moved) this.#announcePosition(widget);
  }

  // ---------- Перестановка с клавиатуры ----------

  // Стрелки на ручке ⠿: влево/вверх — на место раньше, вправо/вниз — позже
  #onHandleKey(event) {
    const handle = event.target.closest('.widget__handle');
    if (!handle) return;

    const steps = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault(); // чтобы страница не прокручивалась

    const widget = this.#widgets.find((w) => w.element.contains(handle));
    this.moveWidget(widget, this.#widgets.indexOf(widget) + step);
    handle.focus(); // при переносе в DOM фокус теряется — возвращаем
    this.#announcePosition(widget);
  }

  #announcePosition(widget) {
    const place = this.#widgets.indexOf(widget) + 1;
    this.#announce(`«${widget.title}»: место ${place} из ${this.#widgets.length}`);
  }

  // ---------- Раскладка и анимации ----------

  // Раскладка «кирпичиками»: строки сетки по 1px (см. main.css),
  // виджет занимает столько строк, сколько в нём пикселей + отступ.
  // Поэтому каждый виджет встаёт прямо под верхний, без пустых дыр.
  #fitToGrid(element) {
    const gap = parseFloat(getComputedStyle(this.#container).columnGap) || 0;
    const height = element.offsetHeight; // высота без учёта transform-анимаций
    element.style.gridRowEnd = height > 0 ? `span ${Math.ceil(height + gap)}` : '';
  }

  // Анимация FLIP: запомнить, где стояли виджеты, внести изменение,
  // а потом плавно «довезти» каждый виджет со старого места на новое
  #withGlide(change) {
    const before = new Map(this.#widgets.map((w) => [w, w.element.getBoundingClientRect()]));
    change();
    if (prefersReducedMotion()) return;

    for (const [widget, old] of before) {
      // Удалённый и перетаскиваемый (он и так едет за курсором) не анимируем
      if (!widget.element || widget === this.#drag?.widget) continue;
      const now = widget.element.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue; // не сдвинулся

      widget.element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
  }

  // Появление нового виджета: прибор встаёт на место, экран «включается».
  // Класс is-entering снимаем после анимации, иначе она проигрывалась бы
  // заново при каждой перестановке элемента в DOM.
  #playEntrance(element) {
    if (prefersReducedMotion()) return;
    element.classList.add('is-entering');
    setTimeout(() => element.classList.remove('is-entering'), 900);
  }

  #update() {
    this.#emptyNote.hidden = this.#widgets.length > 0;
  }

  #announce(message) {
    this.#announcer.textContent = message;
  }
}
