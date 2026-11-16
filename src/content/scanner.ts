import { ScannedElement, ScanResult } from '../shared/types';

export function* walkDom(root: ParentNode): Generator<Element> {
  const elements = root.querySelectorAll('*');
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    yield el;

    if (el.shadowRoot) {
      yield* walkDom(el.shadowRoot);
    }
  }
}

export function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  let current: Element | null = el;
  while (current && current instanceof HTMLElement) {
    const style = window.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      (current === el && style.pointerEvents === 'none')
    ) {
      return false;
    }
    current = current.parentElement;
  }

  return true;
}

export function resolveElementLabel(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }

  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl && labelEl.textContent) {
      return labelEl.textContent.trim();
    }
  }

  if (el.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && label.textContent) {
        return label.textContent.trim();
      }
    } catch {
      // Ignore selector syntax error
    }
  }

  const parentLabel = el.closest('label');
  if (parentLabel && parentLabel.textContent) {
    return parentLabel.textContent.trim();
  }

  const placeholder = el.getAttribute('placeholder');
  if (placeholder && placeholder.trim()) {
    return placeholder.trim();
  }

  const tagName = el.tagName.toLowerCase();
  if (tagName === 'button' || tagName === 'a' || el.getAttribute('role') === 'button') {
    const text = el.textContent?.trim();
    if (text) {
      return text.slice(0, 100);
    }
  }

  const title = el.getAttribute('title');
  if (title && title.trim()) {
    return title.trim();
  }

  const name = el.getAttribute('name');
  if (name && name.trim()) {
    return name.trim();
  }

  let prev = el.previousElementSibling;
  while (prev) {
    if (prev.textContent && prev.textContent.trim().length > 0) {
      const text = prev.textContent.trim();
      if (text.length <= 60) return text;
      break;
    }
    prev = prev.previousElementSibling;
  }

  return '';
}

export function generateResilientSelector(el: Element): string {
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  const name = el.getAttribute('name');
  if (name) {
    return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }

  const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`;
  }

  const parent = el.parentElement;
  if (!parent) {
    return el.tagName.toLowerCase();
  }

  const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  const index = siblings.indexOf(el) + 1;
  const tag = el.tagName.toLowerCase();

  return `${tag}:nth-of-type(${index})`;
}

export function clearAllVpIds(root: ParentNode = document): void {
  for (const el of walkDom(root)) {
    if (el.hasAttribute('data-vp-id')) {
      el.removeAttribute('data-vp-id');
    }
  }
}

export function scanInteractiveElements(
  root: ParentNode = document,
  options: {
    startId?: number;
    inShadow?: boolean;
    inIframe?: boolean;
  } = {}
): { elements: ScannedElement[]; nextId: number } {
  if (!options.inShadow && !options.inIframe) {
    clearAllVpIds(root);
  }

  const elements: ScannedElement[] = [];
  let currentId = options.startId || 1;

  const interactiveSelector =
    'input, select, textarea, button, a[href], [role="button"], [role="checkbox"], [role="radio"], [role="combobox"], [role="tab"], [tabindex]:not([tabindex="-1"])';

  for (const el of walkDom(root)) {
    if (!el.matches(interactiveSelector)) {
      continue;
    }

    if (!isElementVisible(el)) {
      continue;
    }

    const htmlEl = el as HTMLElement;
    if (htmlEl.hasAttribute('disabled') || (htmlEl as HTMLInputElement).disabled) {
      continue;
    }

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : null))?.toLowerCase() || null;

    if (tag === 'input' && type === 'hidden') {
      continue;
    }

    // Filter out CAPTCHA badges and bot-challenge widgets so the agent focuses on actual form inputs
    const isCaptchaElement =
      (el.closest && el.closest('.grecaptcha-badge, .h-captcha, .cf-turnstile, [data-sitekey]') !== null) ||
      (el.getAttribute('title') || '').toLowerCase().includes('recaptcha') ||
      (el.getAttribute('aria-label') || '').toLowerCase().includes('recaptcha') ||
      (el.tagName.toLowerCase() === 'a' && ((el as HTMLAnchorElement).href || '').toLowerCase().includes('recaptcha'));

    if (isCaptchaElement) {
      continue;
    }

    el.setAttribute('data-vp-id', String(currentId));

    let optionList: string[] | undefined;
    if (tag === 'select') {
      const selectEl = el as HTMLSelectElement;
      optionList = Array.from(selectEl.options).map((opt) => opt.text || opt.value).filter(Boolean);
    }

    let val: string | undefined;
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const inputEl = el as HTMLInputElement;
      val = type === 'password' ? '[PASSWORD]' : inputEl.value;
    }

    let isChecked: boolean | undefined;
    if (type === 'checkbox' || type === 'radio') {
      isChecked = (el as HTMLInputElement).checked;
    }

    const rect = el.getBoundingClientRect();

    elements.push({
      id: currentId++,
      tag,
      type,
      label: resolveElementLabel(el),
      placeholder: el.getAttribute('placeholder') || undefined,
      value: val,
      options: optionList,
      checked: isChecked,
      role: el.getAttribute('role') || undefined,
      name: el.getAttribute('name') || undefined,
      location: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      inShadowRoot: options.inShadow,
      inIframe: options.inIframe,
      selector: generateResilientSelector(el),
    });
  }

  return { elements, nextId: currentId };
}

export function scanPage(): ScanResult {
  const result: ScannedElement[] = [];
  let nextId = 1;
  let accessibleFrames = 0;
  let inaccessibleFrames = 0;

  const mainScan = scanInteractiveElements(document, { startId: nextId });
  result.push(...mainScan.elements);
  nextId = mainScan.nextId;

  const iframes = document.querySelectorAll('iframe');
  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i];
    const iframeSrc = (iframe.getAttribute('src') || '').toLowerCase();
    const iframeTitle = (iframe.getAttribute('title') || '').toLowerCase();

    if (
      iframeSrc.includes('recaptcha') ||
      iframeSrc.includes('hcaptcha') ||
      iframeSrc.includes('turnstile') ||
      iframeSrc.includes('challenges.cloudflare') ||
      iframeTitle.includes('recaptcha')
    ) {
      inaccessibleFrames++;
      continue;
    }

    try {
      const iframeDoc = iframe.contentDocument;
      if (iframeDoc) {
        accessibleFrames++;
        const frameScan = scanInteractiveElements(iframeDoc, {
          startId: nextId,
          inIframe: true,
        });
        result.push(...frameScan.elements);
        nextId = frameScan.nextId;
      } else {
        inaccessibleFrames++;
      }
    } catch {
      inaccessibleFrames++;
    }
  }

  return {
    url: window.location.href,
    title: document.title,
    domain: window.location.hostname,
    elements: result,
    accessibleFramesCount: accessibleFrames,
    inaccessibleFramesCount: inaccessibleFrames,
  };
}
