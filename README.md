# VaultPilot 🛡️
> **A Privacy-First, Bring-Your-Own-Key (BYOK) AI Browser Automation Chrome Extension with Local Data Protection**

VaultPilot automates repetitive web tasks (such as college portals, scholarship applications, and ERP workflows) from plain-language commands in English, Hindi, and Hinglish without exposing sensitive personal identifiers (Aadhaar, PAN, credentials, OTPs) to cloud LLMs.

---

## Key Features

1. **Bring-Your-Own-Key (BYOK) Architecture**:
   - Zero VaultPilot servers; operates 100% locally in the browser.
   - User supplies their own Google Gemini API key (`gemini-2.0-flash` with streaming SSE).
2. **Dual-Layer Smart PII Shield**:
   - Field-attribute heuristic masking (`type="password"`, OTP, CVV labels &rarr; `[MASKED]`).
   - Verhoeff checksum algorithm for Indian Aadhaar validation (12-digit UIDAI standard).
   - Luhn checksum algorithm for Credit/Debit payment card validation (13–19 digits).
   - Regex matching for Indian PAN cards (`[A-Z]{5}[0-9]{4}[A-Z]`) and 10-digit mobile numbers.
   - Zero clear-text sensitive strings escape the device.
3. **Local Single Profile Vault**:
   - Personal details (Name, DOB, Category, Address, College, Roll No, etc.) are stored strictly in `chrome.storage.local`.
   - Outbound prompts only reference `{profile.*}` placeholder keys; actual values are substituted locally right at DOM insertion time.
   - 1-Click JSON export (with API key stripped per NFR-02) and 1-Click wipe.
4. **Dual-Mode Safety Gate**:
   - **Smart Autopilot**: Automatically performs safe form actions; pauses and requests explicit user confirmation for irreversible actions (`submit`, `pay`, `confirm`, `delete`).
   - **Step-by-Step Mode**: Mandatory user confirmation for every discrete action.
   - Emergency **Stop** button with immediate `AbortController` cancellation.
5. **Hybrid Self-Healing Workflows**:
   - Completed runs can be saved and replayed in `<2s` with zero tokens.
   - Automatic fallback to AI healing if website layout drifts.
   - Pinned prompt templates for common student portals.
6. **Prompt Injection Defense**:
   - Webpage content is treated strictly as untrusted data in prompts (NFR-05).

---

## Repository Structure

```
vaultpilot/
├── manifest.json              # Chrome Manifest V3 specification
├── package.json               # Dependencies and build scripts
├── vite.config.ts             # Bundler configuration (@crxjs/vite-plugin)
├── tsconfig.json              # TypeScript strict configuration
├── vitest.config.ts           # Vitest configuration
├── .github/workflows/ci.yml   # CI pipeline (lint, test, build)
├── src/
│   ├── background/
│   │   ├── agent-loop.ts      # Orchestrates Scan -> Mask -> Gateway -> Execute loop
│   │   ├── llm-client.ts      # Sole authorized Gemini SSE streaming client (NFR-11)
│   │   └── service-worker.ts  # Manifest V3 service worker entry point
│   ├── content/
│   │   ├── content-main.ts    # Content script message dispatcher
│   │   ├── scanner.ts         # Shadow-DOM & iframe aware recursive DOM scanner
│   │   └── executor.ts        # DOM action executor with profile substitution
│   ├── shared/
│   │   ├── gateway.ts         # Single privacy gateway choke-point (FR-21)
│   │   ├── pii-shield.ts      # Verhoeff, Luhn, PAN, and heuristic PII masking
│   │   ├── prompts.ts         # System & user prompt builder with injection defense
│   │   ├── safety-gate.ts     # Action safety classifier & allow-list checker
│   │   ├── schema.ts          # Strict JSON action schema validation
│   │   ├── types.ts           # Core TypeScript types & schemas
│   │   ├── vault.ts           # Profile vault & substitution engine
│   │   └── workflow-manager.ts# Replay engine & prompt templates
│   └── sidepanel/
│       ├── index.html         # Side panel UI layout
│       ├── styles.css         # Modern dark slate styling
│       └── panel.ts           # UI event & state controller
└── tests/
    ├── fixtures/mock-form.html# Test fixture with Shadow DOM & injection trap
    ├── security/
    │   └── egress-leak.test.ts# Enforces NFR-11 (asserts zero egress outside gateway)
    └── unit/
        ├── schema.test.ts     # Schema validation unit tests
        └── shield.test.ts     # Verhoeff, Luhn, PAN, and heuristics tests
```

---

## Installation & Setup

### 1. Build Extension
```bash
# Install dependencies
npm install

# Run tests
npm test

# Verify security invariant (zero egress outside gateway)
npm run test:security

# Build production Chrome extension
npm run build
```

### 2. Load in Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `dist/` directory generated in the project root.
5. Click the **Extensions** toolbar icon (puzzle piece) and pin **VaultPilot**.
6. Click the VaultPilot icon to open the Chrome Side Panel.

### 3. Quick Start Walkthrough
1. **Configure API Key**: Go to the **Settings** tab &rarr; paste your Google Gemini API key &rarr; Save.
2. **Setup Profile Vault**: Go to the **Profile Vault** tab &rarr; enter your student details (Name, DOB, Roll No, etc.) &rarr; Save Profile.
3. **Automate a Form**:
   - Open any form (e.g. `tests/fixtures/mock-form.html`).
   - In the Assistant tab, type: `Fill this form using my saved profile` (or use one of the pinned templates).
   - Watch VaultPilot stream reasoning, fill fields with local substitutions, and pause for approval at the submit button!

---

## Automated Verification

```bash
# Run all unit and security tests
npm test

# Enforce privacy egress invariant test
npm run test:security

# Type checking
npm run typecheck
```
