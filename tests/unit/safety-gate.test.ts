import { describe, it, expect } from 'vitest';
import { classifyElementSafety, evaluateActionSafety, isDomainAllowed } from '../../src/shared/safety-gate';
import { AgentAction, ScannedElement } from '../../src/shared/types';

describe('Safety Gate - Action & Element Classification', () => {
  it('correctly classifies irreversible action descriptors', () => {
    const irreversibleLabels = [
      'Final Submit Application',
      'Proceed to Pay INR 500',
      'Pay Now',
      'Delete Account',
      'Remove record',
      'Buy Now',
      'Place Order',
      'Confirm and Submit',
      'Apply Now',
    ];

    for (const label of irreversibleLabels) {
      const el: ScannedElement = { id: 1, tag: 'button', type: 'submit', label };
      expect(classifyElementSafety(el), `Expected irreversible for "${label}"`).toBe('irreversible');
    }
  });

  it('correctly classifies sensitive action descriptors', () => {
    const sensitiveLabels = [
      'Reset Form',
      'Clear All',
      'Cancel Registration',
      'Sign Out',
      'Logout',
    ];

    for (const label of sensitiveLabels) {
      const el: ScannedElement = { id: 2, tag: 'button', type: 'button', label };
      expect(classifyElementSafety(el), `Expected sensitive for "${label}"`).toBe('sensitive');
    }
  });

  it('classifies benign navigation or input fields as benign', () => {
    const benignLabels = [
      'Next Page',
      'Candidate Full Name',
      'Father Name',
      'Select Category',
      'Upload Document',
    ];

    for (const label of benignLabels) {
      const el: ScannedElement = { id: 3, tag: 'input', type: 'text', label };
      expect(classifyElementSafety(el), `Expected benign for "${label}"`).toBe('benign');
    }
  });
});

describe('Safety Gate - Approval Policy Enforcement', () => {
  const elementsMap = new Map<number, ScannedElement>([
    [1, { id: 1, tag: 'input', type: 'text', label: 'Full Name' }],
    [2, { id: 2, tag: 'button', type: 'submit', label: 'Final Submit Application' }],
    [3, { id: 3, tag: 'button', type: 'button', label: 'Proceed to Pay' }],
  ]);

  it('requires human approval for irreversible actions in Autopilot mode', () => {
    const submitAction: AgentAction = { type: 'click', id: 2 };
    const payAction: AgentAction = { type: 'click', id: 3 };
    const benignAction: AgentAction = { type: 'type', id: 1, value: 'John Doe' };

    const submitEval = evaluateActionSafety(submitAction, elementsMap, {
      executionMode: 'autopilot',
      dryRun: false,
    });
    expect(submitEval.requiresApproval).toBe(true);
    expect(submitEval.level).toBe('irreversible');

    const payEval = evaluateActionSafety(payAction, elementsMap, {
      executionMode: 'autopilot',
      dryRun: false,
    });
    expect(payEval.requiresApproval).toBe(true);
    expect(payEval.level).toBe('irreversible');

    const benignEval = evaluateActionSafety(benignAction, elementsMap, {
      executionMode: 'autopilot',
      dryRun: false,
    });
    expect(benignEval.requiresApproval).toBe(false);
    expect(benignEval.level).toBe('benign');
  });

  it('requires human approval for EVERY action in Step-by-Step mode', () => {
    const benignAction: AgentAction = { type: 'type', id: 1, value: 'Jane' };

    const evaluation = evaluateActionSafety(benignAction, elementsMap, {
      executionMode: 'step-by-step',
      dryRun: false,
    });
    expect(evaluation.requiresApproval).toBe(true);
    expect(evaluation.level).toBe('sensitive');
  });

  it('bypasses approval requirement in Dry-Run mode', () => {
    const submitAction: AgentAction = { type: 'click', id: 2 };

    const evaluation = evaluateActionSafety(submitAction, elementsMap, {
      executionMode: 'autopilot',
      dryRun: true,
    });
    expect(evaluation.requiresApproval).toBe(false);
    expect(evaluation.reason).toContain('Dry-run mode active');
  });
});

describe('Safety Gate - Domain Allow-List Guard', () => {
  it('permits all domains when allow-list is empty or includes wildcard', () => {
    expect(isDomainAllowed('https://scholarships.gov.in/apply', [])).toBe(true);
    expect(isDomainAllowed('https://random.site.org', ['*'])).toBe(true);
    expect(isDomainAllowed('https://test.edu', ['<all_urls>'])).toBe(true);
  });

  it('restricts execution strictly to allowed domains and subdomains', () => {
    const allowList = ['scholarships.gov.in', 'manit.ac.in'];

    expect(isDomainAllowed('https://scholarships.gov.in/form', allowList)).toBe(true);
    expect(isDomainAllowed('https://portal.manit.ac.in/student', allowList)).toBe(true);
    expect(isDomainAllowed('https://evil-phishing.com/scholarships', allowList)).toBe(false);
    expect(isDomainAllowed('not-a-valid-url', allowList)).toBe(false);
  });
});
