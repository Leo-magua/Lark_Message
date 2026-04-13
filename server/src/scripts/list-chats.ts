import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const LARK_CLI = IS_WIN
  ? String.raw`C:\Users\74116\AppData\Roaming\npm\lark-cli.cmd`
  : 'lark-cli';

async function runLarkCli(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync(LARK_CLI, args, {
    timeout: 30_000, maxBuffer: 10 * 1024 * 1024, shell: IS_WIN,
  });
  return JSON.parse(stdout);
}

(async () => {
  console.log('正在从飞书获取群列表...\n');
  try {
    const result = await runLarkCli(['im', 'chats', 'list', '--format', 'json', '--page-all', '--as', 'user']) as {
      ok: boolean;
      data: { items: Array<{ chat_id: string; name: string; chat_type: string }> };
    };
    const items = result.data?.items ?? [];
    if (!items.length) {
      console.log('没有找到任何群。请确认 lark-cli 已登录。');
      process.exit(0);
    }
    console.log(`共找到 ${items.length} 个会话:\n`);
    for (const chat of items) {
      const type = chat.chat_type === 'p2p' ? '私聊  ' : '群聊  ';
      console.log(`${type} | ${(chat.name ?? '未命名').padEnd(30)} | ${chat.chat_id}`);
    }
    console.log('\n提示: 使用 chat_id 来发送消息或配置监控');
  } catch (err) {
    console.error('错误:', err);
    console.error('\n请确认 lark-cli 已安装并完成登录。');
    process.exit(1);
  }
})();
