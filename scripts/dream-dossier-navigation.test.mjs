import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/dream-chapter/dream-chapter.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("dream-chapter.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const chapter = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "DreamChapter");
const navigation = chapter.body.statements.find((node) => ts.isExpressionStatement(node)
  && node.expression.expression?.getText(file) === "useLayoutEffect"
  && node.expression.arguments.at(-1)?.getText(file) === "[dossierHash]");
assert.ok(navigation, "direct record links are handled by the mounted route's current hash");
const data = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../src/components/dream-chapter/dream-chapter-data.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: data });

function openFragment(hash, { missing = false, outside = false } = {}) {
  class Button {}
  const trigger = new Button();
  const result = { character: null, dolminence: null, menu: true };
  const refs = { character: { current: null }, dolminence: { current: null } };
  runInNewContext(ts.transpileModule(navigation.getText(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    useLayoutEffect: (effect) => effect(), dossierHash: hash,
    DREAM_CHARACTERS: data.DREAM_CHARACTERS, DREAM_DOLMINENCE: data.DREAM_DOLMINENCE,
    document: { getElementById: (id) => missing || id !== hash.replace(/^#/, "") ? null : trigger },
    HTMLButtonElement: Button, pageRef: { current: { contains: () => !outside } },
    characterTriggerRef: refs.character, dolminenceTriggerRef: refs.dolminence,
    setCharacter: (value) => { result.character = value; },
    setDolminenceRecord: (value) => { result.dolminence = value; },
    setCharacterOpenedByKeyboard: (value) => { result.characterKeyboard = value; },
    setDolminenceOpenedByKeyboard: (value) => { result.dolminenceKeyboard = value; },
    setMenuOpen: (value) => { result.menu = value; },
  });
  return { result, refs, trigger };
}

test("all seven precise record hashes open the existing dossier and retain its own return trigger", () => {
  for (const character of data.DREAM_CHARACTERS) {
    const ui = openFragment(`dream-character-${character.id}`);
    assert.equal(ui.result.character, character);
    assert.equal(ui.result.dolminence, null);
    assert.equal(ui.refs.character.current, ui.trigger);
    assert.equal(ui.result.characterKeyboard, true);
    assert.equal(ui.result.menu, false);
  }
  for (const record of data.DREAM_DOLMINENCE) {
    const ui = openFragment(`#dream-dolminence-${record.id}`);
    assert.equal(ui.result.dolminence, record);
    assert.equal(ui.result.character, null);
    assert.equal(ui.refs.dolminence.current, ui.trigger);
    assert.equal(ui.result.dolminenceKeyboard, true);
  }
  const keiya = openFragment("dream-character-keiya").result.character;
  assert.ok(keiya.sections.some((section) => section.items?.some((item) => item.name === "魔力ねじれ")),
    "the matched modal-only phrase is now rendered in the opened record");
});

test("ordinary, malformed, unknown or absent fragment targets never open a dossier", () => {
  for (const hash of ["", "characters", "dolminence", "dream-case-5", "%ZZ", "dream-character-unknown", "dream-dolminence-keiya"]) {
    const ui = openFragment(hash);
    assert.equal(ui.result.character, null);
    assert.equal(ui.result.dolminence, null);
    assert.equal(ui.result.menu, true);
  }
  for (const options of [{ missing: true }, { outside: true }]) {
    assert.equal(openFragment("dream-character-keiya", options).result.character, null);
  }
  assert.match(source, /useRouterState\(\{ select: \(state\) => state.location.hash \}\)/);
});

function mountDialog(name, record, keyboard = true) {
  const fn = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const exports = {};
  const events = [], frames = [], subscribers = new Set();
  let cleanup, refIndex = 0;
  class Element {
    constructor(label) { this.label = label; }
    focus() { events.push(`focus:${this.label}`); }
    blur() { events.push(`blur:${this.label}`); }
  }
  const trigger = new Element("trigger"), close = new Element("close");
  const dialog = Object.assign(new Element("dialog"), {
    open: false,
    showModal() { this.open = true; events.push("show"); },
    close() { this.open = false; events.push("dialog-close"); },
  });
  const jsx = (type, props) => ({ type, props });
  runInNewContext(ts.transpileModule(`${fn.getText(file)}\nexports.Dialog = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, require: () => ({ jsx, jsxs: jsx }),
    useRef: () => ({ current: [dialog, close][refIndex++] }),
    useEffect: (effect) => { cleanup = effect(); },
    useRouter: () => ({ history: { subscribe: (subscriber) => {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    } } }),
    lockDreamViewport: () => { events.push("lock"); return () => events.push("unlock"); },
    settlePickupScroll: () => () => events.push("stop-settling"),
    document: { activeElement: trigger }, HTMLElement: Element,
    window: { requestAnimationFrame: (callback) => frames.push(callback) },
    LiquidPointerGlow: () => {}, DossierContent: () => {}, DolminenceContent: () => {},
  });
  const tree = exports.Dialog({ character: record, record, openedByKeyboard: keyboard,
    trigger, onClose: () => events.push("close-state") });
  return { events, dialog, tree, cleanup: () => { cleanup(); frames.splice(0).forEach((fn) => fn()); },
    history: (type) => subscribers.forEach((fn) => fn({ action: { type } })), subscribers };
}

for (const [name, record] of [["CharacterDialog", data.DREAM_CHARACTERS[1]], ["DolminenceDialog", data.DREAM_DOLMINENCE[0]]]) {
  test(`${name}: direct opening, Escape and explicit close preserve keyboard return focus`, () => {
    const ui = mountDialog(name, record);
    assert.equal(ui.dialog.open, true);
    assert.ok(ui.events.includes("focus:close"));
    let prevented = false;
    ui.tree.props.onCancel({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.ok(ui.events.includes("close-state"));
    ui.cleanup();
    assert.equal(ui.dialog.open, false);
    assert.ok(ui.events.includes("focus:trigger"));
    assert.equal(ui.subscribers.size, 0);
    const closeUi = mountDialog(name, record);
    closeUi.tree.props.children.props.children[0].props.onClick({ detail: 0 });
    assert.ok(closeUi.events.includes("close-state"));
    closeUi.cleanup();
    assert.ok(closeUi.events.includes("focus:trigger"));
  });

  test(`${name}: browser history cancels settling and releases the old page without restoring its trigger`, () => {
    for (const action of ["BACK", "FORWARD", "GO"]) {
      const ui = mountDialog(name, record);
      ui.events.length = 0;
      ui.history(action);
      assert.deepEqual(ui.events.slice(0, 4), ["stop-settling", "dialog-close", "unlock", "close-state"]);
      ui.cleanup();
      assert.ok(!ui.events.includes("focus:trigger"));
      assert.equal(ui.subscribers.size, 0);
    }
  });

  test(`${name}: ordinary pointer openings retain their original focus behavior`, () => {
    const ui = mountDialog(name, record, false);
    assert.ok(ui.events.includes("focus:dialog"));
    assert.ok(!ui.events.includes("focus:close"));
    ui.cleanup();
    assert.ok(!ui.events.includes("focus:trigger"));
  });
}
