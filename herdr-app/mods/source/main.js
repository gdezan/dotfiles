import { View } from 'gpui-kit';
import { props } from 'herdr';
import Panel from './panel.js';
import { Picker, Diff, Discard } from './dialogs.js';

export default class Source extends View {
  init(_props, cx) {
    const current = props() ?? {};
    const Controller = { picker: Picker, diff: Diff, discard: Discard }[current.view] ?? Panel;
    this.controller = new Controller();
    this.controller.init(current, cx);
  }

  render(cx) { return this.controller.render(cx); }

  close() { this.controller.close?.(); }
}
