# LarkMessage

飞书消息管理工具 — 基于 lark-cli 的本地消息监控、AI 事件分析和时间轴展示系统。

## 架构

- **前端**：React 19 + Vite + Tailwind CSS + Radix UI（`app/`）
- **后端**：Express + Node.js 22 内置 SQLite（`server/`）
- **数据获取**：lark-cli 命令行工具

## 启动

```bash
# 后端
cd server
npm run dev    # 默认监听 http://localhost:8001（可用环境变量 PORT 覆盖）

# 前端（新开终端）
cd app
npm run dev    # 监听 http://localhost:5173
```

## 功能

### 通讯录
- 点击加号搜索飞书联系人或群聊（按类型区分）
- 添加到通讯录后持久化到本地 SQLite
- 点击卡片查看最近消息摘要，支持同步消息和 AI 分析

### 时间轴
- 同步消息后点击「AI 分析」自动识别事件和主题
- 点击主题过滤关联事件
- 支持手动添加主题和事件

### 状态监控
- 后台消息同步（可选）：在「设置」中开启并设定间隔后，会按间隔自动同步「通讯录已添加」的联系人/群聊最新消息（不会扫全量飞书联系人）
- 自动回复：在通讯录/自动回复配置里按会话开启后，后台同步结束会触发检查；同一会话约 5 分钟冷却

### 设置
- 配置兼容 OpenAI API 的接口地址、API Key、模型名称
- 配置后台消息同步开关与间隔、消息同步默认值（条数/模式/全量上限）

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/contacts | 获取通讯录 |
| GET | /api/contacts/search | 搜索飞书用户/群聊 |
| POST | /api/contacts/add | 添加到通讯录 |
| GET | /api/contacts/:id/summary | 获取联系人最近消息摘要 |
| POST | /api/messages/sync-contact/:id | 同步联系人消息 |
| POST | /api/ai/analyze/:id | AI 分析单个联系人 |
| POST | /api/ai/analyze-all | 批量 AI 分析 |
| GET | /api/timeline | 获取时间轴数据 |
| GET/PUT | /api/settings | 读写设置 |
| GET | /api/monitor/status | 轮询监控状态 |
| POST | /api/auto-reply/trigger | 手动触发自动回复检查 |

