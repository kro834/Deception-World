/* eslint-disable no-empty, @typescript-eslint/no-unused-vars */
/* Generated from the Saga archive motion controllers. Do not hand-edit. */
document.addEventListener('DOMContentLoaded', () => {
(() => {
  'use strict';

  const root = document.getElementById('realm--saga-forms-performance-v5');
  if (!root || root.dataset.masterReady === 'true') return;

  const selector = root.querySelector('#realm--form-selector');
  const progression = root.querySelector('#realm--saga-progression-v5');
  const detailSection = root.querySelector('[aria-labelledby="realm--saga-detail-title-v5"]');
  const detailCard = root.querySelector('#realm--saga-detail-v5');
  const chips = [...root.querySelectorAll('.form-chip')];
  const inputs = [...root.querySelectorAll('.form-selector')];
  const articles = [...root.querySelectorAll('.form-detail')];
  const motionController = window.RealmMotionController;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)') || { matches: false };
  const supportsWaapi = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  const supportsClipPath = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('clip-path', 'inset(0)');
  if (!selector || !progression || !detailSection || !detailCard || !chips.length || chips.length !== inputs.length) return;

  function getMotionProfile() {
    return motionController?.profile || root.dataset.motionProfile || (reducedMotion.matches ? 'reduced' : 'full');
  }

  const articleById = new Map(articles.map(article => [article.id.replace('realm--saga-detail-', ''), article]));
  const items = chips.map((chip, index) => ({
    index,
    chip,
    input: document.getElementById(chip.htmlFor),
    article: articleById.get(chip.dataset.formId),
    formId: chip.dataset.formId
  })).filter(item => item.input && item.article);
  if (items.length !== chips.length) return;

  const itemByArticle = new Map(items.map(item => [item.article, item]));
  items.forEach(item => { item.article.dataset.formId = item.formId; });

  const DEFAULT_FORM_ID = 'stella';
  const defaultIndex = items.findIndex(item => item.formId === DEFAULT_FORM_ID);
  if (defaultIndex < 0) return;

  function resetDefaultInputs() {
    items.forEach((item, index) => {
      const isDefault = index === defaultIndex;
      item.input.autocomplete = 'off';
      item.input.name = 'realm--saga-selected-form-v6s-20260808';
      item.input.checked = isDefault;
      item.input.defaultChecked = isDefault;
      if (isDefault) item.input.setAttribute('checked', '');
      else item.input.removeAttribute('checked');
    });
  }

  // WebKit/LINE previews may restore the last radio state before this script runs.
  // Ignore that restored state: every new opening must begin on Multi Form.
  resetDefaultInputs();

  const accents = {
    stella: ['#76d8ff', '#8f7bff', '118 216 255', '143 123 255'],
    burst: ['#ff8a6c', '#ffc36d', '255 138 108', '255 195 109'],
    blast: ['#5ddcff', '#7198ff', '93 220 255', '113 152 255'],
    legends: ['#f0c56d', '#6ddcff', '240 197 109', '109 220 255'],
    royal: ['#f0c56d', '#b98cff', '240 197 109', '185 140 255'],
    'royal-wrath': ['#ff667f', '#f0c56d', '255 102 127', '240 197 109'],
    'royal-abyss': ['#9a72ff', '#586fff', '154 114 255', '88 111 255'],
    'royal-birth': ['#67e6ff', '#67e0b0', '103 230 255', '103 224 176'],
    'royal-nehan': ['#fff0bd', '#8fe9ff', '255 240 189', '143 233 255']
  };

  const telemetry = selector.querySelector('.selected-telemetry');
  const telemetryStates = [...selector.querySelectorAll('.telemetry-state')];
  const selectorHeading = selector.querySelector('.selector-heading');
  const selectorFootnote = selector.querySelector('.selector-footnote');
  const hero = root.querySelector('.archive-hero');
  const tableRowsById = new Map(items.map(item => [item.formId, []]));

  const ambient = document.createElement('div');
  ambient.className = 'v6s-ambient';
  ambient.setAttribute('aria-hidden', 'true');
  ambient.innerHTML = '<span class="v6s-ambient-orb-a"></span><span class="v6s-ambient-orb-b"></span><span class="v6s-ambient-grid"></span>';
  root.prepend(ambient);

  if (hero) {
    const heroHud = document.createElement('span');
    heroHud.className = 'v6s-hero-hud';
    heroHud.setAttribute('aria-hidden', 'true');
    heroHud.innerHTML = '<i></i><i></i><i></i>';
    hero.append(heroHud);
  }

  [selector, detailSection].forEach(panel => {
    const line = document.createElement('span');
    line.className = 'v6s-panel-line';
    line.setAttribute('aria-hidden', 'true');
    panel.append(line);
  });

  ['#realm--saga-ratio-body-v5', '#realm--saga-ability-body-v5'].forEach(bodySelector => {
    const rows = [...root.querySelectorAll(bodySelector + ' tr')];
    rows.forEach((row, rowIndex) => {
      const item = items[rowIndex];
      if (!item) return;
      row.dataset.formId = item.formId;
      tableRowsById.get(item.formId)?.push(row);
    });
  });

  inputs.forEach(input => {
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
  });
  detailCard.removeAttribute('aria-live');
  detailCard.setAttribute('aria-busy', 'false');

  const telemetryRail = document.createElement('span');
  telemetryRail.className = 'v6s-progress-rail';
  telemetryRail.setAttribute('aria-hidden', 'true');
  telemetryRail.innerHTML = '<i></i>';
  telemetry?.append(telemetryRail);

  const tools = document.createElement('div');
  tools.className = 'selector-tools';
  tools.innerHTML = `
    <div class="selector-search">
      <label class="sr-only" for="realm--saga-form-search">フォーム名を検索</label>
      <input id="realm--saga-form-search" type="search" inputmode="search" autocomplete="off" enterkeyhint="search" placeholder="フォーム名を検索" aria-describedby="realm--saga-search-summary">
      <span class="search-hint" aria-hidden="true">/</span>
      <button class="search-clear" type="button" aria-label="検索を消去" hidden tabindex="-1">×</button>
    </div>
    <button class="selector-collapse" type="button" aria-label="選択中のフォームへ移動" title="選択中のフォームへ移動">選択中へ</button>`;

  const searchSummary = document.createElement('div');
  searchSummary.className = 'search-summary';
  searchSummary.id = 'realm--saga-search-summary';
  searchSummary.setAttribute('aria-live', 'polite');
  searchSummary.innerHTML = '<span>09 / 09 FORMS</span><span>TYPE TO FILTER</span>';

  const noResults = document.createElement('p');
  noResults.className = 'selector-empty';
  noResults.hidden = true;
  noResults.textContent = '該当するフォームはありません。';
  progression.after(noResults);

  if (selectorHeading) {
    selectorHeading.after(telemetry, tools, searchSummary, progression);
    if (selectorFootnote) progression.after(noResults, selectorFootnote);
  }

  const sheetClose = document.createElement('button');
  sheetClose.type = 'button';
  sheetClose.className = 'selector-sheet-close';
  sheetClose.setAttribute('aria-label', 'フォーム選択を閉じる');
  sheetClose.textContent = '閉じる';
  selectorHeading?.append(sheetClose);

  const sheetScrim = document.createElement('button');
  sheetScrim.type = 'button';
  sheetScrim.className = 'selector-sheet-scrim';
  sheetScrim.setAttribute('aria-label', 'フォーム選択を閉じる');
  sheetScrim.hidden = true;
  root.append(sheetScrim);

  const toolbar = document.createElement('div');
  toolbar.className = 'detail-toolbar';
  toolbar.innerHTML = `
    <span class="toolbar-index" aria-label="フォーム番号">--/--</span>
    <span class="detail-toolbar-copy"><span>ACTIVE FORM / DETAIL VIEW</span><strong>フォームを選択</strong></span>
    <span class="detail-nav">
      <button type="button" data-step="prev" aria-label="前のフォーム">←</button>
      <button type="button" data-step="next" aria-label="次のフォーム">→</button>
    </span>
    <span class="motion-meter" aria-hidden="true"><i></i></span>`;
  detailSection.prepend(toolbar);

  const transitionFx = document.createElement('div');
  transitionFx.className = 'motion-transition-fx';
  transitionFx.setAttribute('aria-hidden', 'true');
  transitionFx.innerHTML = '<span class="v6s-fx-orbit"></span><span class="v6s-fx-ray"></span><span class="v6s-fx-ray is-secondary"></span><span class="v6s-fx-core"></span>';
  detailSection.append(transitionFx);

  const lightbox = document.createElement('dialog');
  lightbox.className = 'image-lightbox';
  lightbox.setAttribute('aria-label', 'フォーム画像の拡大表示');
  lightbox.innerHTML = `
    <div class="lightbox-inner">
      <div class="lightbox-bar"><strong>FORM VISUAL</strong><button class="lightbox-close" type="button" aria-label="拡大表示を閉じる">×</button></div>
      <div class="lightbox-image-wrap"><img class="lightbox-image" alt=""></div>
    </div>`;
  root.append(lightbox);

  const dock = document.createElement('div');
  dock.className = 'mobile-dock';
  dock.setAttribute('aria-label', 'フォーム移動');
  dock.innerHTML = `
    <button type="button" data-step="prev" aria-label="前のフォーム">←</button>
    <button type="button" class="dock-current" aria-label="フォーム選択を開く" aria-controls="form-selector" aria-expanded="false"><span>フォームを選択</span><small>OPEN SELECTOR</small></button>
    <button type="button" data-step="next" aria-label="次のフォーム">→</button>`;
  root.append(dock);

  const scrollProgress = document.createElement('div');
  scrollProgress.className = 'archive-scroll-progress';
  scrollProgress.setAttribute('aria-hidden', 'true');
  scrollProgress.innerHTML = '<i></i>';
  root.prepend(scrollProgress);

  let selectedIndex = defaultIndex;
  let activeIndex = selectedIndex;
  let renderToken = 0;
  let animations = [];
  let sheetOpen = false;
  let sheetCloseTimer = 0;
  let savedOverflow = '';
  let pointerStart = null;
  let lastLightboxTrigger = null;
  let lastSelectionAt = 0;
  let rapidSelectionTimer = 0;
  const rowCleanupTimers = new Map();
  const chipCleanupTimers = new Map();
  const sheetBackground = [...new Set([
    hero,
    ...root.querySelectorAll('.archive-workspace > :not(#realm--form-selector), .archive-footer, .mobile-dock'),
    ...[...root.children].filter(element => element.matches('section.section'))
  ].filter(Boolean))];

  function normalizeIndex(index) {
    return (index + items.length) % items.length;
  }

  function isPartialStatus(text) {
    return /未|一部|不詳|推定|暫定|個別値/.test(text);
  }

  function setInert(element, value) {
    if ('inert' in element) element.inert = value;
  }

  function cancelAnimations({ keepFx = false } = {}) {
    animations.forEach(animation => {
      try { animation.cancel(); } catch (_) {}
    });
    animations = [];
    rowCleanupTimers.forEach(timer => window.clearTimeout(timer));
    rowCleanupTimers.clear();
    chipCleanupTimers.forEach(timer => window.clearTimeout(timer));
    chipCleanupTimers.clear();
    root.querySelectorAll('.is-row-activating').forEach(row => row.classList.remove('is-row-activating'));
    const activeArticle = items[activeIndex]?.article;
    articles.forEach(article => {
      const current = article === activeArticle;
      article.classList.remove('is-active', 'is-entering', 'is-leaving');
      article.removeAttribute('style');
      if (current) article.classList.add('is-active');
      article.setAttribute('aria-hidden', String(!current));
      setInert(article, !current);
      article.querySelectorAll('.is-data-entering').forEach(node => node.classList.remove('is-data-entering'));
    });
    items.forEach(item => item.chip.classList.remove('is-activating', 'is-pending'));
    root.querySelectorAll('.art-trigger.is-art-pointer-active').forEach(trigger => {
      trigger.classList.remove('is-art-pointer-active');
      trigger.style.setProperty('--art-rx', '0deg');
      trigger.style.setProperty('--art-ry', '0deg');
      trigger.style.setProperty('--art-light-x', '50%');
    });
    detailCard.style.height = '';
    detailCard.classList.remove('is-transitioning');
    detailCard.setAttribute('aria-busy', 'false');
    if (!keepFx) {
      root.classList.remove('is-switching', 'motion-forward', 'motion-backward');
      transitionFx.classList.remove('is-active');
    }
  }

  function playTransitionFx(direction) {
    const profile = getMotionProfile();
    if (reducedMotion.matches || !supportsWaapi) return;
    const orbit = transitionFx.querySelector('.v6s-fx-orbit');
    const rays = [...transitionFx.querySelectorAll('.v6s-fx-ray')];
    const core = transitionFx.querySelector('.v6s-fx-core');
    const duration = profile === 'balanced' ? 520 : 700;

    if (orbit) {
      animations.push(orbit.animate([
        { opacity: 0, transform: `scale(.48) rotate(${direction * -14}deg)` },
        { offset: .28, opacity: .78 },
        { opacity: 0, transform: `scale(1.32) rotate(${direction * 18}deg)` }
      ], { duration, easing: 'cubic-bezier(.16,.82,.22,1)', fill: 'none' }));
    }

    rays.forEach((ray, index) => {
      if (profile === 'balanced' && index > 0) return;
      const forward = direction > 0;
      animations.push(ray.animate([
        { opacity: 0, transform: `skewX(-13deg) translate3d(${forward ? '0%' : '790%'},0,0) scaleX(.72)` },
        { offset: .18, opacity: index ? .48 : .92 },
        { opacity: 0, transform: `skewX(-13deg) translate3d(${forward ? '850%' : '-45%'},0,0) scaleX(1.1)` }
      ], { duration: duration - 70, delay: index * 52, easing: 'cubic-bezier(.18,.8,.22,1)', fill: 'none' }));
    });

    if (core && profile === 'full') {
      animations.push(core.animate([
        { opacity: 0, transform: 'translate(-50%, -50%) scale(.35)' },
        { offset: .26, opacity: .64 },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(1.35)' }
      ], { duration: 620, easing: 'cubic-bezier(.16,.82,.22,1)', fill: 'none' }));
    }
  }

  function beginSwitching(item, direction) {
    root.style.setProperty('--motion-direction', String(direction));
    root.classList.remove('motion-forward', 'motion-backward');
    root.classList.add(direction < 0 ? 'motion-backward' : 'motion-forward', 'is-switching');
    item.chip.classList.add('is-pending');
    transitionFx.classList.add('is-active');
    playTransitionFx(direction);
  }

  function finishSwitching(token) {
    if (token !== renderToken) return;
    root.classList.remove('is-switching', 'motion-forward', 'motion-backward');
    transitionFx.classList.remove('is-active');
    items.forEach(item => item.chip.classList.remove('is-pending'));
  }

  function applyAccent(item) {
    const palette = accents[item.formId] || accents.rexonance;
    const progress = (item.index + 1) / items.length;
    root.style.setProperty('--active', palette[0]);
    root.style.setProperty('--active-2', palette[1]);
    root.style.setProperty('--active-rgb', palette[2]);
    root.style.setProperty('--active-2-rgb', palette[3]);
    root.style.setProperty('--v6s-rail-progress', progress.toFixed(5));
    root.dataset.activeForm = item.formId;
    root.dataset.activeTier = item.chip.closest('.stage')?.dataset.tier || '';
  }

  function updateControlState(index) {
    items.forEach((item, itemIndex) => {
      const selected = itemIndex === index;
      item.input.checked = selected;
      item.chip.setAttribute('role', 'radio');
      item.chip.classList.toggle('is-selected', selected);
      item.chip.setAttribute('aria-checked', String(selected));
      item.chip.tabIndex = selected ? 0 : -1;
    });
  }

  function getSelectedName(item) {
    const state = telemetryStates.find(candidate => candidate.dataset.formId === item?.formId);
    return state?.querySelector('.telemetry-name')?.textContent?.trim()
      || item?.chip.querySelector('.chip-name')?.textContent?.trim()
      || item?.article.querySelector('.detail-head h3')?.textContent?.trim()
      || 'FORM';
  }

  function updateTextAndTables(index, announce = true) {
    const item = items[index];
    const article = item.article;
    const selectedName = getSelectedName(item);
    const stage = item.chip.closest('.stage');
    const tierNumber = stage?.dataset.tier || '--';
    const tierName = stage?.querySelector('.stage-label')?.textContent?.trim() || '';
    const badge = article.querySelector('.data-badge, .viz-badge')?.textContent?.trim() || '設定確認済み';
    const count = String(index + 1).padStart(2, '0') + '/' + String(items.length).padStart(2, '0');

    if (telemetry) {
      telemetry.setAttribute('aria-live', announce ? 'polite' : 'off');
      telemetryStates.forEach(state => {
        const current = state.dataset.formId === item.formId;
        state.classList.toggle('is-current', current);
        state.setAttribute('aria-hidden', String(!current));
      });
    }
    toolbar.querySelector('.toolbar-index').textContent = count;
    toolbar.querySelector('.detail-toolbar-copy strong').textContent = selectedName;
    dock.querySelector('.dock-current span').textContent = selectedName;
    detailCard.setAttribute('aria-label', selectedName + 'の詳細を表示中');

    tableRowsById.forEach((rows, formId) => {
      const current = formId === item.formId;
      rows.forEach(row => {
        row.classList.toggle('is-current', current);
        if (current) row.setAttribute('aria-current', 'true');
        else row.removeAttribute('aria-current');
      });
    });
    document.title = selectedName + '｜仮面ライダーサーガ フォームアーカイブ';
  }

  function showOnly(index) {
    const selectedArticle = items[index]?.article;
    articles.forEach(article => {
      const selected = article === selectedArticle;
      article.classList.toggle('is-active', selected);
      article.classList.remove('is-entering', 'is-leaving');
      article.removeAttribute('style');
      article.setAttribute('aria-hidden', String(!selected));
      setInert(article, !selected);
    });
  }

  function warmImage(item, { priority = true, timeout = 220 } = {}) {
    const image = item?.article.querySelector('.form-art');
    if (!image) return Promise.resolve();
    if (priority) {
      image.loading = 'eager';
      image.fetchPriority = 'high';
    }
    image.decoding = 'async';
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    let decodePromise = Promise.resolve();
    try {
      if (typeof image.decode === 'function') decodePromise = image.decode().catch(() => {});
    } catch (_) {}
    return Promise.race([
      decodePromise,
      new Promise(resolve => window.setTimeout(resolve, timeout))
    ]);
  }

  function warmNeighbors(index, direction = 1) {
    const warm = () => {
      warmImage(items[normalizeIndex(index + direction)], { priority: false, timeout: 120 });
      warmImage(items[normalizeIndex(index - direction)], { priority: false, timeout: 120 });
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 800 });
    else window.setTimeout(warm, 140);
  }

  function centerChip(item) {
    if (!item?.chip || !progression) return;
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    const behavior = reducedMotion.matches || Boolean(sheetCloseTimer) ? 'auto' : 'smooth';
    if (narrow) {
      const stage = item.chip.closest('.stage');
      if (!stage) return;
      const left = stage.offsetLeft - (progression.clientWidth - stage.clientWidth) / 2;
      progression.scrollTo({ left: Math.max(0, left), behavior });
    } else {
      const chipRect = item.chip.getBoundingClientRect();
      const listRect = progression.getBoundingClientRect();
      if (chipRect.top >= listRect.top + 8 && chipRect.bottom <= listRect.bottom - 8) return;
      const targetTop = progression.scrollTop + chipRect.top - listRect.top - (listRect.height - chipRect.height) / 2;
      progression.scrollTo({ top: Math.max(0, targetTop), behavior });
    }
  }

  function animateTelemetry(direction) {
    if (reducedMotion.matches || !supportsWaapi || !telemetry) return [];
    const activeTelemetry = telemetryStates.find(state => state.dataset.formId === items[selectedIndex]?.formId);
    const targets = [
      activeTelemetry?.querySelector('.telemetry-index'),
      activeTelemetry?.querySelector('.telemetry-name'),
      activeTelemetry?.querySelector('.telemetry-tier'),
      activeTelemetry?.querySelector('.telemetry-status'),
      toolbar.querySelector('.toolbar-index'),
      toolbar.querySelector('.detail-toolbar-copy strong'),
      dock.querySelector('.dock-current span')
    ].filter(Boolean);
    const created = [];
    targets.forEach((target, index) => {
      const animation = target.animate([
        { opacity: 0, transform: `translate3d(${direction * 12}px, 5px, 0) scale(.985)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
      ], { duration: 340, delay: index * 18, easing: 'cubic-bezier(.16,.82,.22,1)', fill: 'both' });
      animations.push(animation);
      created.push(animation);
    });
    return created;
  }

  function transitionArticles(previousIndex, nextIndex, direction, token) {
    const previous = items[previousIndex]?.article;
    const next = items[nextIndex]?.article;
    if (!previous || !next || previous === next || reducedMotion.matches || !supportsWaapi) {
      showOnly(nextIndex);
      detailCard.style.height = '';
      detailCard.classList.remove('is-transitioning');
      detailCard.setAttribute('aria-busy', 'false');
      finishSwitching(token);
      centerChip(items[nextIndex]);
      warmNeighbors(nextIndex, direction);
      return;
    }

    const motionProfile = getMotionProfile();
    const compactMotion = motionProfile !== 'full';
    const exitDuration = compactMotion ? 170 : 220;
    const entryDuration = compactMotion ? 390 : 510;
    const oldHeight = Math.max(previous.offsetHeight, 1);
    const workspace = detailSection.closest('.archive-workspace');
    const flowFollowers = workspace?.parentElement
      ? [...workspace.parentElement.children].slice([...workspace.parentElement.children].indexOf(workspace) + 1)
          .filter(element => element.matches('.section, .archive-footer'))
      : [];
    const followerTops = new Map(flowFollowers.map(element => [element, element.getBoundingClientRect().top]));
    detailCard.classList.add('is-transitioning');
    detailCard.style.height = oldHeight + 'px';
    previous.setAttribute('aria-hidden', 'true');
    setInert(previous, true);
    previous.classList.add('is-leaving');
    next.classList.add('is-entering');
    next.setAttribute('aria-hidden', 'false');
    setInert(next, false);
    const newHeight = Math.max(next.scrollHeight, 1);
    detailCard.style.height = newHeight + 'px';
    const localAnimations = [];

    const run = (target, keyframes, options) => {
      if (!target) return null;
      const animation = target.animate(keyframes, { fill: 'both', ...options });
      animations.push(animation);
      localAnimations.push(animation);
      return animation;
    };

    flowFollowers.forEach(element => {
      const beforeTop = followerTops.get(element);
      const afterTop = element.getBoundingClientRect().top;
      const deltaY = Number.isFinite(beforeTop) ? beforeTop - afterTop : 0;
      if (Math.abs(deltaY) < .5) return;
      run(element, [
        { transform: `translate3d(0,${deltaY}px,0)` },
        { transform: 'translate3d(0,0,0)' }
      ], { duration: compactMotion ? 360 : 500, easing: 'cubic-bezier(.2,.82,.2,1)' });
    });

    run(previous, [
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
      { opacity: 0, transform: `translate3d(${-direction * 18}px,-2px,0) scale(.992)` }
    ], { duration: exitDuration, easing: 'cubic-bezier(.4,0,.6,1)' });

    const nextStart = {
      opacity: 0,
      transform: `translate3d(${direction * (compactMotion ? 20 : 28)}px,8px,0) scale(.992)`
    };
    const nextEnd = { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' };
    run(next, [nextStart, { offset: .54, opacity: 1 }, nextEnd], {
      duration: entryDuration,
      easing: 'cubic-bezier(.2,.82,.2,1)'
    });

    const art = next.querySelector('.art-trigger');
    const heading = next.querySelector('.detail-head');
    const dataCards = [...next.querySelectorAll('.spec-item')];
    const abilityCards = [...next.querySelectorAll('.ability-layout > *')];

    run(art, [
      { opacity: .2, transform: `translate3d(${direction * 22}px,8px,0) scale(.965)` },
      { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
    ], { duration: compactMotion ? 390 : 540, delay: 28, easing: 'cubic-bezier(.2,.82,.2,1)' });

    run(heading, [
      { opacity: 0, transform: `translate3d(${direction * 14}px,12px,0)` },
      { opacity: 1, transform: 'translate3d(0,0,0)' }
    ], { duration: compactMotion ? 300 : 390, delay: 46, easing: 'cubic-bezier(.2,.82,.2,1)' });

    if (compactMotion) {
      const groupedPanels = [next.querySelector('.viz-grid'), next.querySelector('.ability-layout')].filter(Boolean);
      groupedPanels.forEach((panel, index) => {
        run(panel, [
          { opacity: .35, transform: `translate3d(${direction * 7}px,9px,0)` },
          { opacity: 1, transform: 'translate3d(0,0,0)' }
        ], { duration: 300, delay: 62 + index * 34, easing: 'cubic-bezier(.2,.82,.2,1)' });
      });
    } else {
      dataCards.forEach((card, index) => {
        card.classList.add('is-data-entering');
        run(card, [
          { opacity: 0, transform: `translate3d(${direction * 10}px,14px,0) scale(.985)` },
          { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
        ], { duration: 380, delay: 90 + Math.min(index, 9) * 18, easing: 'cubic-bezier(.2,.82,.2,1)' });
      });

      abilityCards.forEach((card, index) => {
        card.classList.add('is-data-entering');
        run(card, [
          { opacity: 0, transform: 'translate3d(0,16px,0)' },
          { opacity: 1, transform: 'translate3d(0,0,0)' }
        ], { duration: 390, delay: 160 + index * 34, easing: 'cubic-bezier(.2,.82,.2,1)' });
      });
    }

    Promise.race([
      Promise.allSettled(localAnimations.map(animation => animation.finished)),
      new Promise(resolve => window.setTimeout(resolve, compactMotion ? 760 : 940))
    ]).then(() => {
      if (token !== renderToken) return;
      localAnimations.forEach(animation => {
        try { animation.cancel(); } catch (_) {}
      });
      animations = animations.filter(animation => !localAnimations.includes(animation));
      showOnly(nextIndex);
      detailCard.style.height = '';
      detailCard.classList.remove('is-transitioning');
      detailCard.setAttribute('aria-busy', 'false');
      next.querySelectorAll('.is-data-entering').forEach(node => node.classList.remove('is-data-entering'));
      finishSwitching(token);
      centerChip(items[nextIndex]);
      warmNeighbors(nextIndex, direction);
    });
  }

  function visibleItems() {
    return items.filter(item => !item.chip.hidden && !item.chip.closest('.stage')?.hidden);
  }

  function setSheetBackgroundInert(value) {
    sheetBackground.forEach(element => setInert(element, value));
  }

  function finalizeSelectorSheetClose(restoreFocus) {
    window.clearTimeout(sheetCloseTimer);
    sheetCloseTimer = 0;
    root.classList.remove('is-selector-sheet-open', 'is-selector-sheet-closing');
    sheetScrim.hidden = true;
    document.documentElement.style.overflow = savedOverflow;
    selector.removeAttribute('aria-modal');
    selector.removeAttribute('role');
    setSheetBackgroundInert(false);
    dock.querySelector('.dock-current')?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) dock.querySelector('.dock-current')?.focus({ preventScroll: true });
  }

  function closeSelectorSheet({ restoreFocus = false, immediate = false } = {}) {
    if (!sheetOpen) return;
    sheetOpen = false;
    if (immediate || reducedMotion.matches) {
      finalizeSelectorSheetClose(restoreFocus);
      return;
    }
    root.classList.add('is-selector-sheet-closing');
    sheetCloseTimer = window.setTimeout(() => finalizeSelectorSheetClose(restoreFocus), 205);
  }

  function openSelectorSheet() {
    if (!window.matchMedia('(max-width: 620px)').matches) {
      selector.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (sheetCloseTimer) finalizeSelectorSheetClose(false);
    window.clearTimeout(sheetCloseTimer);
    sheetCloseTimer = 0;
    root.classList.remove('is-selector-sheet-closing');
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    sheetOpen = true;
    root.classList.add('is-selector-sheet-open');
    sheetScrim.hidden = false;
    selector.setAttribute('role', 'dialog');
    selector.setAttribute('aria-modal', 'true');
    selector.setAttribute('aria-labelledby', 'realm--saga-progression-title-v5');
    setSheetBackgroundInert(true);
    dock.querySelector('.dock-current')?.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => {
      const selected = items[selectedIndex]?.chip;
      centerChip(items[selectedIndex]);
      selected?.focus({ preventScroll: true });
    });
  }

  function animateSelectionUi(item, direction, token) {
    item.chip.classList.remove('is-pending', 'is-activating');
    const previousChipTimer = chipCleanupTimers.get(item.chip);
    if (previousChipTimer) window.clearTimeout(previousChipTimer);
    window.requestAnimationFrame(() => {
      if (token !== renderToken) return;
      item.chip.classList.add('is-activating');
      const chipTimer = window.setTimeout(() => {
        item.chip.classList.remove('is-activating');
        if (chipCleanupTimers.get(item.chip) === chipTimer) chipCleanupTimers.delete(item.chip);
      }, 720);
      chipCleanupTimers.set(item.chip, chipTimer);
    });

    if (reducedMotion.matches || !supportsWaapi) return;
    const stage = item.chip.closest('.stage');
    if (stage) {
      const stageAnimation = stage.animate([
        { borderColor: 'rgb(255 255 255 / 6%)' },
        { offset: .34, borderColor: `rgb(${(accents[item.formId] || accents.rexonance)[2]} / 34%)` },
        { borderColor: `rgb(${(accents[item.formId] || accents.rexonance)[2]} / 20%)` }
      ], { duration: 620, easing: 'cubic-bezier(.16,.82,.22,1)' });
      animations.push(stageAnimation);
    }

    (tableRowsById.get(item.formId) || []).forEach((row, index) => {
      const previousTimer = rowCleanupTimers.get(row);
      if (previousTimer) window.clearTimeout(previousTimer);
      row.classList.remove('is-row-activating');
      window.requestAnimationFrame(() => {
        if (token !== renderToken) return;
        row.classList.add('is-row-activating');
        const timer = window.setTimeout(() => {
          if (token === renderToken) row.classList.remove('is-row-activating');
          if (rowCleanupTimers.get(row) === timer) rowCleanupTimers.delete(row);
        }, 700 + index * 32);
        rowCleanupTimers.set(row, timer);
      });
    });
  }

  function markSelectionCadence() {
    const now = window.performance?.now?.() ?? Date.now();
    const rapid = lastSelectionAt > 0 && now - lastSelectionAt < 210;
    lastSelectionAt = now;
    window.clearTimeout(rapidSelectionTimer);
    root.classList.toggle('is-rapid-switch', rapid);
    rapidSelectionTimer = window.setTimeout(() => {
      root.classList.remove('is-rapid-switch');
      rapidSelectionTimer = 0;
    }, rapid ? 280 : 0);
    return rapid;
  }

  async function selectForm(rawIndex, options = {}) {
    const index = normalizeIndex(rawIndex);
    const next = items[index];
    if (!next) return;
    const previousIndex = activeIndex;
    const token = ++renderToken;
    markSelectionCadence();
    let direction = index > previousIndex ? 1 : -1;
    if (previousIndex === items.length - 1 && index === 0) direction = 1;
    if (previousIndex === 0 && index === items.length - 1) direction = -1;

    cancelAnimations();
    selectedIndex = index;

    if (index === previousIndex) {
      activeIndex = index;
      applyAccent(next);
      updateControlState(index);
      updateTextAndTables(index, options.announce !== false);
      showOnly(index);
      centerChip(next);
      warmImage(next);
      warmNeighbors(index, direction);
      if (options.closeSheet) closeSelectorSheet({ restoreFocus: true });
      return;
    }

    detailCard.setAttribute('aria-busy', 'true');
    applyAccent(next);
    next.chip.classList.add('is-pending');

    if (options.focus) {
      try { next.chip.focus({ preventScroll: true }); } catch (_) { next.chip.focus(); }
    }
    if (options.closeSheet) closeSelectorSheet({ restoreFocus: true });

    if (!reducedMotion.matches) await warmImage(next, { priority: true, timeout: 72 });
    if (token !== renderToken) return;

    beginSwitching(next, direction);
    activeIndex = index;
    updateControlState(index);
    updateTextAndTables(index, options.announce !== false);
    animateSelectionUi(next, direction, token);
    animateTelemetry(direction);
    transitionArticles(previousIndex, index, direction, token);
  }

  function showOpeningDefault() {
    renderToken += 1;
    selectedIndex = defaultIndex;
    activeIndex = defaultIndex;
    window.clearTimeout(rapidSelectionTimer);
    rapidSelectionTimer = 0;
    lastSelectionAt = 0;
    root.classList.remove('is-rapid-switch');
    cancelAnimations();
    motionController?.apply();
    resetDefaultInputs();
    applyAccent(items[defaultIndex]);
    updateControlState(defaultIndex);
    showOnly(defaultIndex);
    updateTextAndTables(defaultIndex, false);
    warmImage(items[defaultIndex]);
    warmNeighbors(defaultIndex);
  }

  function moveSelection(step, options = {}) {
    const available = visibleItems();
    if (!available.length) return;
    const current = items[selectedIndex];
    let position = available.indexOf(current);
    if (position < 0) position = step > 0 ? -1 : 0;
    const next = available[(position + step + available.length) % available.length];
    selectForm(next.index, options);
  }

  items.forEach(item => {
    item.chip.addEventListener('pointerenter', () => warmImage(item), { passive: true });
    item.chip.addEventListener('focus', () => warmImage(item));
    item.chip.addEventListener('click', event => {
      event.preventDefault();
      selectForm(item.index, { announce: true, closeSheet: sheetOpen });
    });
    item.input.addEventListener('change', () => {
      if (item.input.checked && item.index !== selectedIndex) selectForm(item.index, { announce: true });
    });
    item.chip.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectForm(item.index, { focus: true, announce: true, closeSheet: sheetOpen });
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1, { focus: true, announce: true });
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1, { focus: true, announce: true });
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const available = visibleItems();
        const target = event.key === 'Home' ? available[0] : available[available.length - 1];
        if (target) selectForm(target.index, { focus: true, announce: true });
      } else if (event.key === 'Escape' && sheetOpen) {
        event.preventDefault();
        closeSelectorSheet({ restoreFocus: true });
      }
    });
  });

  root.querySelectorAll('.inline-switch').forEach(control => {
    const index = items.findIndex(item => item.input.id === control.htmlFor);
    if (index < 0) return;
    control.addEventListener('click', event => {
      event.preventDefault();
      selectForm(index, { announce: true });
    });
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectForm(index, { focus: true, announce: true });
      }
    });
  });

  root.querySelectorAll('[data-step]').forEach(button => {
    button.addEventListener('click', () => moveSelection(button.dataset.step === 'next' ? 1 : -1, { announce: true }));
  });

  dock.querySelector('.dock-current')?.addEventListener('click', openSelectorSheet);
  sheetClose.addEventListener('click', () => closeSelectorSheet({ restoreFocus: true }));
  sheetScrim.addEventListener('click', () => closeSelectorSheet({ restoreFocus: true }));

  tools.querySelector('.selector-collapse')?.addEventListener('click', () => {
    if (items[selectedIndex].chip.hidden) {
      searchInput.value = '';
      filterForms();
    }
    centerChip(items[selectedIndex]);
    items[selectedIndex].chip.focus({ preventScroll: true });
  });

  const searchInput = tools.querySelector('input[type="search"]');
  const clearSearch = tools.querySelector('.search-clear');

  function filterForms() {
    const query = searchInput.value.trim().toLocaleLowerCase('ja');
    let matches = 0;
    items.forEach(item => {
      const title = item.article.querySelector('.detail-head h3')?.textContent || '';
      const subtitle = item.article.querySelector('.detail-head p')?.textContent || '';
      const haystack = (item.chip.textContent + ' ' + title + ' ' + subtitle).toLocaleLowerCase('ja');
      const hidden = Boolean(query && !haystack.includes(query));
      item.chip.hidden = hidden;
      if (!hidden) matches += 1;
    });
    selector.querySelectorAll('.stage').forEach(stage => {
      stage.hidden = [...stage.querySelectorAll('.form-chip')].every(chip => chip.hidden);
    });
    clearSearch.hidden = !query;
    clearSearch.tabIndex = query ? 0 : -1;
    clearSearch.classList.toggle('is-visible', Boolean(query));
    tools.querySelector('.search-hint').hidden = Boolean(query);
    noResults.hidden = matches !== 0;
    searchSummary.firstElementChild.textContent = matches + ' / ' + items.length + ' FORMS';
    searchSummary.lastElementChild.textContent = query ? (matches ? 'FILTER ACTIVE' : 'NO MATCH') : 'TYPE TO FILTER';

    const available = visibleItems();
    items.forEach(item => { item.chip.tabIndex = -1; });
    if (available.length) {
      const selectedVisible = available.includes(items[selectedIndex]);
      (selectedVisible ? items[selectedIndex] : available[0]).chip.tabIndex = 0;
    }
  }

  searchInput.addEventListener('input', filterForms);
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      searchInput.value = '';
      filterForms();
      searchInput.blur();
    } else if (event.key === 'ArrowDown') {
      const first = visibleItems()[0];
      if (first) {
        event.preventDefault();
        first.chip.focus({ preventScroll: true });
        centerChip(first);
      }
    } else if (event.key === 'Enter') {
      const available = visibleItems();
      if (available.length === 1) {
        event.preventDefault();
        selectForm(available[0].index, { announce: true, closeSheet: sheetOpen });
      }
    }
  });
  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    filterForms();
    searchInput.focus();
  });

  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (sheetOpen && event.key === 'Escape') {
      event.preventDefault();
      closeSelectorSheet({ restoreFocus: true });
      return;
    }
    if (sheetOpen && event.key === 'Tab') {
      const focusable = [...selector.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && !element.closest('[hidden]'));
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    if (event.key === '/' && !typing) {
      event.preventDefault();
      if (window.matchMedia('(max-width: 620px)').matches && !sheetOpen) openSelectorSheet();
      window.setTimeout(() => searchInput.focus(), reducedMotion.matches ? 0 : 160);
    }
  });

  articles.forEach(article => {
    const image = article.querySelector('.form-art');
    if (!image) return;
    image.loading = article === items[selectedIndex].article ? 'eager' : 'lazy';
    image.decoding = 'async';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'art-trigger';
    trigger.setAttribute('aria-label', (image.alt || 'フォーム画像') + 'を拡大表示');
    image.before(trigger);
    trigger.append(image);
    const zoom = document.createElement('span');
    zoom.className = 'art-zoom-label';
    zoom.innerHTML = '<span aria-hidden="true">⌗</span> EXPAND VISUAL';
    trigger.append(zoom);

    const energy = document.createElement('span');
    energy.className = 'art-energy-field';
    energy.setAttribute('aria-hidden', 'true');
    trigger.append(energy);

    const artHud = document.createElement('span');
    artHud.className = 'v6s-art-hud';
    artHud.setAttribute('aria-hidden', 'true');
    trigger.append(artHud);

    let didSwipe = false;
    let artMotionFrame = 0;
    let artPointer = null;

    const resetArtTilt = () => {
      if (artMotionFrame) window.cancelAnimationFrame?.(artMotionFrame);
      artMotionFrame = 0;
      artPointer = null;
      trigger.classList.remove('is-art-pointer-active');
      trigger.style.setProperty('--art-rx', '0deg');
      trigger.style.setProperty('--art-ry', '0deg');
      trigger.style.setProperty('--art-light-x', '50%');
    };

    if (finePointer.matches && !reducedMotion.matches) {
      trigger.addEventListener('pointermove', event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        artPointer = { x: event.clientX, y: event.clientY };
        if (artMotionFrame) return;
        artMotionFrame = window.requestAnimationFrame(() => {
          artMotionFrame = 0;
          if (!artPointer) return;
          const rect = trigger.getBoundingClientRect();
          const x = Math.max(-1, Math.min(1, ((artPointer.x - rect.left) / Math.max(1, rect.width) - .5) * 2));
          const y = Math.max(-1, Math.min(1, ((artPointer.y - rect.top) / Math.max(1, rect.height) - .5) * 2));
          trigger.style.setProperty('--art-rx', (-y * 1.15).toFixed(2) + 'deg');
          trigger.style.setProperty('--art-ry', (x * 1.45).toFixed(2) + 'deg');
          trigger.style.setProperty('--art-light-x', ((x + 1) * 50).toFixed(1) + '%');
          trigger.classList.add('is-art-pointer-active');
        });
      }, { passive: true });
      trigger.addEventListener('pointerleave', resetArtTilt, { passive: true });
    }

    trigger.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || event.isPrimary === false) return;
      didSwipe = false;
      pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
      trigger.setPointerCapture?.(event.pointerId);
    });
    trigger.addEventListener('pointerup', event => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      pointerStart = null;
      if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        didSwipe = true;
        window.setTimeout(() => { didSwipe = false; }, 450);
        event.preventDefault();
        moveSelection(dx < 0 ? 1 : -1, { announce: true });
      }
    });
    trigger.addEventListener('pointercancel', () => { pointerStart = null; didSwipe = false; });
    trigger.addEventListener('lostpointercapture', () => { pointerStart = null; didSwipe = false; });
    trigger.addEventListener('click', event => {
      if (event.defaultPrevented || didSwipe) {
        event.preventDefault();
        event.stopPropagation();
        didSwipe = false;
        return;
      }
      const large = lightbox.querySelector('.lightbox-image');
      large.src = image.src;
      large.alt = image.alt;
      const item = itemByArticle.get(article);
      const selectedName = getSelectedName(item);
      lightbox.querySelector('.lightbox-bar strong').textContent = selectedName;
      lightbox.setAttribute('aria-label', selectedName + 'の拡大表示');
      lastLightboxTrigger = trigger;
      if (typeof lightbox.showModal === 'function') lightbox.showModal();
      else lightbox.setAttribute('open', '');
      if (!reducedMotion.matches && supportsWaapi) {
        lightbox.querySelector('.lightbox-inner')?.animate([
          { opacity: 0, transform: 'translate3d(0,18px,0) scale(.975)' },
          { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
        ], { duration: 380, easing: 'cubic-bezier(.16,.82,.22,1)' });
      }
    });
  });

  function finalizeLightboxClose({ restoreFocus = true } = {}) {
    if (typeof lightbox.close === 'function' && lightbox.open) {
      try { lightbox.close(); } catch (_) { lightbox.removeAttribute('open'); }
    } else {
      lightbox.removeAttribute('open');
    }
    lightbox.classList.remove('is-closing');
    const large = lightbox.querySelector('.lightbox-image');
    large.removeAttribute('src');
    large.alt = '';
    if (restoreFocus) lastLightboxTrigger?.focus({ preventScroll: true });
    lastLightboxTrigger = null;
  }

  async function closeLightbox() {
    if (!lightbox.hasAttribute('open') || lightbox.classList.contains('is-closing')) return;
    lightbox.classList.add('is-closing');
    const inner = lightbox.querySelector('.lightbox-inner');
    if (!reducedMotion.matches && supportsWaapi && inner) {
      const closing = inner.animate([
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' },
        { opacity: 0, transform: 'translate3d(0,12px,0) scale(.985)' }
      ], { duration: 210, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
      try { await closing.finished; } catch (_) {}
    }
    finalizeLightboxClose({ restoreFocus: true });
  }
  lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
  lightbox.addEventListener('cancel', event => { event.preventDefault(); closeLightbox(); });

  root.querySelectorAll('.table-responsive').forEach((region, index) => {
    region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', index === 0 ? 'フォーム性能比較表。横方向にスクロールできます。' : '特殊能力系統表。横方向にスクロールできます。');
  });

  const heroCopy = hero?.querySelector('.hero-copy');
  const heroTopline = hero?.querySelector('.hero-topline');

  if (!reducedMotion.matches && supportsWaapi) {
    heroTopline?.animate([
      { opacity: 0, transform: 'translate3d(0,-12px,0)' },
      { opacity: 1, transform: 'translate3d(0,0,0)' }
    ], { duration: 620, easing: 'cubic-bezier(.16,.82,.22,1)', fill: 'backwards' });
    const heroSequence = [
      heroCopy?.querySelector('.hero-eyebrow'),
      heroCopy?.querySelector('h1'),
      heroCopy?.querySelector('.hero-lead'),
      heroCopy?.querySelector('.hero-actions'),
      heroCopy?.querySelector('.hero-metrics')
    ].filter(Boolean);
    heroSequence.forEach((element, index) => {
      const startFrame = { opacity: 0, transform: `translate3d(${-22 + index * 2}px,${16 + index * 2}px,0)` };
      const endFrame = { opacity: 1, transform: 'translate3d(0,0,0)' };
      if (supportsClipPath) {
        startFrame.clipPath = 'inset(0 0 18% 0)';
        endFrame.clipPath = 'inset(0 0 0 0)';
      }
      element.animate([startFrame, endFrame], {
        duration: 700 + index * 36,
        delay: 60 + index * 82,
        easing: 'cubic-bezier(.16,.82,.22,1)',
        fill: 'backwards'
      });
    });
  }

  const navLinks = [...root.querySelectorAll('.archive-nav a')];
  if ('IntersectionObserver' in window) {
    const sections = navLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    const sectionObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach(link => link.setAttribute('aria-current', String(link.getAttribute('href') === '#' + visible.target.id)));
    }, { rootMargin: '-18% 0px -66% 0px', threshold: [0.01, 0.2, 0.5] });
    sections.forEach(section => sectionObserver.observe(section));

    const heroObserver = new IntersectionObserver(entries => {
      const visible = Boolean(entries[0]?.isIntersecting);
      root.classList.toggle('dock-ready', !visible);
      root.classList.toggle('hero-motion-paused', !visible);
    }, { threshold: 0.08 });
    if (hero) heroObserver.observe(hero);
  } else {
    root.classList.add('dock-ready');
  }

  const revealTargets = [...root.querySelectorAll('.section:not(#realm--form-selector), .archive-footer')];
  revealTargets.forEach(target => target.classList.add('v6s-reveal-target'));
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    root.classList.add('v6s-reveal-capable');
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-v6s-revealed');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealTargets.forEach(target => revealObserver.observe(target));
  } else {
    revealTargets.forEach(target => target.classList.add('is-v6s-revealed'));
  }

  let scrollFrame = 0;
  function updatePageProgress() {
    scrollFrame = 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / max));
    scrollProgress.firstElementChild.style.transform = `scaleX(${progress})`;
  }
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updatePageProgress);
  }, { passive: true });

  reducedMotion.addEventListener?.('change', event => {
    if (!event.matches) return;
    renderToken += 1;
    activeIndex = selectedIndex;
    cancelAnimations();
    applyAccent(items[selectedIndex]);
    updateControlState(selectedIndex);
    updateTextAndTables(selectedIndex, false);
    showOnly(selectedIndex);
    centerChip(items[selectedIndex]);
    warmImage(items[selectedIndex]);
    warmNeighbors(selectedIndex);
    revealTargets.forEach(target => target.classList.add('is-v6s-revealed'));
  });

  window.addEventListener('resize', () => {
    if (sheetOpen && !window.matchMedia('(max-width: 620px)').matches) closeSelectorSheet({ immediate: true });
  }, { passive: true });

  function syncVisibility() {
    root.classList.toggle('is-page-hidden', document.hidden);
  }
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();

  function resetTransientUiState() {
    const sheetIsTransient = sheetOpen
      || Boolean(sheetCloseTimer)
      || root.classList.contains('is-selector-sheet-open')
      || root.classList.contains('is-selector-sheet-closing');
    if (sheetIsTransient) {
      sheetOpen = false;
      finalizeSelectorSheetClose(false);
    }
    if (lightbox.hasAttribute('open') || lightbox.querySelector('.lightbox-image')?.hasAttribute('src')) {
      finalizeLightboxClose({ restoreFocus: false });
    }
    if (searchInput.value) {
      searchInput.value = '';
      filterForms();
    }
    pointerStart = null;
  }

  // Reassert transient state only when returning from the back-forward cache.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    resetTransientUiState();
    showOpeningDefault();
  });
  window.addEventListener('pagehide', () => {
    resetTransientUiState();
    resetDefaultInputs();
  });

  motionController?.apply();
  root.classList.add('motion-capable', 'v6s-ready');
  showOpeningDefault();
  filterForms();
  updatePageProgress();
  progression.setAttribute('role', 'radiogroup');
  root.dataset.masterReady = 'true';
  root.dataset.controller = 'master';
})();
}, { once: true });

(() => {
  'use strict';
  const root = document.getElementById('realm--saga-forms-performance-v5');
  if (!root) return;

  const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false };
  const compactQuery = window.matchMedia?.('(max-width: 620px)') || { matches: false };
  const connection = navigator.connection;
  const lowCoreDevice = Number.isFinite(navigator.hardwareConcurrency)
    && navigator.hardwareConcurrency > 0
    && navigator.hardwareConcurrency <= 4;
  let framePressure = false;
  let sampling = false;

  function resolve() {
    if (reducedQuery.matches) return { profile: 'reduced', reason: 'reduced-motion' };
    if (framePressure) return { profile: 'balanced', reason: 'frame-pressure' };
    if (connection?.saveData === true) return { profile: 'balanced', reason: 'save-data' };
    if (lowCoreDevice) return { profile: 'balanced', reason: 'low-core' };
    if (compactQuery.matches) return { profile: 'balanced', reason: 'compact-viewport' };
    return { profile: 'full', reason: 'full-capability' };
  }

  function apply() {
    const state = resolve();
    if (root.dataset.motionProfile !== state.profile) root.dataset.motionProfile = state.profile;
    if (root.dataset.motionReason !== state.reason) root.dataset.motionReason = state.reason;
    return state.profile;
  }

  function sampleWhenReady() {
    if (sampling || apply() !== 'full' || document.hidden) return;
    sampling = true;

    const begin = () => {
      if (!sampling || resolve().profile !== 'full' || document.hidden) {
        sampling = false;
        return;
      }
      const samples = [];
      let previousFrame = 0;

      const sampleFrame = time => {
        if (!sampling || resolve().profile !== 'full' || document.hidden) {
          sampling = false;
          return;
        }
        if (previousFrame) {
          const delta = time - previousFrame;
          if (delta < 250) samples.push(delta);
        }
        previousFrame = time;
        if (samples.length < 30) {
          window.requestAnimationFrame(sampleFrame);
          return;
        }

        sampling = false;
        const ordered = [...samples].sort((a, b) => a - b);
        const average = samples.reduce((sum, delta) => sum + delta, 0) / samples.length;
        const p90 = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * .9))];
        const slowFrames = samples.filter(delta => delta > 24).length;
        if (slowFrames >= 8 || average > 21 || p90 > 26) {
          framePressure = true;
          apply();
        }
      };
      window.requestAnimationFrame(sampleFrame);
    };

    if ('requestIdleCallback' in window) window.requestIdleCallback(begin, { timeout: 900 });
    else window.setTimeout(begin, 180);
  }

  const refresh = () => {
    apply();
    if (root.dataset.motionProfile === 'full' && document.documentElement.classList.contains('realm--saga-ready')) sampleWhenReady();
  };

  reducedQuery.addEventListener?.('change', refresh);
  compactQuery.addEventListener?.('change', refresh);
  connection?.addEventListener?.('change', refresh);
  apply();

  window.RealmMotionController = Object.freeze({
    apply,
    sampleWhenReady,
    get profile() { return root.dataset.motionProfile || apply(); },
    get reason() { return root.dataset.motionReason || resolve().reason; }
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const html = document.documentElement;
  const root = document.getElementById('realm--saga-forms-performance-v5');
  const loader = document.getElementById('realm--saga-boot-loader');
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  const finishBoot = () => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      html.classList.add('realm--saga-ready');
      html.classList.remove('realm--saga-booting');
      window.setTimeout(() => loader?.setAttribute('aria-hidden', 'true'), reduced?.matches ? 90 : 240);
      window.RealmMotionController?.sampleWhenReady();
    }));
  };

  const heroImage = root?.querySelector('.solo-cover-frame-v14 img');
  let imageReady = Promise.resolve();
  if (heroImage && typeof heroImage.decode === 'function') {
    try { imageReady = heroImage.decode().catch(() => {}); } catch (_) {}
  }
  Promise.race([
    imageReady,
    new Promise(resolve => window.setTimeout(resolve, 1200))
  ]).then(finishBoot, finishBoot);

  const compare = document.getElementById('realm--saga-form-compare-ios');
  if (root && compare && 'IntersectionObserver' in window) {
    const compareObserver = new IntersectionObserver(entries => {
      root.classList.toggle('compare-motion-paused', !entries[0]?.isIntersecting);
    }, { rootMargin: '160px 0px', threshold: .01 });
    compareObserver.observe(compare);
  }

}, { once: true });
