import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { galleryArtworkShareUrl } from "../src/components/gallery/gallery-artwork-link.ts";

const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
const shareSource = compile("src/components/gallery/gallery-share-control.tsx");
const protectionSource = compile("src/components/content-protection.tsx");

function mountShare(id, writeText = async () => Promise.reject(new Error("Denied"))) {
  const state = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let cleanup;
  const module = {};
  runInNewContext(shareSource, {
    exports: module,
    window: { location: { origin: "https://gallery.example" } },
    navigator: { clipboard: { writeText } },
    require: (name) => {
      if (name === "react") {
        return {
          useState(initial) {
            const index = stateIndex++;
            if (!(index in state)) state[index] = initial;
            return [state[index], (value) => (state[index] = value)];
          },
          useRef(initial) {
            const index = refIndex++;
            return (refs[index] ??= { current: initial });
          },
          useEffect(effect) {
            cleanup ??= effect();
          },
        };
      }
      if (name === "./gallery-artwork-link") return { galleryArtworkShareUrl };
      if (name === "react/jsx-runtime") {
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      }
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    return module.GalleryShareControl({ id, disabled: false });
  };
  return {
    render,
    async copy() {
      render().props.children[0].props.onClick();
      await new Promise((resolve) => setImmediate(resolve));
      return render();
    },
    unmount: () => cleanup(),
  };
}

function contentProtection() {
  class HTMLElement {
    constructor(properties = {}) {
      Object.assign(this, properties);
    }
    matches() {
      return Boolean(this.disabled);
    }
  }
  class HTMLInputElement extends HTMLElement {}
  class HTMLTextAreaElement extends HTMLElement {}
  const listeners = new Map();
  const module = {};
  runInNewContext(protectionSource, {
    exports: module,
    HTMLElement,
    HTMLInputElement,
    HTMLTextAreaElement,
    document: {
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener() {},
    },
    require: () => ({ useEffect: (effect) => effect() }),
  });
  module.ContentProtection();
  return {
    input: (props) => new HTMLInputElement(props),
    body: new HTMLElement(),
    fire(type, target, properties = {}) {
      let prevented = false;
      let stopped = false;
      listeners.get(type)({
        type,
        target,
        ...properties,
        preventDefault: () => (prevented = true),
        stopPropagation: () => (stopped = true),
      });
      return { prevented, stopped };
    },
  };
}

function fallbackInput(tree) {
  const fallback = tree.props.children[2];
  const label = fallback.props.children[1];
  assert.equal(label.props.children[0], "この作品のリンク");
  return label.props.children[1].props;
}

test("denied clipboard reveals a selectable URL that permits native copy, menus and shortcuts", async () => {
  const ui = mountShare("g03");
  const input = fallbackInput(await ui.copy());
  assert.equal(input.type, "url");
  assert.equal(input.value, "https://gallery.example/gallery?work=g03");
  assert.equal(input.readOnly, undefined);
  assert.equal(typeof input.onChange, "function", "the URL must remain editable");
  let selected = 0;
  const currentTarget = { select: () => selected++ };
  input.onFocus({ currentTarget });
  input.onClick({ currentTarget });
  assert.equal(selected, 2);

  const protection = contentProtection();
  const target = protection.input(input);
  for (const type of ["copy", "contextmenu"]) {
    assert.equal(protection.fire(type, target).prevented, false, type);
    assert.equal(protection.fire(type, protection.body).prevented, true, `${type} stays protected`);
  }
  for (const properties of [
    { key: "c", metaKey: true },
    { key: "C", ctrlKey: true },
  ]) {
    assert.deepEqual(protection.fire("keydown", target, properties), {
      prevented: false,
      stopped: false,
    });
  }
});

test("a newly mounted artwork control receives its own current URL after clipboard denial", async () => {
  const first = mountShare("g03");
  assert.equal(fallbackInput(await first.copy()).value, "https://gallery.example/gallery?work=g03");
  first.unmount();
  const next = mountShare("g04");
  assert.equal(
    next.render().props.children[2],
    false,
    "previous fallback does not survive remount",
  );
  assert.equal(fallbackInput(await next.copy()).value, "https://gallery.example/gallery?work=g04");
});

test("retry restores the canonical URL after editing, with rejected or unavailable clipboard APIs", async () => {
  for (const writeText of [async () => Promise.reject(new Error("Denied")), null]) {
    const ui = mountShare("g03", writeText);
    const input = fallbackInput(await ui.copy());
    input.onChange({ currentTarget: { value: "https://edited.invalid/" } });
    assert.equal(fallbackInput(ui.render()).value, "https://edited.invalid/");
    assert.equal(fallbackInput(await ui.copy()).value, "https://gallery.example/gallery?work=g03");
  }
});
