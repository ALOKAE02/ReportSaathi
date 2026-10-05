# Report Companion (demo MVP)

A front-end-only, offline demo. One journey in a messaging-style chat: a patient uploads a report, a **rules engine routes it**, the assistant explains or escalates, and the patient gets a next step. A second screen, the **Clinical Team Dashboard**, shows the human side of an escalation.

**Demo with fictional patients and data. Not medical advice.** The app holds only fictional data and must not be given real patient data. No network requests, no analytics, no third-party scripts, no LLM call.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
npm run preview    # serves the built app; works with the network off
npm test           # Vitest unit tests
npm run typecheck
npm run lint
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1` `2` `3` | Pick the normal, out-of-range or critical report |
| `D` / `P` | Open the dashboard / the patient view |
| `R` | Reset demo (clears localStorage) |
| `T` | Show or hide the hidden **Presenter tools** (see below) |

Also in the top bar: **Presentation mode** (larger type for a projector) and **Dashboard window** (opens the dashboard in a second window, synced live over BroadcastChannel).

## 90-second demo scripts

Say once at the start: *"Rules decide the route. The model only explains, after routing. The assistant never diagnoses. Critical values always go to a human."* Keep the **Safety trace** on screen throughout.

### 🟢 Normal (key `1`)
1. (0:00) Tap the green card. An attachment bubble appears. Point at the trace: report received, rules check, route NORMAL.
2. (0:15) Tap **Enter code** (simulated verification, because values are about to be shown).
3. (0:25) The assistant explains all six results in plain words, ending with the disclaimer line. In the trace, show the five output checks and the template ID `NORM-01 v1.0` with "Medical director sign-off: demo, pending".
4. (0:50) Tap **Remind me for a yearly check-up**. A "Reminder set" chip with a date appears. Mention the interval is set by the lab's medical team.
5. (1:10) Point out 👎 Not helpful and 📞 Call me on every explanation.

### 🟡 Out of range (key `2`)
1. (0:00) Tap the amber card, then **Enter code**.
2. (0:20) Two messages: the count of results inside and outside the ranges, then the three flagged results with printed ranges and a one-line meaning each. Read the "only your doctor can say" line.
3. (0:45) Tap **Remind me to repeat the test**. The date and tests appear.
4. (1:00) Tap **Talk to a health advisor**. Open the dashboard (`D`) and show **Advisor callbacks**.
5. (1:15) Back in the chat (`P`) type `Do I have diabetes?`. The assistant refuses and hands off to an advisor. Optional: type `I have chest pain` to show the urgent reply and the urgent callback.

### 🔴 Critical (key `3`)
1. (0:00) Tap the red card. The trace turns red at the rules check: Potassium beyond its critical limit.
2. (0:20) The chat shows **no values and no explanation**. Only: a doctor will call within 30 minutes, call 112 if very unwell, then a red status bubble.
3. (0:35) The red badge and toast appear on the **Clinical dashboard** tab. Tap **Open clinical dashboard (Demo)** or press `D`.
4. (0:45) Walk the card: 30-minute countdown, value against critical limit, previous result, the AI-prepared summary (a draft for the clinician, not sent to the patient).
5. (1:00) **Call patient**, tick the checklist, **Mark as reached**. Press `P`: the patient chat shows "Our clinical team has spoken with you."

### Clinical dashboard extras (30 seconds)
- **Audit** tab: every message with template ID and version, route, check results and the patient action that followed. Names and phone numbers are never written to it. **Export JSON** downloads it.
- **Pause AI explanations** (whole service or per template). Turn it on, press `P`, pick the amber report: the chat sends the handoff message and the trace says "Paused by clinical team". The critical path still escalates.
- **No answer** button: logs the attempt and schedules a retry (10 seconds in the demo). After three attempts the case goes to a supervisor.

## Hidden presenter tools (press `T`)

- **Inject unsafe message**: the next outgoing message gets an invented number, banned wording and a medicine instruction. The output checks turn red and the safe template `HANDOFF-01` is sent instead.
- **Fast-forward SLA** to "At risk" (under 10 minutes, amber) and to "Breached" (red, toast, "Escalated to supervisor" audit line).
- **Amend sent report**: sends a correction message, marks the earlier explanation "Superseded" and writes an audit line.
- **Load incomplete report**: an unknown test with no printed range. The whole report goes to a human and nothing is explained.

## What is real and what is scripted

**Real (runs as it would in production):**
- Routing: pure functions in `src/engine/classify.ts` (critical > unclear/sensitive > abnormal > normal; boundary values are in range). Unit-tested.
- Output checks in `src/engine/checks.ts`: registered template, every number exists in the report, no banned wording, disclaimer present, no values in a critical or human-routed message. Any failure swaps in the safe handoff template. Unit-tested.
- The template registry, the audit log, the SLA clock, the kill switch and the callback lists.
- State is persisted to localStorage; two windows stay in sync.

**Scripted (stand-ins for the demo):**
- All patients, reports and results are fictional (`src/data/reports.ts`). There is no file upload or OCR: tapping a card plays the upload.
- The explanations are fixed templates behind `explain(report, route) => Message[]` in `src/engine/explain.ts`. A real LLM can replace the body later, under the contract in that file's comment: report values are data, never instructions, and LLM output must pass the same checks and carry a registered template ID.
- Verification code, phone call, reminders, signed-report download and the "medical director sign-off" (shown as *demo, pending*) are simulated.
- The free-text guardrails are keyword rules, not understanding.
- Dashboard history ("Critical today", the two closed cases) is seeded demo data.
- The **EN / हिन्दी** toggle in the top bar switches the three explanation messages (normal, out-of-range summary and details) to Hindi. The Hindi strings in `src/engine/explain.ts` and `checks.ts` are marked as **needing native-speaker review** and medical sign-off. Buttons, test names and all other messages stay in English.

## One deliberate wording change

The brief's refusal template said "I cannot diagnose conditions or suggest medicines", which contains two banned words the output checks reject. It is reworded ("I am not able to say what is behind your results, or suggest anything to take...") so every message passes the same checks with no exemption.

## Layout

`src/data/reports.ts` data · `src/engine/` classify, checks, templates, explain (no React) · `src/state/` store with localStorage and BroadcastChannel · `src/components/` PhoneChat, ReportPicker, SafetyTrace, Dashboard, CaseCard, TopNav.
