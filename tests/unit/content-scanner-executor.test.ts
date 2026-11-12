import { describe, it, expect, beforeEach } from 'vitest';
import { scanInteractiveElements, resolveElementLabel, generateResilientSelector } from '../../src/content/scanner';
import { executeSingleAction, executeActionBatch, findElementByVpId } from '../../src/content/executor';
import { AgentAction, UserProfile } from '../../src/shared/types';

describe('Content Scanner - DOM Traversal & Label Resolution', () => {
  beforeEach(() => {
    // Happy-DOM mock for getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = () => ({
      x: 10,
      y: 10,
      width: 100,
      height: 30,
      top: 10,
      left: 10,
      bottom: 40,
      right: 110,
      toJSON: () => {},
    });

    document.body.innerHTML = `
      <form id="test-form">
        <label for="input-name">Student Full Name</label>
        <input type="text" id="input-name" name="student_name" />

        <label>
          Date of Birth
          <input type="date" id="input-dob" />
        </label>

        <input type="password" id="input-pass" placeholder="Secret Password" />

        <select id="select-category" name="category">
          <option value="GEN">General</option>
          <option value="OBC">OBC</option>
        </select>

        <label>
          <input type="checkbox" id="check-agree" />
          I agree to the terms
        </label>

        <button type="submit" id="btn-submit">Submit Form</button>
      </form>
    `;
  });

  it('correctly associates labels from <label for> and wrapping <label>', () => {
    const inputName = document.getElementById('input-name')!;
    expect(resolveElementLabel(inputName)).toBe('Student Full Name');

    const inputDob = document.getElementById('input-dob')!;
    expect(resolveElementLabel(inputDob)).toContain('Date of Birth');

    const inputPass = document.getElementById('input-pass')!;
    expect(resolveElementLabel(inputPass)).toBe('Secret Password');

    const btnSubmit = document.getElementById('btn-submit')!;
    expect(resolveElementLabel(btnSubmit)).toBe('Submit Form');
  });

  it('generates resilient selectors for replay', () => {
    const inputName = document.getElementById('input-name')!;
    expect(generateResilientSelector(inputName)).toBe('#input-name');

    const inputPass = document.getElementById('input-pass')!;
    expect(generateResilientSelector(inputPass)).toBe('#input-pass');
  });

  it('scans and tags interactive elements with sequential data-vp-id', () => {
    const { elements } = scanInteractiveElements(document.body);
    expect(elements.length).toBeGreaterThanOrEqual(5);

    const ids = elements.map((e) => e.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6]);

    // Check that elements received data-vp-id in DOM
    const el1 = document.querySelector('[data-vp-id="1"]') as HTMLInputElement;
    expect(el1).not.toBeNull();
    expect(el1.id).toBe('input-name');
  });
});

describe('Content Executor - DOM Mutation & Action Dispatch', () => {
  const profile: UserProfile = {
    fullName: 'Saumya Khushlani',
    dob: '2004-05-15',
  };

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="action-form">
        <input type="text" id="target-text" data-vp-id="1" />
        <select id="target-select" data-vp-id="2">
          <option value="">Select</option>
          <option value="General">General Category</option>
          <option value="OBC">OBC Category</option>
        </select>
        <input type="checkbox" id="target-check" data-vp-id="3" />
        <button type="button" id="target-button" data-vp-id="4">Click Me</button>
      </form>
    `;
  });

  it('finds element by data-vp-id attribute', () => {
    const el = findElementByVpId(1);
    expect(el).not.toBeNull();
    expect(el?.id).toBe('target-text');
  });

  it('executes type action and substitutes profile token', async () => {
    const action: AgentAction = { type: 'type', id: 1, value: '{profile.full_name}' };
    const res = await executeSingleAction(action, profile);

    expect(res.success).toBe(true);
    const input = document.getElementById('target-text') as HTMLInputElement;
    expect(input.value).toBe('Saumya Khushlani');
  });

  it('executes select action with option matching', async () => {
    const action: AgentAction = { type: 'select', id: 2, value: 'General' };
    const res = await executeSingleAction(action, profile);

    expect(res.success).toBe(true);
    const select = document.getElementById('target-select') as HTMLSelectElement;
    expect(select.value).toBe('General');
  });

  it('executes check action updating checkbox state', async () => {
    const action: AgentAction = { type: 'check', id: 3, checked: true };
    const res = await executeSingleAction(action, profile);

    expect(res.success).toBe(true);
    const checkbox = document.getElementById('target-check') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('executes click action triggering click event handlers', async () => {
    let clicked = false;
    const button = document.getElementById('target-button') as HTMLButtonElement;
    button.addEventListener('click', () => {
      clicked = true;
    });

    const action: AgentAction = { type: 'click', id: 4 };
    const res = await executeSingleAction(action, profile);

    expect(res.success).toBe(true);
    expect(clicked).toBe(true);
  });

  it('executes action batch sequentially and stops on element missing error', async () => {
    const actions: AgentAction[] = [
      { type: 'type', id: 1, value: 'Hello' },
      { type: 'check', id: 3, checked: true },
      { type: 'click', id: 999 }, // Missing ID
    ];

    const results = await executeActionBatch(actions, profile);
    expect(results).toHaveLength(3);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(results[2].success).toBe(false);
    expect(results[2].error).toContain('Element with id 999 not found');
  });
});
