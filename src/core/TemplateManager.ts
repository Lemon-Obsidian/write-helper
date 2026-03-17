import { App, TFile, TFolder, normalizePath, parseYaml, stringifyYaml } from 'obsidian';
import { Template } from '../types';

export class TemplateManager {
  constructor(private app: App, private rootFolder: string) {}

  get templatesPath(): string {
    return normalizePath(`${this.rootFolder}/templates`);
  }

  async ensureFolders(): Promise<void> {
    if (!this.app.vault.getAbstractFileByPath(this.rootFolder)) {
      await this.app.vault.createFolder(this.rootFolder);
    }
    if (!this.app.vault.getAbstractFileByPath(this.templatesPath)) {
      await this.app.vault.createFolder(this.templatesPath);
    }
  }

  async loadAll(): Promise<{ filename: string; template: Template }[]> {
    const folder = this.app.vault.getAbstractFileByPath(this.templatesPath);
    if (!(folder instanceof TFolder)) return [];

    const results: { filename: string; template: Template }[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === 'yaml') {
        try {
          const content = await this.app.vault.read(child);
          const template = parseYaml(content) as Template;
          results.push({ filename: child.name, template });
        } catch (e) {
          console.error(`템플릿 파싱 오류: ${child.name}`, e);
        }
      }
    }
    return results;
  }

  async load(filename: string): Promise<Template | null> {
    const path = normalizePath(`${this.templatesPath}/${filename}`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const content = await this.app.vault.read(file);
    return parseYaml(content) as Template;
  }

  async save(filename: string, template: Template): Promise<void> {
    await this.ensureFolders();
    const path = normalizePath(`${this.templatesPath}/${filename}`);
    const content = stringifyYaml(template as Record<string, unknown>);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  async delete(filename: string): Promise<void> {
    const path = normalizePath(`${this.templatesPath}/${filename}`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.trash(file, true);
    }
  }

  generateFilename(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') + '.yaml'
    );
  }
}
