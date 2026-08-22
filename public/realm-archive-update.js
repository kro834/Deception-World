(() => {
  "use strict";

  const compare = document.querySelector("#realm--saga-form-compare-ios");
  const swapButton = document.querySelector("#realm--saga-compare-swap-button");

  if (!compare || !(swapButton instanceof HTMLButtonElement)) return;

  const groups = {
    a: [...compare.querySelectorAll('input[name="realm--saga-compare-a"]')],
    b: [...compare.querySelectorAll('input[name="realm--saga-compare-b"]')],
  };

  let cleanupTimer = 0;
  let animationFrame = 0;
  let colorsSwapped = compare.classList.contains("is-color-swapped");

  const updateChannelColors = () => {
    compare.classList.toggle("is-color-swapped", colorsSwapped);
    const labels = [...compare.querySelectorAll(".compare-side legend small")];
    if (labels[0]) labels[0].textContent = colorsSwapped ? "VIOLET CHANNEL" : "CYAN CHANNEL";
    if (labels[1]) labels[1].textContent = colorsSwapped ? "CYAN CHANNEL" : "VIOLET CHANNEL";
  };

  const selectedValue = (group) =>
    groups[group].find((input) => input instanceof HTMLInputElement && input.checked)?.value ?? "";

  const selectValue = (group, value) => {
    const target = groups[group].find(
      (input) => input instanceof HTMLInputElement && input.value === value,
    );
    if (!(target instanceof HTMLInputElement)) return false;
    target.checked = true;
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const finishAnimation = () => {
    window.clearTimeout(cleanupTimer);
    window.cancelAnimationFrame(animationFrame);
    compare.classList.remove("is-swapping");
    swapButton.removeAttribute("aria-busy");
  };

  const animateSwap = () => {
    finishAnimation();
    swapButton.setAttribute("aria-busy", "true");
    swapButton.classList.toggle("is-flipped");
    compare.classList.remove("is-swapping");
    animationFrame = window.requestAnimationFrame(() => {
      compare.classList.add("is-swapping");
      cleanupTimer = window.setTimeout(finishAnimation, 560);
    });
  };

  swapButton.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (swapButton.getAttribute("aria-busy") === "true") return;

      const left = selectedValue("a");
      const right = selectedValue("b");
      if (!left || !right || !selectValue("a", right) || !selectValue("b", left)) return;
      colorsSwapped = !colorsSwapped;
      updateChannelColors();
      animateSwap();
    },
    true,
  );

  compare.addEventListener("animationend", (event) => {
    if (
      compare.classList.contains("is-swapping") &&
      event.target instanceof HTMLElement &&
      (event.target.classList.contains("compare-side-a") || event.target.classList.contains("compare-side-b"))
    ) {
      finishAnimation();
    }
  });

  updateChannelColors();
  window.addEventListener("pageshow", finishAnimation);
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "saga-archive:close-transients") return;
    finishAnimation();
    document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close("zeus-navigation"));
  });
})();
