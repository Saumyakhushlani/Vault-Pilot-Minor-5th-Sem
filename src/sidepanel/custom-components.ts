/**
 * VaultPilot - Custom Accessible Components
 * 1. Custom Smooth Dropdown: Replaces clunky OS native <select> with a smooth,
 *    custom-styled dropdown component with clean chevron animation, active checkmarks,
 *    click-outside closing, and two-way proxy synchronization with the underlying <select>.
 * 2. Custom Date Picker: Replaces Windows/Chrome <input type="date"> with a soft,
 *    fast calendar popover featuring month/year navigation and quick-jump student
 *    birth-year presets (2002-2006).
 */

export interface DropdownController {
  update: () => void;
  destroy: () => void;
}

/**
 * Transforms a native <select> into a custom dropdown component.
 */
export function initCustomDropdown(selectEl: HTMLSelectElement): DropdownController {
  if (!selectEl) return { update: () => {}, destroy: () => {} };

  if (selectEl.dataset.customDropdownInit === 'true') {
    return {
      update: () => {
        selectEl.dispatchEvent(new CustomEvent('custom-dropdown-refresh'));
      },
      destroy: () => {},
    };
  }

  selectEl.dataset.customDropdownInit = 'true';

  // Visually hide native select while keeping it in the DOM for forms and accessibility
  selectEl.style.display = 'none';
  selectEl.setAttribute('aria-hidden', 'true');
  selectEl.setAttribute('tabindex', '-1');

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-dropdown-wrapper';
  if (selectEl.id) {
    wrapper.dataset.forSelect = selectEl.id;
  }

  // Create trigger button
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-dropdown-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const labelSpan = document.createElement('span');
  labelSpan.className = 'custom-dropdown-label';

  const chevronSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevronSvg.setAttribute('class', 'custom-dropdown-chevron');
  chevronSvg.setAttribute('viewBox', '0 0 24 24');
  chevronSvg.setAttribute('fill', 'none');
  chevronSvg.setAttribute('stroke', 'currentColor');
  chevronSvg.setAttribute('stroke-width', '2');
  chevronSvg.setAttribute('stroke-linecap', 'round');
  chevronSvg.setAttribute('stroke-linejoin', 'round');
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '6 9 12 15 18 9');
  chevronSvg.appendChild(polyline);

  trigger.appendChild(labelSpan);
  trigger.appendChild(chevronSvg);
  wrapper.appendChild(trigger);

  // Create dropdown menu container
  const menu = document.createElement('div');
  menu.className = 'custom-dropdown-menu';
  menu.setAttribute('role', 'listbox');
  wrapper.appendChild(menu);

  function rebuildItems(): void {
    menu.innerHTML = '';
    const options = Array.from(selectEl.options);

    const selectedOption = options.find((opt) => opt.value === selectEl.value) || options[0];
    labelSpan.textContent = selectedOption ? (selectedOption.textContent || 'Select...') : 'Select...';

    options.forEach((opt) => {
      const item = document.createElement('div');
      item.className = 'custom-dropdown-item';
      item.setAttribute('role', 'option');
      item.setAttribute('data-value', opt.value);
      if (opt.value === selectEl.value) {
        item.classList.add('selected');
      }

      const itemText = document.createElement('span');
      itemText.className = 'custom-dropdown-item-text';
      itemText.textContent = opt.textContent || opt.value;

      const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      checkSvg.setAttribute('class', 'custom-dropdown-check');
      checkSvg.setAttribute('viewBox', '0 0 24 24');
      checkSvg.setAttribute('fill', 'none');
      checkSvg.setAttribute('stroke', 'currentColor');
      checkSvg.setAttribute('stroke-width', '2.5');
      checkSvg.setAttribute('stroke-linecap', 'round');
      checkSvg.setAttribute('stroke-linejoin', 'round');
      const checkPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      checkPoly.setAttribute('points', '20 6 9 17 4 12');
      checkSvg.appendChild(checkPoly);

      item.appendChild(itemText);
      item.appendChild(checkSvg);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const prevVal = selectEl.value;
        selectEl.value = opt.value;
        updateUI();
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');

        if (prevVal !== opt.value) {
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      menu.appendChild(item);
    });
  }

  function updateUI(): void {
    const options = Array.from(selectEl.options);
    const selectedOption = options.find((opt) => opt.value === selectEl.value) || options[0];
    labelSpan.textContent = selectedOption ? (selectedOption.textContent || 'Select...') : 'Select...';

    menu.querySelectorAll('.custom-dropdown-item').forEach((itemEl) => {
      const val = itemEl.getAttribute('data-value');
      if (val === selectEl.value) {
        itemEl.classList.add('selected');
      } else {
        itemEl.classList.remove('selected');
      }
    });
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrapper.classList.contains('open');

    // Close any other open dropdowns and datepickers
    document.querySelectorAll('.custom-dropdown-wrapper.open').forEach((w) => {
      if (w !== wrapper) {
        w.classList.remove('open');
        w.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
    document.querySelectorAll('.custom-datepicker-container.open').forEach((c) => {
      c.classList.remove('open');
      c.querySelector('.custom-dp-trigger')?.setAttribute('aria-expanded', 'false');
    });

    if (isOpen) {
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      rebuildItems();
      wrapper.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  selectEl.addEventListener('change', () => {
    updateUI();
  });

  selectEl.addEventListener('custom-dropdown-refresh', () => {
    rebuildItems();
  });

  selectEl.parentNode?.insertBefore(wrapper, selectEl.nextSibling);
  rebuildItems();

  return {
    update: () => {
      rebuildItems();
      updateUI();
    },
    destroy: () => {
      wrapper.remove();
      selectEl.style.display = '';
      selectEl.removeAttribute('aria-hidden');
      selectEl.removeAttribute('tabindex');
      delete selectEl.dataset.customDropdownInit;
    },
  };
}

export interface DatePickerConfig {
  inputId: string;
  containerId: string;
  triggerId: string;
  labelId: string;
  popoverId: string;
}

export interface DatePickerController {
  syncFromInput: () => void;
}

/**
 * Connects the custom calendar popover to the underlying date input element.
 */
export function initCustomDatePicker(config: DatePickerConfig): DatePickerController {
  const rawInputEl = document.getElementById(config.inputId) as HTMLInputElement | null;
  const rawContainer = document.getElementById(config.containerId) as HTMLElement | null;
  const rawTrigger = document.getElementById(config.triggerId) as HTMLButtonElement | null;
  const rawLabel = document.getElementById(config.labelId) as HTMLElement | null;
  const rawPopover = document.getElementById(config.popoverId) as HTMLElement | null;
  const rawMonthSelect = document.getElementById('dp-month-select') as HTMLSelectElement | null;
  const rawYearSelect = document.getElementById('dp-year-select') as HTMLSelectElement | null;
  const rawPrevBtn = document.getElementById('dp-prev-month') as HTMLButtonElement | null;
  const rawNextBtn = document.getElementById('dp-next-month') as HTMLButtonElement | null;
  const rawDaysGrid = document.getElementById('dp-days-grid') as HTMLElement | null;
  const rawPresetsChips = document.getElementById('dp-presets-chips') as HTMLElement | null;

  if (
    !rawInputEl ||
    !rawContainer ||
    !rawTrigger ||
    !rawLabel ||
    !rawPopover ||
    !rawMonthSelect ||
    !rawYearSelect ||
    !rawDaysGrid
  ) {
    return { syncFromInput: () => {} };
  }

  // Non-nullable local constants for closure safety
  const inputEl: HTMLInputElement = rawInputEl;
  const container: HTMLElement = rawContainer;
  const trigger: HTMLButtonElement = rawTrigger;
  const label: HTMLElement = rawLabel;
  const monthSelect: HTMLSelectElement = rawMonthSelect;
  const yearSelect: HTMLSelectElement = rawYearSelect;
  const daysGrid: HTMLElement = rawDaysGrid;
  const prevBtn: HTMLButtonElement | null = rawPrevBtn;
  const nextBtn: HTMLButtonElement | null = rawNextBtn;
  const presetsChips: HTMLElement | null = rawPresetsChips;

  // Populate Year selector: 2026 down to 1960
  yearSelect.innerHTML = '';
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= 1960; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSelect.appendChild(opt);
  }

  let viewYear = 2004;
  let viewMonth = 4; // May (typical undergraduate)
  let selectedDateStr = inputEl.value || '';

  const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDisplayDate(isoDate: string): string {
    if (!isoDate || !isoDate.includes('-')) return 'Select Date';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return 'Select Date';
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d) || m < 0 || m > 11) return 'Select Date';
    return `${d} ${MONTH_NAMES_SHORT[m]} ${y}`;
  }

  function renderCalendar(): void {
    monthSelect.value = String(viewMonth);
    yearSelect.value = String(viewYear);

    daysGrid.innerHTML = '';

    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const today = new Date();
    const isThisYear = today.getFullYear() === viewYear;
    const isThisMonth = today.getMonth() === viewMonth;
    const todayDate = today.getDate();

    // Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'dp-day-cell other-month';
      cell.textContent = String(dayNum);
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        let targetMonth = viewMonth - 1;
        let targetYear = viewYear;
        if (targetMonth < 0) {
          targetMonth = 11;
          targetYear -= 1;
        }
        selectDay(targetYear, targetMonth, dayNum);
      });
      daysGrid.appendChild(cell);
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'dp-day-cell';
      cell.textContent = String(d);

      const cellIso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (selectedDateStr === cellIso) {
        cell.classList.add('selected');
      }
      if (isThisYear && isThisMonth && d === todayDate) {
        cell.classList.add('today');
      }

      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        selectDay(viewYear, viewMonth, d);
      });
      daysGrid.appendChild(cell);
    }

    // Next month leading days
    const totalRendered = firstDayIndex + daysInCurrentMonth;
    const remaining = totalRendered % 7 === 0 ? 0 : 7 - (totalRendered % 7);
    for (let n = 1; n <= remaining; n++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'dp-day-cell other-month';
      cell.textContent = String(n);
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        let targetMonth = viewMonth + 1;
        let targetYear = viewYear;
        if (targetMonth > 11) {
          targetMonth = 0;
          targetYear += 1;
        }
        selectDay(targetYear, targetMonth, n);
      });
      daysGrid.appendChild(cell);
    }
  }

  function selectDay(y: number, m: number, d: number): void {
    const formatted = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    selectedDateStr = formatted;
    viewYear = y;
    viewMonth = m;
    inputEl.value = formatted;
    label.textContent = formatDisplayDate(formatted);

    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));

    container.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    renderCalendar();
  }

  function syncFromInput(): void {
    const val = inputEl.value.trim();
    selectedDateStr = val;
    if (val && val.includes('-')) {
      const parts = val.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) {
          viewYear = y;
          viewMonth = m;
        }
      }
      label.textContent = formatDisplayDate(val);
    } else {
      label.textContent = 'Select Date';
    }
    renderCalendar();
  }

  // Trigger click
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.contains('open');

    // Close any other open dropdowns
    document.querySelectorAll('.custom-dropdown-wrapper.open').forEach((w) => {
      w.classList.remove('open');
      w.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
    });

    if (isOpen) {
      container.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      syncFromInput();
      container.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  // Header Month / Year selects
  monthSelect.addEventListener('change', () => {
    viewMonth = parseInt(monthSelect.value, 10);
    renderCalendar();
  });

  yearSelect.addEventListener('change', () => {
    viewYear = parseInt(yearSelect.value, 10);
    renderCalendar();
  });

  // Month navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (viewMonth === 0) {
        viewMonth = 11;
        viewYear -= 1;
      } else {
        viewMonth -= 1;
      }
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (viewMonth === 11) {
        viewMonth = 0;
        viewYear += 1;
      } else {
        viewMonth += 1;
      }
      renderCalendar();
    });
  }

  // Quick preset year chips
  if (presetsChips) {
    presetsChips.querySelectorAll<HTMLButtonElement>('.dp-year-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const y = parseInt(chip.getAttribute('data-year') || '', 10);
        if (!isNaN(y)) {
          viewYear = y;
          renderCalendar();
        }
      });
    });
  }

  inputEl.addEventListener('change', () => {
    syncFromInput();
  });

  syncFromInput();

  return {
    syncFromInput,
  };
}

/**
 * Initializes all custom dropdowns and datepickers across the sidepanel UI,
 * setting up document-level click-outside and escape listeners.
 */
export function setupAllCustomControls(): {
  syncAll: () => void;
  syncDob: () => void;
} {
  const dropdownSelectors = [
    '#mode-select',
    '#v-gender',
    '#v-category',
    '#s-model',
    '#s-lang',
  ];

  const controllers: DropdownController[] = [];

  dropdownSelectors.forEach((sel) => {
    const el = document.querySelector<HTMLSelectElement>(sel);
    if (el) {
      controllers.push(initCustomDropdown(el));
    }
  });

  const dpController = initCustomDatePicker({
    inputId: 'v-dob',
    containerId: 'custom-dp-dob',
    triggerId: 'custom-dp-dob-trigger',
    labelId: 'custom-dp-dob-label',
    popoverId: 'custom-dp-dob-popover',
  });

  // Global click-outside listener
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    if (!target.closest('.custom-dropdown-wrapper')) {
      document.querySelectorAll('.custom-dropdown-wrapper.open').forEach((w) => {
        w.classList.remove('open');
        w.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      });
    }

    if (!target.closest('.custom-datepicker-container')) {
      document.querySelectorAll('.custom-datepicker-container.open').forEach((c) => {
        c.classList.remove('open');
        c.querySelector('.custom-dp-trigger')?.setAttribute('aria-expanded', 'false');
      });
    }
  });

  // Global escape key listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.custom-dropdown-wrapper.open').forEach((w) => {
        w.classList.remove('open');
        w.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.custom-datepicker-container.open').forEach((c) => {
        c.classList.remove('open');
        c.querySelector('.custom-dp-trigger')?.setAttribute('aria-expanded', 'false');
      });
    }
  });

  return {
    syncAll: () => {
      controllers.forEach((c) => c.update());
      dpController.syncFromInput();
    },
    syncDob: () => {
      dpController.syncFromInput();
    },
  };
}
