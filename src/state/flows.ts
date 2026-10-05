// Orchestration: drives the chat and the "How it works" trace from the real engine.
// Every assistant message goes through deliver(), which runs the output checks first.
import { getReport, type Report } from '../data/reports';
import { actionLabel, briefReplies, type ActionId } from '../engine/actions';
import { runOutputChecks } from '../engine/checks';
import { classify, type Route } from '../engine/classify';
import { clinicianSummary, explain, explainEach, reminder, serious, shareSummary, trend, whatIs } from '../engine/explain';
import { fmtTime, maskName } from '../engine/format';
import { EMERGENCY_PATTERN, routeFreeText, STOP_PATTERN } from '../engine/guardrails';
import { render, TEMPLATES, type Message } from '../engine/templates';
import {
  clearStorage,
  emptyConversation,
  emptyTrace,
  initialState,
  uid,
  type ChatMessage,
  type Handoff,
  type Page,
  type StepKey,
  type StepStatus,
  type Store,
} from './store';

export const SLA_MINUTES = 30;

class Cancelled extends Error {}

export type Actions = ReturnType<typeof createActions>;

export function createActions(store: Store) {
  let gen = 0;
  const get = () => store.getState();
  const mutate = store.mutate;

  const wait = (ms: number, g: number) =>
    new Promise<void>((resolve, reject) => setTimeout(() => (g === gen ? resolve() : reject(new Cancelled())), ms));

  /** Runs one async flow. A newer flow (or a reset) cancels it at its next wait. */
  const run = (fn: (g: number) => Promise<void>) => {
    const g = gen;
    mutate((d) => {
      d.data.conversation.busy = true;
    });
    fn(g)
      .catch((err) => {
        if (!(err instanceof Cancelled)) console.error(err);
      })
      .finally(() => {
        if (g === gen) {
          mutate((d) => {
            d.data.conversation.busy = false;
            d.data.conversation.typing = false;
          });
        }
      });
  };

  const currentReport = (): Report | undefined => getReport(get().data.conversation.reportId);
  const currentRoute = (): Route | undefined => get().data.conversation.route;

  // ---------- small helpers ----------

  const setStep = (key: StepKey, status: StepStatus, detail?: string[]) =>
    mutate((d) => {
      d.data.trace.steps[key] = { status, detail: detail ?? d.data.trace.steps[key].detail };
    });

  const traceEvent = (text: string, tone: 'info' | 'note' | 'alert' = 'info') =>
    mutate((d) => {
      d.data.trace.log.push({ type: 'event', id: uid('ev'), at: Date.now(), text, tone });
    });

  const push = (m: Omit<ChatMessage, 'id' | 'at'>) => {
    const id = uid('m');
    mutate((d) => {
      d.data.conversation.messages.push({ id, at: Date.now(), ...m });
    });
    return id;
  };

  const userSays = async (g: number, text: string, extra: Partial<ChatMessage> = {}) => {
    const id = push({ from: 'user', kind: 'text', text, ticks: 'sent', ...extra });
    await wait(260, g);
    mutate((d) => {
      const m = d.data.conversation.messages.find((x) => x.id === id);
      if (m && m.ticks === 'sent') m.ticks = 'delivered';
    });
  };

  const addHandoff = (h: Omit<Handoff, 'id' | 'at' | 'status'>) => {
    const id = uid('h');
    mutate((d) => {
      d.data.handoffs.push({ id, at: Date.now(), status: 'Waiting', ...h });
    });
    traceEvent(`Handed to a person: ${h.reason}`, h.kind === 'critical' || h.urgent ? 'alert' : 'note');
    return id;
  };

  const callback = (reason: string) => {
    const report = currentReport();
    if (report) addHandoff({ reportId: report.id, kind: 'callback', reason });
  };

  // ---------- the send pipeline ----------

  interface DeliverOptions {
    replies?: ActionId[];
    kind?: ChatMessage['kind'];
    typingMs?: number;
    /** Update the Safety checks step of the current report run. */
    runStep?: boolean;
  }

  /**
   * Runs the output checks on one outgoing message. A failing message is never sent:
   * it is replaced by the safe handoff template and the trace turns red.
   */
  const deliver = async (g: number, msg: Message, opts: DeliverOptions = {}): Promise<boolean> => {
    const report = currentReport();
    const route = currentRoute();
    const outcome = runOutputChecks(msg, { report, route });
    let final = msg;

    mutate((d) => {
      d.data.trace.log.push({
        type: 'message',
        id: uid('tr'),
        at: Date.now(),
        templateId: msg.templateId ?? 'none',
        version: msg.version ?? null,
        checks: outcome.results,
        outcome: outcome.ok ? 'sent' : 'blocked',
        note: outcome.ok ? undefined : 'Blocked. The safe handoff message was sent instead.',
      });
    });

    if (!outcome.ok) {
      final = render(route === 'CRITICAL' ? 'SAFE-CRIT-01' : 'SAFE-01');
      const safe = runOutputChecks(final, { report, route });
      mutate((d) => {
        d.data.trace.log.push({ type: 'message', id: uid('tr'), at: Date.now(), templateId: final.templateId!, version: final.version!, checks: safe.results, outcome: 'sent' });
      });
      if (route !== 'CRITICAL') callback('A safety check blocked a message');
    }

    if (opts.runStep) {
      const prev = get().data.trace.steps.checks;
      setStep('checks', !outcome.ok || prev.status === 'fail' ? 'fail' : 'ok', [
        ...prev.detail,
        outcome.ok ? `${msg.templateId} passed every check` : `${msg.templateId ?? 'Unregistered message'} failed, safe message sent instead`,
      ]);
    }

    mutate((d) => {
      d.data.conversation.typing = true;
    });
    await wait(opts.typingMs ?? Math.min(1500, 450 + final.text.length * 3), g);
    mutate((d) => {
      d.data.conversation.typing = false;
      for (const m of d.data.conversation.messages) if (m.from === 'user') m.ticks = 'read';
      d.data.conversation.messages.push({
        id: uid('m'),
        at: Date.now(),
        from: 'bot',
        kind: opts.kind ?? 'text',
        text: final.text,
        templateId: final.templateId,
        version: final.version,
        replies: outcome.ok ? opts.replies : undefined,
      });
    });
    return outcome.ok;
  };

  // ---------- conversation start ----------

  const greet = () => {
    const msg = render('GREET-01');
    const checks = runOutputChecks(msg, {});
    mutate((d) => {
      d.data.conversation.messages.push({ id: uid('m'), at: Date.now(), from: 'bot', kind: 'text', text: msg.text, templateId: msg.templateId, version: msg.version });
      d.data.trace.log.push({ type: 'message', id: uid('tr'), at: Date.now(), templateId: msg.templateId!, version: msg.version!, checks: checks.results, outcome: 'sent' });
    });
  };

  const freshConversation = () => {
    mutate((d) => {
      d.data.conversation = emptyConversation();
      d.data.trace = emptyTrace();
    });
    greet();
  };

  /** The patient shares a document that is already on their phone. */
  const shareDoc = (reportId: string) => {
    const report = getReport(reportId);
    if (!report) return;
    gen += 1;
    freshConversation();
    mutate((d) => {
      d.ui.attachOpen = false;
      d.ui.page = 'try';
      d.data.conversation.pendingReportId = report.id;
      d.data.trace.reportId = report.visitId;
      d.data.trace.docTitle = report.title;
      d.data.trace.patientMasked = maskName(report.patient.name);
    });
    run(async (g) => {
      await wait(350, g);
      await userSays(g, '', { kind: 'doc', doc: report.file });
      setStep('consent', 'active', ['Waiting for the patient to say OK', 'Nothing is read before consent']);
      await deliver(g, render('CONSENT-01', { first_name: report.patient.firstName }), { replies: ['CONSENT_YES', 'CONSENT_NO'] });
    });
  };

  const readAndBrief = async (g: number, report: Report) => {
    // Read & check
    await deliver(g, render('READ-01'), { typingMs: 500 });
    setStep('read', 'active');
    await wait(800, g);
    const c = classify(report);
    const readDetail =
      report.kind !== 'lab'
        ? [`${report.file.name}`, 'Not a lab report']
        : c.counts.unreadable
          ? [`${report.file.name}`, `${c.counts.total - c.counts.unreadable} of ${c.counts.total} values read clearly`, 'One value is unclear: no guessing']
          : [`${report.file.name}`, `Lab report recognised · ${c.counts.total} values read clearly`];
    setStep('read', report.kind !== 'lab' || c.counts.unreadable ? 'note' : 'ok', readDetail);

    // Rules
    setStep('rules', 'active');
    await wait(700, g);
    const routeText: Record<Route, string> = {
      NORMAL: 'Everything in range → send the brief',
      ABNORMAL: 'Some values outside the range → brief with values and ranges, no interpretation',
      CRITICAL: 'A value beyond its critical limit → share nothing, a doctor calls first',
      HUMAN: 'A result the assistant must not explain → a person takes over',
      UNREADABLE: 'A value could not be read → ask for a clearer copy',
      UNSUPPORTED: 'Not a lab report → say so, explain what is possible',
    };
    mutate((d) => {
      d.data.conversation.route = c.route;
      d.data.conversation.reportId = report.id;
      d.data.conversation.pendingReportId = undefined;
      d.data.trace.route = c.route;
    });
    const tone: StepStatus = c.route === 'NORMAL' ? 'ok' : c.route === 'CRITICAL' ? 'alert' : 'note';
    setStep('rules', tone, [routeText[c.route], ...c.reasons.slice(0, 3), 'Decided by fixed rules, not by the AI']);

    // Brief
    setStep('brief', 'active');
    await wait(500, g);
    const msgs = explain(report, c.route);
    setStep('brief', 'ok', msgs.map((m) => `${m.templateId} · ${TEMPLATES[m.templateId!]?.purpose ?? ''}`));

    // Checks + send
    setStep('checks', 'active', []);
    const replies = briefReplies(report, c.route);
    let allOk = true;
    for (const [i, m] of msgs.entries()) {
      allOk = (await deliver(g, m, { runStep: true, replies: i === 0 && replies.length ? replies : undefined })) && allOk;
      await wait(250, g);
    }

    // Outcome
    if (c.route === 'CRITICAL') {
      const dueAt = Date.now() + SLA_MINUTES * 60_000;
      const hid = addHandoff({ reportId: report.id, kind: 'critical', reason: 'Critical value: call within 30 minutes', dueAt, summary: clinicianSummary(report) });
      mutate((d) => {
        d.data.conversation.handoffId = hid;
      });
      await deliver(g, render('CRIT-STATUS-01', { due_time: fmtTime(dueAt) }), { kind: 'status', typingMs: 400, replies: ['OPEN_HANDOFF'] });
      setStep('outcome', 'alert', ['Handed to a doctor', `Call due by ${fmtTime(dueAt)}`]);
    } else if (c.route === 'HUMAN') {
      callback('Report needs a person to explain it');
      setStep('outcome', 'note', ['Handed to a person', 'They already have the report']);
    } else if (c.route === 'UNREADABLE') {
      setStep('outcome', 'note', ['Asked for a clearer photo', 'No value was guessed']);
    } else if (c.route === 'UNSUPPORTED') {
      setStep('outcome', 'note', ['Explained what the assistant can do']);
    } else {
      setStep('outcome', allOk ? 'ok' : 'fail', allOk ? ['Brief sent', 'Suggested questions offered'] : ['Safe message sent instead']);
    }
    mutate((d) => {
      d.data.conversation.showSuggestions = c.route !== 'HUMAN';
    });
  };

  // ---------- answering an action (quick reply, suggestion, or typed question) ----------

  const respond = async (g: number, action: ActionId) => {
    const report = currentReport();
    const route = currentRoute();

    if (action.startsWith('WHAT_IS:')) {
      const msg = report && whatIs(report, action.slice(8));
      if (msg) await deliver(g, msg);
      return;
    }
    if (action.startsWith('BOOK_SLOT:')) {
      const slot = action.slice(10);
      await deliver(g, render('BOOKED-01', { slot }));
      push({ from: 'bot', kind: 'chip', text: `Doctor call booked · ${slot}` });
      traceEvent(`Next step taken: doctor call booked (${slot})`, 'info');
      return;
    }

    switch (action) {
      case 'EXPLAIN_MORE':
        if (report) await deliver(g, explainEach(report));
        break;
      case 'SERIOUS':
        if (report) await deliver(g, serious(report), { replies: ['BOOK', 'HUMAN'] });
        break;
      case 'TREND': {
        const msg = report && trend(report);
        if (msg) await deliver(g, msg);
        break;
      }
      case 'BOOK':
        await deliver(g, render('BOOK-01'), { replies: ['BOOK_SLOT:5:30 pm today', 'BOOK_TIMES', 'HUMAN'] });
        break;
      case 'BOOK_TIMES':
        await deliver(g, render('BOOK-TIMES-01'), { replies: ['BOOK_SLOT:6:15 pm today', 'BOOK_SLOT:10:00 am tomorrow'] });
        break;
      case 'SHARE':
        if (report) await deliver(g, shareSummary(report));
        break;
      case 'REMIND': {
        if (!report || !route) break;
        const { message, date } = reminder(report, route, Date.now());
        await deliver(g, message);
        push({ from: 'bot', kind: 'chip', text: `Reminder set · ${date}` });
        break;
      }
      case 'HUMAN':
        if (route === 'CRITICAL') {
          await deliver(g, render('CRIT-PRIORITY-01'));
        } else {
          callback('Patient asked to talk to a person');
          await deliver(g, render('HANDOFF-01'));
        }
        break;
      case 'UNWELL':
        traceEvent('Patient says they feel unwell → urgent reply first', 'alert');
        if (report) addHandoff({ reportId: report.id, kind: 'callback', urgent: true, reason: 'Patient feels unwell: call now' });
        await deliver(g, render('URGENT-01'));
        break;
      case 'GOT_IT':
        traceEvent('Patient marked the brief as understood', 'info');
        await deliver(g, render('THANKS-01'));
        break;
      case 'SCOPE':
        await deliver(g, render('SCOPE-01'));
        break;
      case 'DELETE':
        await deliver(g, render('DELETE-01'));
        traceEvent('Patient deleted the report: report and chat removed', 'note');
        await wait(1400, g);
        mutate((d) => {
          d.data.conversation = emptyConversation();
        });
        greet();
        push({ from: 'bot', kind: 'chip', text: 'Report and chat deleted' });
        break;
      case 'RESEND': {
        const retake = getReport(report?.retakeId);
        if (!retake) break;
        traceEvent('Patient sent a clearer photo', 'info');
        mutate((d) => {
          for (const k of ['read', 'rules', 'brief', 'checks', 'outcome'] as StepKey[]) d.data.trace.steps[k] = { status: 'idle', detail: [] };
          d.data.conversation.showSuggestions = false;
        });
        await userSays(g, '', { kind: 'doc', doc: retake.file });
        await readAndBrief(g, retake);
        break;
      }
    }
  };

  /** A quick reply under a message, or a suggested question above the message box. */
  const act = (action: ActionId, messageId?: string, typed?: string) => {
    const conv = get().data.conversation;
    if (action === 'OPEN_HANDOFF') {
      setPage('how');
      return;
    }
    if (conv.busy || conv.optedOut) return;
    mutate((d) => {
      const c = d.data.conversation;
      if (messageId) {
        const m = c.messages.find((x) => x.id === messageId);
        if (m) m.used = [...(m.used ?? []), action];
      }
      if (!c.usedSuggestions.includes(action)) c.usedSuggestions.push(action);
    });

    run(async (g) => {
      await userSays(g, typed ?? actionLabel(action, conv.route));
      await wait(250, g);

      if (action === 'CONSENT_YES' || action === 'CONSENT_NO') {
        const report = getReport(get().data.conversation.pendingReportId);
        if (!report) return;
        if (action === 'CONSENT_NO') {
          setStep('consent', 'skip', ['Patient said not now', 'The report was not read']);
          mutate((d) => {
            d.data.conversation.pendingReportId = undefined;
          });
          await deliver(g, render('CONSENT-NO-01'));
          return;
        }
        mutate((d) => {
          d.data.conversation.consentAt = Date.now();
        });
        setStep('consent', 'ok', [`Consent logged at ${fmtTime(Date.now())}`, 'Report auto-deletes after 30 days']);
        await readAndBrief(g, report);
        return;
      }
      await respond(g, action);
    });
  };

  /** Typed message. Emergency wording is checked before every other rule. */
  const sendText = (raw: string) => {
    const text = raw.trim();
    const conv = get().data.conversation;
    if (!text || conv.optedOut || conv.busy) return;

    // Awaiting consent: a plain "yes" or "no" answers it. Emergency wording and STOP still come first.
    if (conv.pendingReportId && !EMERGENCY_PATTERN.test(text) && !STOP_PATTERN.test(text)) {
      if (/^(yes|ok|okay|haan|ha|sure|continue)\b/i.test(text)) return act('CONSENT_YES', undefined, text);
      if (/^(no|not now|nahi|later)\b/i.test(text)) return act('CONSENT_NO', undefined, text);
    }

    run(async (g) => {
      await userSays(g, text);
      await wait(300, g);
      const c = get().data.conversation;
      const reached = get().data.handoffs.find((h) => h.id === c.handoffId)?.status === 'Reached';
      const decision = routeFreeText(text, { report: currentReport(), route: c.route, clinicianReached: reached });

      // Nothing is read, or answered, before consent. Only emergency wording and STOP get through.
      if (c.pendingReportId && decision.rule !== 'EMERGENCY' && decision.rule !== 'STOP') {
        await deliver(g, render('CONSENT-AGAIN-01'), { replies: ['CONSENT_YES', 'CONSENT_NO'] });
        return;
      }

      switch (decision.rule) {
        case 'EMERGENCY':
          traceEvent('Guardrail: emergency wording, checked before everything else', 'alert');
          {
            const who = currentReport() ?? getReport(c.pendingReportId);
            if (who) addHandoff({ reportId: who.id, kind: 'callback', urgent: true, reason: 'Emergency wording in chat: call now' });
          }
          await deliver(g, render('URGENT-01'));
          break;
        case 'STOP':
          traceEvent('Guardrail: STOP → opt-out recorded', 'note');
          await deliver(g, render('STOP-01'));
          mutate((d) => {
            d.data.conversation.optedOut = true;
            d.data.conversation.showSuggestions = false;
            d.data.conversation.pendingReportId = undefined;
          });
          break;
        case 'DELETE':
          await respond(g, 'DELETE');
          break;
        case 'NO_REPORT':
          await deliver(g, render('NOREPORT-01'));
          break;
        case 'CRITICAL_THREAD':
          traceEvent('Guardrail: critical path → results are not discussed in chat', 'alert');
          await deliver(g, render(reached ? 'CRIT-THREAD-02' : 'CRIT-THREAD-01'));
          break;
        case 'CLINICAL_QUESTION':
          traceEvent('Guardrail: medicine or diagnosis question → boundary + helpful next step', 'note');
          await deliver(g, render('REFUSE-01'), { replies: ['BOOK', 'HUMAN'] });
          break;
        case 'SERIOUS':
          await respond(g, 'SERIOUS');
          break;
        case 'ADVISOR':
          await respond(g, 'HUMAN');
          break;
        case 'BOOK':
          await respond(g, 'BOOK');
          break;
        case 'TREND':
          await respond(g, 'TREND');
          break;
        case 'WHAT_IS':
          traceEvent(`Answered from the approved library: ${decision.testCode}`, 'info');
          await respond(g, `WHAT_IS:${decision.testCode}`);
          break;
        case 'THANKS':
          await respond(g, 'GOT_IT');
          break;
        case 'OFF_TOPIC':
          traceEvent('Guardrail: not about the report → friendly redirect', 'info');
          await deliver(g, render('OFFTOPIC-01'));
          mutate((d) => {
            d.data.conversation.showSuggestions = true;
          });
          break;
      }
    });
  };

  // ---------- the person who takes over ----------

  const callHandoff = (id: string) =>
    mutate((d) => {
      const h = d.data.handoffs.find((x) => x.id === id);
      if (h && h.status === 'Waiting') h.status = 'Calling';
    });

  const markReached = (id: string) => {
    const h = get().data.handoffs.find((x) => x.id === id);
    if (!h || h.status === 'Reached') return;
    mutate((d) => {
      const x = d.data.handoffs.find((y) => y.id === id)!;
      x.status = 'Reached';
      x.reachedAt = Date.now();
    });
    traceEvent(`${h.kind === 'critical' ? 'Doctor' : 'Team member'} reached the patient`, 'info');
    if (h.kind === 'critical' && get().data.conversation.handoffId === id) {
      setStep('outcome', 'ok', ['Handed to a doctor', `Doctor reached the patient at ${fmtTime(Date.now())}`]);
      run(async (g) => {
        await deliver(g, render('CRIT-CLOSE-01'), { kind: 'status', typingMs: 300 });
      });
    }
  };

  // ---------- navigation ----------

  const setPage = (page: Page) =>
    mutate((d) => {
      d.ui.page = page;
      d.ui.attachOpen = false;
    });

  const setAttach = (open: boolean) =>
    mutate((d) => {
      d.ui.attachOpen = open;
    });

  const reset = () => {
    gen += 1;
    clearStorage();
    store.replace(initialState({ page: get().ui.page }));
    greet();
  };

  // A first-time load opens with the greeting.
  if (!get().data.conversation.messages.length) greet();

  return { shareDoc, act, sendText, callHandoff, markReached, setPage, setAttach, reset };
}
