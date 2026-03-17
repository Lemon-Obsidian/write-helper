import { App, Modal, Notice, TFile, normalizePath } from 'obsidian';
import { FormTemplate, FormField, WriteHelperSettings, LLMMessage } from '../types';
import { LLMProvider } from '../llm/LLMProvider';
import { TagManager } from '../core/TagManager';

export class FormFillModal extends Modal {
  private values: Record<string, string> = {};
  private processedValues: Record<string, string> = {};
  private previewContent = '';

  constructor(
    app: App,
    private template: FormTemplate,
    private settings: WriteHelperSettings,
    private llm: LLMProvider,
    private tagManager: TagManager,
    private outputFolder: string
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(`새 노트: ${this.template.name}`);
    this.modalEl.addClass('wh-form-modal');
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    const form = contentEl.createDiv('wh-form');
    this.template.fields.forEach(field => this.renderField(form, field));

    // 미리보기 영역
    const previewSection = contentEl.createDiv('wh-preview-section');
    previewSection.createEl('h5', { text: '미리보기' });
    const previewContent = previewSection.createDiv('wh-preview-content');

    if (this.previewContent) {
      previewContent.createEl('pre', { text: this.previewContent, cls: 'wh-preview-text' });

      // 재생성 입력
      const refineRow = previewSection.createDiv('wh-refine-row');
      const refineInput = refineRow.createEl('input', {
        type: 'text',
        placeholder: '추가 요청 (예: 더 간결하게, 공식적인 톤으로)',
        cls: 'wh-input',
      });
      const refineBtn = refineRow.createEl('button', { text: '재생성', cls: 'wh-btn' });
      refineBtn.onclick = async () => {
        refineBtn.disabled = true;
        await this.generatePreview(refineInput.value.trim() || undefined);
        refineBtn.disabled = false;
      };
    } else {
      previewContent.createDiv({ text: '아직 미리보기가 없습니다.', cls: 'wh-empty' });
    }

    // 하단 버튼
    const footer = contentEl.createDiv('wh-modal-footer');
    const previewBtn = footer.createEl('button', { text: '미리보기 생성', cls: 'wh-btn' });
    previewBtn.onclick = async () => {
      previewBtn.disabled = true;
      previewBtn.setText('생성 중...');
      await this.generatePreview();
      previewBtn.disabled = false;
      previewBtn.setText('미리보기 생성');
    };

    const saveBtn = footer.createEl('button', { text: '저장', cls: 'wh-btn wh-btn-primary' });
    saveBtn.disabled = !this.previewContent;
    saveBtn.onclick = () => this.save();
  }

  private renderField(container: HTMLElement, field: FormField): void {
    const row = container.createDiv('wh-field-row');

    const labelRow = row.createDiv('wh-field-label-row');
    const label = labelRow.createEl('label');
    label.createSpan({ text: field.title });
    if (field.required) label.createSpan({ text: ' *', cls: 'wh-required' });
    if (field.description) {
      labelRow.createDiv({ text: field.description, cls: 'wh-field-desc' });
    }

    const inputArea = row.createDiv('wh-field-input-area');
    let inputEl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    if (field.type === 'multiline') {
      inputEl = inputArea.createEl('textarea', { cls: 'wh-input wh-textarea' });
    } else if (field.type === 'select') {
      const sel = inputArea.createEl('select', { cls: 'wh-input' });
      sel.createEl('option', { value: '', text: '선택...' });
      (field.options ?? []).forEach(opt => sel.createEl('option', { value: opt, text: opt }));
      inputEl = sel;
    } else {
      inputEl = inputArea.createEl('input', {
        type: field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text',
        cls: 'wh-input',
      });
    }

    inputEl.value = this.values[field.id] ?? '';
    inputEl.onchange = () => { this.values[field.id] = inputEl.value; };

    // LLM 처리 버튼
    if (field.llm_prompt) {
      const llmRow = inputArea.createDiv('wh-llm-row');
      const processBtn = llmRow.createEl('button', { text: '🤖 LLM 처리', cls: 'wh-btn wh-btn-sm' });
      const retryBtn = llmRow.createEl('button', { text: '재시도', cls: 'wh-btn wh-btn-sm' });
      const resultEl = llmRow.createDiv('wh-llm-result');

      if (this.processedValues[field.id]) {
        resultEl.createEl('pre', { text: this.processedValues[field.id], cls: 'wh-preview-text' });
      }

      const doProcess = async () => {
        const raw = (inputEl as HTMLInputElement | HTMLTextAreaElement).value.trim();
        if (!raw) {
          new Notice('내용을 먼저 입력해주세요.');
          return;
        }
        processBtn.disabled = true;
        retryBtn.disabled = true;
        processBtn.setText('처리 중...');
        try {
          const messages: LLMMessage[] = [
            { role: 'system', content: field.llm_prompt! },
            { role: 'user', content: raw },
          ];
          const result = await this.llm.chat(messages);
          this.processedValues[field.id] = result;
          resultEl.empty();
          resultEl.createEl('pre', { text: result, cls: 'wh-preview-text' });
        } catch {
          new Notice('LLM 처리 실패. 재시도 버튼을 눌러주세요.');
        } finally {
          processBtn.disabled = false;
          retryBtn.disabled = false;
          processBtn.setText('🤖 LLM 처리');
        }
      };

      processBtn.onclick = doProcess;
      retryBtn.onclick = doProcess;
    }
  }

  private async generatePreview(extraPrompt?: string): Promise<void> {
    const fieldContents: string[] = [];
    for (const field of this.template.fields) {
      const value = this.processedValues[field.id] ?? this.values[field.id] ?? '';
      if (!field.required && !value) continue;
      fieldContents.push(`## ${field.title}\n${value || '(미입력)'}`);
    }

    let bodyContent = fieldContents.join('\n\n');

    if (extraPrompt) {
      try {
        const messages: LLMMessage[] = [
          { role: 'system', content: '사용자의 요청에 따라 아래 글을 수정해주세요.' },
          { role: 'user', content: `요청: ${extraPrompt}\n\n---\n${bodyContent}` },
        ];
        bodyContent = await this.llm.chat(messages);
      } catch {
        new Notice('LLM 호출 실패. 다시 시도해주세요.');
        return;
      }
    }

    this.previewContent = `# ${this.template.name}\n\n${bodyContent}`;
    this.render();
  }

  private async save(): Promise<void> {
    for (const field of this.template.fields) {
      if (field.required && !this.values[field.id]) {
        new Notice(`필수 필드를 입력해주세요: ${field.title}`);
        return;
      }
    }

    let tags: string[] = [];
    try {
      tags = await this.tagManager.generateTags(this.previewContent);
    } catch {
      new Notice('태그 생성 실패. 태그 없이 저장합니다.');
    }

    const date = new Date().toISOString().split('T')[0];
    const fieldData: Record<string, string> = {};
    this.template.fields.forEach(f => {
      fieldData[f.id] = this.processedValues[f.id] ?? this.values[f.id] ?? '';
    });

    const frontmatter = [
      '---',
      `template: ${this.template.name}`,
      `date: ${date}`,
      `tags:`,
      ...tags.map(t => `  - ${t}`),
      `fields:`,
      ...Object.entries(fieldData).map(
        ([k, v]) => `  ${k}: "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
      ),
      '---',
    ].join('\n');

    const fullContent = `${frontmatter}\n\n${this.previewContent}`;
    const filename = `${this.template.name}-${date}-${Date.now()}.md`;
    const filePath = normalizePath(`${this.outputFolder}/${filename}`);

    try {
      await this.app.vault.create(filePath, fullContent);
      new Notice(`노트가 저장되었습니다: ${filename}`);
      this.close();
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf().openFile(file);
      }
    } catch {
      new Notice('파일 저장 실패.');
    }
  }
}
