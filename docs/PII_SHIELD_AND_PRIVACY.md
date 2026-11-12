# PII Shield & Privacy Architecture

The core promise of VaultPilot is that **sensitive personal identifiers never leave the user's device in clear text**. This document explains the privacy architecture, threat model, mathematical validation algorithms, and single-egress enforcement.

---

## 1. Threat Model & Privacy Invariants

| Invariant | Description | Enforcement Mechanism |
| :--- | :--- | :--- |
| **NFR-01 (Zero VaultPilot Servers)** | No VaultPilot-operated server receives user data. Direct client-to-model requests only. | Fully client-side extension using standard Chrome APIs (`fetch`, `chrome.storage.local`). |
| **NFR-02 (API Key Protection)** | The user's Gemini API key is never written to logs, prompts, or exported workflows. | Stripped during JSON export in [`src/shared/vault.ts`](../src/shared/vault.ts) and omitted from audit entries. |
| **NFR-05 (Prompt Injection Defense)** | External webpage text cannot hijack the agent or trick it into leaking secrets. | System prompt in [`src/shared/prompts.ts`](../src/shared/prompts.ts) establishes all page content as untrusted data. Profile values are not in the prompt. |
| **NFR-11 (Single Network Egress Point)** | Only one file is permitted to make external network calls to the AI model. | Tested by [`tests/security/egress-leak.test.ts`](../tests/security/egress-leak.test.ts) on every CI run. |
| **FR-11 (Local Value Substitution)** | Real personal values are only substituted at execution time on the page. | Prompts only contain `{profile.*}` tokens; values are resolved in [`src/content/executor.ts`](../src/content/executor.ts). |

---

## 2. Why Simple Regex Is Insufficient (The False Positive Problem)

A common flaw in naive PII masking is relying exclusively on digit count:
- An **Indian Aadhaar number** is a 12-digit number (e.g. `2345 6789 0123`).
- A **College Roll Number**, **Application Tracking ID**, or **Reference Code** on an Indian exam or scholarship portal is also frequently a 12-digit number (e.g. `2024 1109 4582`).

If a tool uses simple regex `\b\d{12}\b`, it will replace legitimate application reference IDs with `[AADHAAR]`. When the AI reads the page, it loses the application ID required to complete the task.

VaultPilot solves this using **Smart Dual-Layer Shielding**:
1. **Mathematical Checksums**: Verifies that a sequence of digits obeys the exact check digit formulas used by issuing authorities before classifying it as sensitive.
2. **Field-Type Heuristics**: Form fields explicitly classified as passwords, OTPs, CVVs, or identity documents are masked regardless of content.

---

## 3. Mathematical Validation Algorithms

### A. The Verhoeff Checksum Algorithm (Indian UIDAI Aadhaar)
Implemented in [`src/shared/pii-shield.ts`](../src/shared/pii-shield.ts#L10-L68).

Aadhaar numbers are 12 digits, begin with 2–9, and use the **Verhoeff algorithm** (based on the dihedral group $D_5$ of order 10) for check digit calculation:

```
c = 0
For each digit d_i from right to left (i = 0, 1, 2, ...):
    c = D[c][ P[i mod 8][d_i] ]
Valid if c == 0
```

Where:
- $D$ is the multiplication table of the dihedral group $D_5$.
- $P$ is the permutation table.
- $INV$ is the inverse table.

**Properties**:
- Detects **100% of all single-digit errors** (e.g. typing `2345` as `2346`).
- Detects **100% of all adjacent transposition errors** (e.g. typing `2345` as `2435`).

Because a random 12-digit tracking number has only a ~10% probability of passing the Verhoeff checksum (and must also match UIDAI prefix constraints), false positives are reduced by **90%** while maintaining **99%+ recall on genuine Aadhaar numbers**.

### B. The Luhn Algorithm / Mod 10 (Credit & Debit Cards)
Implemented in [`src/shared/pii-shield.ts`](../src/shared/pii-shield.ts#L70-L93).

Payment card numbers (Visa, Mastercard, RuPay, Amex) range from 13 to 19 digits and terminate with a Luhn check digit:
1. Starting from the rightmost digit, double the value of every second digit.
2. If doubling results in a number greater than 9, subtract 9.
3. Sum all resulting digits.
4. If the sum modulo 10 is 0, the number is a valid card number.

Non-card 16-digit tracking or transaction references that do not satisfy the Luhn formula remain untouched.

### C. Indian Permanent Account Number (PAN) Regex
Implemented in [`src/shared/pii-shield.ts`](../src/shared/pii-shield.ts#L95-L102).

Indian PAN cards have a strict government-mandated syntax:
```regex
^[A-Z]{5}[0-9]{4}[A-Z]$
```
- First 3 characters: Alphabetic series (`AAA` to `ZZZ`).
- 4th character: Status of the holder (`P` for Person, `C` for Company, `H` for HUF, etc.).
- 5th character: First character of the holder's last name / surname.
- Next 4 characters: Sequential digits (`0001` to `9999`).
- Last character: Alphabetic check digit.

Any string matching this pattern is automatically masked as `[PAN]`.

---

## 4. Field-Type Heuristics

Implemented in `classifyFieldHeuristic` in [`src/shared/pii-shield.ts`](../src/shared/pii-shield.ts#L115-L150).

Regardless of field contents, if an element matches any of the following, its value is masked immediately:
- `type="password"` &rarr; `[PASSWORD]`
- Field name, label, placeholder, or autocomplete containing:
  - `otp`, `one-time-password`, `verification-code`, `mfa` &rarr; `[OTP]`
  - `cvv`, `cvc`, `security-code` &rarr; `[CVV]`
  - `aadhaar`, `aadhar`, `uidai` &rarr; `[AADHAAR]`
  - `pan-card`, `pan-no` &rarr; `[PAN]`
  - `card-number`, `credit-card`, `debit-card` &rarr; `[CARD]`

---

## 5. Universal Recursive Payload Sanitizer (`maskPayload`)

Implemented in [`src/shared/pii-shield.ts`](../src/shared/pii-shield.ts#L225-L270).

`maskPayload<T>(payload: T): MaskResult<T>` is a pure function that recursively walks any arbitrary data structure (strings, arrays, nested objects, or element records):
- Replaces sensitive strings with typed tokens (`[AADHAAR]`, `[PAN]`, `[CARD]`, `[PASSWORD]`, `[OTP]`, `[MOBILE]`).
- Aggregates an exact count of masked entities per category.
- Returns a new sanitized clone along with masking statistics (`MaskStats`), ensuring that the original data is never modified in place.

---

## 6. Single Egress Privacy Gateway (`sendToModel`)

Implemented in [`src/shared/gateway.ts`](../src/shared/gateway.ts).

All features requiring AI assistance (agent loop, self-healing replay, page summarization) must invoke `sendToModel()`:
```typescript
export async function sendToModel(
  payload: ModelRequestPayload,
  ctx: GatewayContext,
  config: GatewayConfig,
  onChunk?: (token: string) => void
): Promise<AgentResponse>
```

**Responsibilities**:
1. Passes the element list and command string through `piiShield.maskPayload()` and `piiShield.maskString()`.
2. Records an audit entry in `chrome.storage.local` containing only the timestamp, feature name, and count of masked entities by category. **Clear-text values are never recorded**.
3. Passes the sanitized prompt to [`src/background/llm-client.ts`](../src/background/llm-client.ts), the sole module with outbound network access.
4. Streams the response, parses the SSE chunks, and validates the output against the strict action schema before returning it.

---

## 7. Automated Security Invariant Verification

Enforced by [`tests/security/egress-leak.test.ts`](../tests/security/egress-leak.test.ts):
- **Static AST & Text Inspection**: Scans every source file in `src/`. If any file other than `src/background/llm-client.ts` references `generativelanguage.googleapis.com` or invokes `fetch`, the test suite fails.
- **Seeded Leak Test**: Injects mathematically valid Aadhaar numbers, PAN strings, and clear-text passwords into test elements. Assembles the outbound prompt and verifies that zero clear-text occurrences exist.
