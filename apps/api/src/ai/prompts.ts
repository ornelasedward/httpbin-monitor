import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), 'prompts');

export function loadPrompt(name: 'chat-system' | 'incident-system'): string {
  return readFileSync(join(promptsDir, `${name}.md`), 'utf8');
}
