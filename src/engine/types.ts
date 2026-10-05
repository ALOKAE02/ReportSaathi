export type MessageKind = 'explanation' | 'handoff' | 'critical' | 'status' | 'system'

export interface QuickReplyDef {
  id: string
  label: string
}

export interface Message {
  templateId: string
  version: string
  kind: MessageKind
  text: string
  quickReplies?: QuickReplyDef[]
  chip?: string
  attachment?: string
}
