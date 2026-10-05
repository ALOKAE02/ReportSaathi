// Registry of every outgoing assistant template. A message with no registered template cannot be sent.
export type SignOff = 'demo-pending'

export interface Template {
  id: string
  version: string
  name: string
  signOff: SignOff
}

export const SIGNOFF_LABEL = 'Medical director sign-off: demo, pending'

const t = (id: string, name: string): Template => ({ id, version: '1.0', name, signOff: 'demo-pending' })

export const TEMPLATES: Template[] = [
  t('CONSENT-01', 'Consent line'),
  t('VERIFY-01', 'Verification prompt'),
  t('NORM-01', 'Normal report explanation'),
  t('OOR-01', 'Out-of-range summary'),
  t('OOR-02', 'Out-of-range details'),
  t('CRIT-01', 'Critical escalation'),
  t('CRIT-02', 'Critical status bubble'),
  t('CRIT-03', 'Critical closing message'),
  t('CRIT-04', 'Critical thread reply'),
  t('HUMAN-01', 'Unclear results handoff'),
  t('HANDOFF-01', 'Safe handoff (blocked or paused)'),
  t('REFUSE-01', 'Diagnosis and medicine refusal'),
  t('URGENT-01', 'Emergency wording reply'),
  t('FALLBACK-01', 'Gentle fallback'),
  t('ADV-01', 'Advisor callback confirmation'),
  t('REM-01', 'Reminder: repeat test'),
  t('REM-02', 'Reminder: yearly check-up'),
  t('DOC-01', 'Signed report delivery'),
  t('FB-01', 'Feedback thanks'),
  t('FB-02', 'Not helpful, advisor will call'),
  t('STOP-01', 'Opt-out confirmation'),
  t('CORR-01', 'Report correction'),
]

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((x) => x.id === id)
}

// The dashboard switches act on these two. OOR-02 follows OOR-01.
export const EXPLANATION_TEMPLATE_IDS = ['NORM-01', 'OOR-01']
