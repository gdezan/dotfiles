import { View } from 'gpui-kit';
import { props } from 'herdr';
import Panel from './panel.js';
import { Picker, Diff, MainDiff, Discard } from './dialogs.js';
import { Graph } from './graph/graph.js';
import { Menu } from './graph/menu.js';
import { Dialog } from './graph/dialog.js';

export default class Source extends View {
  init(_props, cx) {
    const current = props() ?? {};
    const graphController = { graph: Graph, 'graph-menu': Menu, 'graph-dialog': Dialog }[current.view];
    const Controller = graphController ?? { picker: Picker, diff: Diff, 'diff-main': MainDiff, discard: Discard }[current.view] ?? Panel;
    this.controller = new Controller();
    if (graphController) this.controller.init(cx);
    else this.controller.init(current, cx);
  }

  render(cx) { return this.controller.render(cx); }

  close() { this.controller.close?.(); }
}
