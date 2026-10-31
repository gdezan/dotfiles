import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Herdr overlay props select the requested view and retain the close target', async () => {
  const context = vm.createContext({});
  let overlayProps;
  class Controller {
    init(props) { this.props = props; }
  }
  class Panel extends Controller {}
  class Picker extends Controller {}
  class Diff extends Controller {}
  class MainDiff extends Controller {}
  class Discard extends Controller {}
  const dependencies = {
    'gpui-kit': { View: class {} },
    herdr: { props: () => overlayProps },
    './panel.js': { default: Panel },
    './dialogs.js': { Picker, Diff, MainDiff, Discard },
  };
  const code = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(code, { context });
  await module.link(name => {
    const values = dependencies[name];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const Source = module.namespace.default;
  for (const [view, Expected] of [['diff', Diff], ['diff-main', MainDiff], ['picker', Picker], ['discard', Discard]]) {
    overlayProps = { view, overlay: `overlay-${view}`, path: 'example.txt' };
    const source = new Source();
    source.init(undefined, {});
    assert.ok(source.controller instanceof Expected, `${view} should not render the Source panel`);
    assert.equal(source.controller.props.overlay, `overlay-${view}`);
  }
  overlayProps = {};
  const source = new Source();
  source.init(undefined, {});
  assert.ok(source.controller instanceof Panel);
});
