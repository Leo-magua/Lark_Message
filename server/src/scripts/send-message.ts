import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const IS_WIN = process.platform === 'win32';
const LARK_CLI = IS_WIN
  ? String.raw`C:\Users\74116\AppData\Roaming\npm\lark-cli.cmd`
  : 'lark-cli';

const [,, chatId, ...textParts] = process.argv;
const text = textParts.join(' ');

if (!chatId || !text) {
  console.error('Usage: tsx src/scripts/send-message.ts <chat_id> <message text>');
  process.exit(1);
}

(async () => {
  try {
    const { stdout } = await execFileAsync(LARK_CLI, [
      'im', '+send-message',
      '--chat-id', chatId,
      '--msg-type', 'text',
      '--content', JSON.stringify({ text }),
      '--format', 'json',
      '--as', 'user',
    ], { shell: IS_WIN, timeout: 15000 });

    const result = JSON.parse(stdout) as { ok: boolean; data?: { message_id: string } };
    if (result.ok) {
      console.log(`Message sent! ID: ${result.data?.message_id}`);
    } else {
      console.error('Failed:', result);
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
