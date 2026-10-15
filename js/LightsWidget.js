// Виджет «Прожекторы»: носовой прожектор (луч на экране камеры)
// и ходовые огни (красная лампа — левый борт, зелёная — правый, как на судах).
// API нет — только тумблеры и то, что они включают.
import { UIComponent, createEl } from './UIComponent.js';

export class LightsWidget extends UIComponent {
  #searchlight = false;
  #navLights = false;

  get badge() {
    return 'Свет';
  }

  // Прибор ходового поста один на всю лодку — закрыть его нельзя
  get closable() {
    return false;
  }

  renderContent(body) {
    // Экран носовой камеры: темнота, а при включённом прожекторе — луч и «морской снег»
    this.view = createEl('div', 'widget__view');
    const sea = createEl('div', 'sea');
    const scene = createEl('div', 'sea__scene');
    scene.setAttribute('aria-hidden', 'true');
    const beam = createEl('div', 'sea__beam');
    beam.append(createEl('div', 'sea__snow')); // частицы видны только внутри луча
    scene.append(beam);

    this.statusLine = createEl('p', 'sea__status', 'Прожектор выключен');
    this.statusLine.setAttribute('aria-live', 'polite');
    sea.append(createEl('p', 'sea__caption', 'Носовая камера'), scene, this.statusLine);
    this.view.append(sea);

    // Тумблеры
    const switches = createEl('div', 'switches');
    switches.append(
      this.#createSwitch('searchlight', 'Носовой прожектор', (on) => this.#setSearchlight(on)),
      this.#createSwitch('nav', 'Ходовые огни', (on) => this.#setNavLights(on)),
    );

    // Ходовые огни — настоящие лампы на панели
    this.portLamp = createEl('span', 'lamp lamp--port');
    this.starboardLamp = createEl('span', 'lamp lamp--starboard');
    const navLights = createEl('div', 'navlights');
    navLights.setAttribute('aria-hidden', 'true'); // состояние и так сообщает тумблер
    navLights.append(
      this.#lampWithCaption(this.portLamp, 'Левый борт'),
      this.#lampWithCaption(this.starboardLamp, 'Правый борт'),
    );

    body.append(this.view, switches, navLights);
    this.#updateState();
  }

  #setSearchlight(on) {
    this.#searchlight = on;
    this.view.classList.toggle('is-lit', on); // CSS показывает луч
    this.statusLine.textContent = on ? 'Прожектор включён' : 'Прожектор выключен';
    this.#updateState();
  }

  #setNavLights(on) {
    this.#navLights = on;
    this.portLamp.classList.toggle('is-on', on);
    this.starboardLamp.classList.toggle('is-on', on);
    this.#updateState();
  }

  // Лампа в шапке горит, если включено хоть что-то
  #updateState() {
    this.setState(this.#searchlight || this.#navLights ? 'ok' : 'off');
  }

  // Тумблер: <button role="switch"> с aria-checked, как «Боевое освещение» в шапке
  #createSwitch(key, text, onChange) {
    const row = createEl('div', 'switch-row');
    const button = createEl('button', 'toggle');
    button.type = 'button';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', 'false');
    const lever = createEl('span', 'toggle__lever');
    lever.setAttribute('aria-hidden', 'true');
    button.append(lever);

    const label = createEl('span', 'switch-field__label', text);
    label.id = `${this.id}-${key}`;
    button.setAttribute('aria-labelledby', label.id);

    this.listen(button, 'click', () => {
      const on = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(on));
      onChange(on);
    });

    row.append(button, label);
    return row;
  }

  #lampWithCaption(lamp, caption) {
    const item = createEl('div', 'navlights__item');
    item.append(lamp, createEl('span', 'navlights__caption', caption));
    return item;
  }
}
