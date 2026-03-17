import { App, TFile, normalizePath } from 'obsidian';
import { LLMProvider } from '../llm/LLMProvider';
import { LLMMessage, WriteHelperSettings } from '../types';

export class TagManager {
  constructor(
    private app: App,
    private settings: WriteHelperSettings,
    private llm: LLMProvider
  ) {}

  private get tagsPath(): string {
    return normalizePath(`${this.settings.rootFolder}/tags.md`);
  }

  async loadTags(): Promise<string[]> {
    const file = this.app.vault.getAbstractFileByPath(this.tagsPath);
    if (!(file instanceof TFile)) return [];
    const content = await this.app.vault.read(file);
    return content
      .split('\n')
      .filter(line => line.startsWith('- '))
      .map(line => line.slice(2).trim())
      .filter(t => t.length > 0);
  }

  async saveTags(tags: string[]): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const content = `---\nupdated: ${date}\n---\n\n${tags.map(t => `- ${t}`).join('\n')}\n`;
    const file = this.app.vault.getAbstractFileByPath(this.tagsPath);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      // 루트 폴더가 없으면 생성
      const rootFolder = this.app.vault.getAbstractFileByPath(this.settings.rootFolder);
      if (!rootFolder) {
        await this.app.vault.createFolder(this.settings.rootFolder);
      }
      await this.app.vault.create(this.tagsPath, content);
    }
  }

  async generateTags(noteContent: string): Promise<string[]> {
    const existingTags = await this.loadTags();
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          `${this.settings.tagPrompt}\n\n` +
          `기존 태그 목록 (가능하면 이 중에서 선택):\n${existingTags.map(t => `- ${t}`).join('\n') || '(없음)'}\n\n` +
          `기존 태그에 적절한 것이 없으면 여러 노트에서 재사용 가능한 새 태그를 추가하세요.\n` +
          `반드시 JSON 배열 형식으로만 응답하세요. 예: ["태그1", "태그2"]`,
      },
      {
        role: 'user',
        content: `다음 글에 적합한 태그를 생성해주세요:\n\n${noteContent}`,
      },
    ];

    const response = await this.llm.chat(messages);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('태그 응답 파싱 실패');

    const tags: string[] = JSON.parse(jsonMatch[0]);
    const newTags = tags.filter(t => !existingTags.includes(t));
    if (newTags.length > 0) {
      await this.saveTags([...existingTags, ...newTags]);
    }

    return tags;
  }
}
