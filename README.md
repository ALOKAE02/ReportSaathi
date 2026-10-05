# ReportSaathi · demo MVP

A front-end-only, offline demo of **ReportSaathi**, a chat assistant that briefs patients on their lab report in plain language. It is based on the *ReportSaathi Product Design Document v1.0*: consent first, a five-part brief (headline, what looks fine, what to note, what next, quick replies), suggested follow-up questions, honest limits, and a person whenever it matters.

> **Fictional data only.** Every patient, value and phone number in this app is invented. Do not load real patient data. Nothing here is medical advice. "Demo Diagnostics Lab" and "Dr. Mehta" are fictional. This is a concept product, not affiliated with any messaging app.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type check + production build into dist/
npm run preview    # serves dist/ on http://localhost:4173
npm test           # Vitest unit tests (rules, brief, output checks, guardrails)
npm run typecheck
npm run lint
```

The app makes **no network requests** once loaded: no backend, no API keys, no LLM call, no analytics, no web fonts.

## The three pages

1. **What it is** (`#about`): the idea in simple terms: what it does, what it will always do, what it will never do.
2. **Try it** (`#try`): a phone with the chat. Share one of the documents already "on the phone", from the list on the left or with the clip inside the chat. After the brief, the assistant offers quick replies and a tray of **suggested questions** to tap.
3. **How it works** (`#how`): the six steps the assistant went through for your last chat (live), the nine rails and how each is enforced, the handoff queue where a doctor or team member takes over, every message with its checks, and **Try to break it**, which runs the real checks on unsafe draft replies.

## The sample documents

| Key | Document | Patient | What happens |
| --- | --- | --- | --- |
| `1` | Annual health check (PDF) | Rahul Verma, 34 | All in range: calm brief, grouped "fine" line, nothing to do |
| `2` | CBC + HbA1c (PDF) | Ramesh Kumar, 61 | Two values to note, each with range and the change since last time; offers a doctor call |
| `3` | Kidney panel (PDF) | Meena Iyer, 58 | Critical potassium: no values in chat, a doctor calls within 30 minutes |
| `4` | Sugar + thyroid (photo) | Sunita Rao, 45 | A value is unreadable: says so, never guesses, asks for a clearer photo |
| `5` | Health insurance policy (PDF) | Priya Nair, 29 | Not a lab report: says so and explains what it can do |

`R` (or **Start over**) resets everything and clears localStorage. Shortcuts are ignored while typing.

## Demo script (about 4 minutes)

1. **What it is.** *"Patients get a PDF of numbers and no next step. ReportSaathi closes that gap in 30 seconds."* Point at "It will never".
2. **Try it → press `2`.** The PDF appears in the chat. Consent comes first: *"Nothing is read before the patient says OK."* Tap **Yes, continue**.
3. The brief: headline, ✓ what looks fine, ● each flag with its value, range and "lower than last time", one next step. *"Fine first, flags second, never a diagnosis."*
4. Tap the suggestions: **What is HbA1c?**, **How has it changed?** Then type *"Is 7.4 dangerous? Should I change my medicine?"*: the boundary, then straight to a helpful action. Tap **Book a doctor call → Book 5:30 pm today**.
5. Press `3`, say yes. *"Critical: the assistant says nothing clinical. A doctor calls within 30 minutes."* Tap **See the doctor handoff**.
6. **How it works.** Show the six steps for this chat and the rails. In the handoff card, tap **Call patient → Mark as reached**; back on Try it, the chat shows the doctor's closing note.
7. Press `4` for the blurry photo: *"Honest about limits."* Tap **Send a clearer photo**.
8. Finish on **Try to break it**: pick "Give a diagnosis" or "Leak a critical value" and show it blocked, with the safe message the patient would get instead.

## What is real and what is scripted

**Real (deterministic code you can read and test):**

- Routing rules (`src/engine/classify.ts`): unsupported document → critical → sensitive test → unreadable value → unknown test or missing range → something to note → all fine. A value exactly on a boundary is in range.
- The brief and every answer (`src/engine/explain.ts`) are built only from registered templates (`src/engine/templates.ts`) and the approved explanation library (`src/data/reports.ts`).
- Output checks (`src/engine/checks.ts`) on every outgoing message: registered template and version, every number exists in the report, no banned wording (diagnosis, "you have", medicine, tablet, dose, treatment, cure, prescribe), disclaimer on explanations, and no values, test names or units on the critical path. A failing message is never sent; the safe handoff message goes instead.
- Free-text guardrails (`src/engine/guardrails.ts`): emergency wording first, then STOP, delete, consent, the critical path, medicine or diagnosis questions, "is this serious", a person, booking, trend, questions about a test on the report, and a friendly redirect.
- Suggested questions and quick replies (`src/engine/actions.ts`): at most 3 quick replies per message; suggestions come from the route and the flagged tests, jargon first, and drop off once used.

**Scripted or simulated:**

- No LLM is called. `explain()` fills scripted templates; its code comment states the contract a future model must meet.
- Sharing a document, the doctor booking, reminders, the phone call and the 30-day deletion are simulations. The "clearer photo" is a pre-made second file.
- English only in this demo. Hindi and Hinglish, voice notes and photo OCR from the design document are not built.

## Layout

```
src/data/reports.ts        sample documents, approved explanation library, sensitive categories
src/engine/classify.ts     routing rules (pure, no React)
src/engine/explain.ts      the brief, follow-up answers, clinician summary
src/engine/templates.ts    template registry, disclaimer, reviewed phrases
src/engine/checks.ts       output checks
src/engine/guardrails.ts   free-text guardrails
src/engine/actions.ts      quick replies and suggested questions
src/engine/engine.test.ts  Vitest unit tests
src/state/                 store (React context + localStorage + BroadcastChannel) and flows
src/components/            TopNav, AboutPage, TryPage, Phone, HowPage, HandoffCard
docs/screenshots/          screenshots of each page and flow
```
