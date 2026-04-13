import type { Person, Channel, Topic, TimelineEvent, Settings } from '@/types';

export const mockPeople: Person[] = [
  {
    id: 'p1',
    name: '张三',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zs',
    title: '产品经理',
    contact_type: 'person',
    tags: ['需求对接', '决策人'],
    knows: ['负责Q2产品规划', '关注用户体验', '周五前要给反馈'],
    lastTalk: '10:30',
    talkCount: 23,
    autoReply: false,
  },
  {
    id: 'p2',
    name: '李四',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ls',
    title: '技术负责人',
    contact_type: 'person',
    tags: ['技术评审', '架构'],
    knows: ['主推GraphQL方案', '关注性能指标', '周二有技术分享'],
    lastTalk: '昨天',
    talkCount: 45,
    autoReply: false,
  },
  {
    id: 'p3',
    name: '王五',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ww',
    title: '设计师',
    contact_type: 'person',
    tags: ['UI设计'],
    knows: ['负责新版视觉', '对细节要求高'],
    lastTalk: '周一',
    talkCount: 12,
    autoReply: false,
  },
];

export const mockChannels: Channel[] = [
  {
    id: 'c1',
    type: 'group',
    name: '产品技术群',
    members: 12,
    isMonitoring: true,
    lastActive: '刚刚',
    hasAlert: true,
    summary: '讨论迭代计划，需要你确认需求',
    autoReply: true,
  },
  {
    id: 'c2',
    type: 'person',
    name: '张三',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=zs',
    isMonitoring: true,
    lastActive: '10分钟前',
    hasAlert: true,
    summary: '询问文档反馈时间',
    autoReply: true,
  },
  {
    id: 'c3',
    type: 'person',
    name: '李四',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ls',
    isMonitoring: true,
    lastActive: '1小时前',
    hasAlert: false,
    summary: '技术方案已确认',
    autoReply: true,
  },
];

export const mockTopics: Topic[] = [
  { id: '1', topic_id: 'topic1', name: 'Q2产品迭代', color: '0', visible: true },
  { id: '2', topic_id: 'topic2', name: '技术方案', color: '1', visible: true },
  { id: '3', topic_id: 'topic3', name: '设计相关', color: '2', visible: true },
];

export const mockTimelineEvents: TimelineEvent[] = [
  {
    id: 'e1',
    title: '需求文档反馈',
    summary: '询问需求文档反馈时间',
    topics: ['topic1'],
    occurred_at: new Date().toISOString(),
    source_contact_id: 'p1',
  },
  {
    id: 'e2',
    title: '迭代计划讨论',
    summary: '迭代计划讨论，等你确认',
    topics: ['topic1'],
    occurred_at: new Date(Date.now() - 3600000).toISOString(),
    source_chat_id: 'c1',
  },
  {
    id: 'e3',
    title: '技术评审会议',
    summary: '技术评审会议安排在下午3点',
    topics: ['topic2'],
    occurred_at: new Date(Date.now() - 7200000).toISOString(),
    source_contact_id: 'p2',
  },
  {
    id: 'e4',
    title: '设计稿上传',
    summary: '新版首页设计稿已上传',
    topics: ['topic3'],
    occurred_at: new Date(Date.now() - 86400000).toISOString(),
    source_chat_id: 'c1',
  },
];

export const mockSettings: Settings = {
  openaiKey: '',
  openaiUrl: 'https://api.openai.com/v1',
  kimiCommand: '请帮我分析这段对话的重点',
  autoReplyEnabled: true,
  modelId: 'step-3.5-flash-2603',
};
