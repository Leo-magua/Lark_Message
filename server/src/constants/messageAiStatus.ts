/** 与表 `messages.ai_analysis_status` 取值一致（SQLite TEXT） */
export const MESSAGE_AI_STATUS = {
  UNPROCESSED: 'unprocessed',
  CONTACT_ANALYZED: 'contact_analyzed',
  GLOBAL_ANALYZED: 'global_analyzed',
} as const;

export type MessageAiAnalysisStatus =
  (typeof MESSAGE_AI_STATUS)[keyof typeof MESSAGE_AI_STATUS];

/** 前端/接口展示用中文（暂定三种） */
export const MESSAGE_AI_STATUS_LABEL_ZH: Record<MessageAiAnalysisStatus, string> = {
  [MESSAGE_AI_STATUS.UNPROCESSED]: '未处理',
  [MESSAGE_AI_STATUS.CONTACT_ANALYZED]: '单对话中已处理',
  [MESSAGE_AI_STATUS.GLOBAL_ANALYZED]: '全局已处理',
};

export function normalizeMessageAiStatus(raw: string | null | undefined): MessageAiAnalysisStatus {
  if (raw === MESSAGE_AI_STATUS.CONTACT_ANALYZED || raw === MESSAGE_AI_STATUS.GLOBAL_ANALYZED) return raw;
  return MESSAGE_AI_STATUS.UNPROCESSED;
}

export function labelMessageAiStatusZh(raw: string | null | undefined): string {
  const s = normalizeMessageAiStatus(raw);
  return MESSAGE_AI_STATUS_LABEL_ZH[s];
}
