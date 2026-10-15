// Виджет «Гирокомпас»: картушка с румбами поворачивается кнопками руля.
// API нет — курс хранится в самом виджете.
import { UIComponent, createEl, createPushButton } from './UIComponent.js';

const RUDDER_STEP = 15; // на сколько градусов поворачивает одно нажатие

// 8 румбов: курс 0° — север, 90° — восток и т. д.
const RHUMBS = ['северный', 'северо-восточный', 'восточный', 'юго-восточный',
  'южный', 'юго-западный', 'западный', 'северо-западный'];

export class CompassWidget extends UIComponent {
  // Поворот картушки храним «без обрезки» (может быть 370° или −20°),
  // чтобы при переходе через север она крутилась коротким путём, а не на целый круг
  #rotation = 0;

  get badge() {
    return 'Курс';
  }

  // Прибор ходового поста один на всю лодку — закрыть его нельзя
  get closable() {
    return false;
  }

  renderContent(body) {
    this.view = createEl('div', 'widget__view');
    const screen = createEl('div', 'gyro');

    // Картушка: шкала и буквы сторон света поворачиваются вместе
    const compass = createEl('div', 'compass');
    compass.setAttribute('aria-hidden', 'true');
    this.card = createEl('div', 'compass__card');
    for (const [letter, angle] of [['С', 0], ['В', 90], ['Ю', 180], ['З', 270]]) {
      const point = createEl('span', 'compass__point', letter);
      point.style.transform = `rotate(${angle}deg)`;
      if (letter === 'С') point.classList.add('is-north');
      this.card.append(point);
    }
    // Курсовая черта — неподвижная метка сверху: под ней читается курс
    compass.append(this.card, createEl('span', 'compass__lubber'));

    this.headingValue = createEl('p', 'gyro__heading', 'КУРС 000°');
    this.rhumbValue = createEl('p', 'gyro__rhumb', 'северный');
    // Курс меняется только по нажатию — его можно озвучивать
    const readout = createEl('div', 'gyro__readout');
    readout.setAttribute('aria-live', 'polite');
    readout.append(this.headingValue, this.rhumbValue);

    screen.append(compass, readout);
    this.view.append(screen);

    // Руль: две круглые кнопки
    const actions = createEl('div', 'widget__actions');
    const left = createPushButton('Лево руля');
    const right = createPushButton('Право руля');
    this.listen(left, 'click', () => this.turn(-RUDDER_STEP));
    this.listen(right, 'click', () => this.turn(RUDDER_STEP));
    actions.append(left, right);

    body.append(this.view, actions);
    this.setState('ok');
  }

  // Повернуть на delta градусов (минус — влево)
  turn(delta) {
    this.#rotation += delta;
    const heading = ((this.#rotation % 360) + 360) % 360; // 0…359
    // Картушка крутится в обратную сторону: лодка повернула вправо — шкала уехала влево
    this.card.style.transform = `rotate(${-this.#rotation}deg)`;
    this.headingValue.textContent = `КУРС ${String(heading).padStart(3, '0')}°`;
    this.rhumbValue.textContent = RHUMBS[Math.round(heading / 45) % 8];
  }
}
