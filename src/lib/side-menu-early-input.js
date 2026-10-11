/** Keep one real activation of the SSR menu until its React owner mounts.
 * This function is self-contained because its source also runs in the head.
 * No timers, DOM/style writes, route mutations, or speculative assets. */
export function installSideMenuEarlyInput(environment = globalThis.window) {
  if (!environment?.document) return null;
  const key = "__dwSideMenuEarlyInput";
  if (environment[key]) return environment[key];
  let pending = null;
  let capturing = true;
  let disposed = false;
  const usable = (opener) =>
    opener?.tagName === "BUTTON" &&
    opener.isConnected &&
    !opener.disabled &&
    opener.matches(".side-panel-trigger") &&
    !opener.closest('[inert], [hidden], [disabled], [aria-disabled="true"]');
  const valid = (input) =>
    !disposed &&
    !environment.document.hidden &&
    input?.pathname === environment.location.pathname &&
    input.url === environment.location.href &&
    usable(input.opener);
  const clear = () => {
    pending = null;
  };
  const capture = (event) => {
    if (
      !event.isTrusted ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const opener = event.target?.closest?.(".side-panel-trigger");
    if (!usable(opener) || environment.document.hidden) return;
    // Stop before React's root capture can queue a replay of this same click.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending && !valid(pending)) clear();
    pending ??= {
      opener,
      pathname: environment.location.pathname,
      url: environment.location.href,
      keyboard: event.detail === 0,
    };
  };
  const stop = () => {
    if (!capturing) return;
    capturing = false;
    environment.removeEventListener("click", capture, true);
    environment.removeEventListener("popstate", clear);
    environment.removeEventListener("pagehide", dispose);
  };
  const dispose = () => {
    disposed = true;
    clear();
    stop();
  };
  const owner = {
    valid,
    dispose,
    claim(opener) {
      stop();
      const input = pending && pending.opener === opener && valid(pending) ? pending : null;
      clear();
      return input;
    },
  };
  environment[key] = owner;
  environment.addEventListener("click", capture, true);
  environment.addEventListener("popstate", clear);
  environment.addEventListener("pagehide", dispose);
  return owner;
}

export function claimSideMenuEarlyInput(opener, environment = globalThis.window) {
  return environment?.__dwSideMenuEarlyInput?.claim(opener) ?? null;
}

export function isSideMenuEarlyInputValid(input, environment = globalThis.window) {
  return Boolean(environment?.__dwSideMenuEarlyInput?.valid(input));
}

export const SIDE_MENU_EARLY_INPUT_SCRIPT = `(${installSideMenuEarlyInput.toString()})(window);`;
