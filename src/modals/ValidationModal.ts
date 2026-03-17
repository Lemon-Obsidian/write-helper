import { App, Modal, Notice, TFile, TFolder, normalizePath, parseYaml } from 'obsidian';
import { FormTemplate, FileValidationResult, ValidationIssue, LLMMessage } from '../types';
import { TemplateManager } from '../core/TemplateManager';
import { LLMProvider } from '../llm/LLMProvider';

type Phase = 'config' | 'results' | 'detail';

export class ValidationModal extends Modal {
  private templates: { filename: string; template: FormTemplate }[] = [];
  private selectedTemplate: { filename: string; template: FormTemplate } | null = null;
  private folderPath = '';
  private recursive = false;
  private useLLM = false;
  private results: FileValidationResult[] = [];
  private currentIndex = 0;
  private editContent = '';
  private phase: Phase = 'config';

  constructor(
    app: App,
    private templateManager: TemplateManager,
    private llm: LLMProvider
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.titleEl.setText('파일 교정');
    this.modalEl.addClass('wh-validation-modal');
    const all = await this.templateManager.loadAll();
    this.templates = all.filter(t => t.template.type === 'form') as {
      filename: string;
      template: FormTemplate;
    }[];
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    if (this.phase === 'config') this.renderConfig();
    else if (this.phase === 'results') this.renderResults();
    else this.renderDetail().catch(console.error);
  }

  private renderConfig(): void {
    const { contentEl } = this;

    const row1 = contentEl.createDiv('wh-form-row');
    row1.createEl('label', { text: '템플릿 선택' });
    const sel = row1.createEl('select', { cls: 'wh-input' });
    sel.createEl('option', { value: '', text: '선택...' });
    this.templates.forEach(t => sel.createEl('option', { value: t.filename, text: t.template.name }));
    sel.onchange = () => {
      this.selectedTemplate = this.templates.find(t => t.filename === sel.value) ?? null;
    };

    const row2 = contentEl.createDiv('wh-form-row');
    row2.createEl('label', { text: '폴더 경로' });
    const folderInput = row2.createEl('input', {
      type: 'text',
      placeholder: 'vault 내 폴더 경로 (예: Notes/Diary)',
      cls: 'wh-input',
    });
    folderInput.onchange = () => { this.folderPath = folderInput.value; };

    const row3 = contentEl.createDiv('wh-form-row');
    const recLabel = row3.createEl('label', { cls: 'wh-checkbox-label' });
    const recCheck = recLabel.createEl('input', { type: 'checkbox' });
    recCheck.onchange = () => { this.recursive = recCheck.checked; };
    recLabel.appendText(' 하위 폴더 포함 (재귀)');

    const row4 = contentEl.createDiv('wh-form-row');
    const llmLabel = row4.createEl('label', { cls: 'wh-checkbox-label' });
    const llmCheck = llmLabel.createEl('input', { type: 'checkbox' });
    llmCheck.onchange = () => { this.useLLM = llmCheck.checked; };
    llmLabel.appendText(' LLM 자동 채우기 사용');

    const footer = contentEl.createDiv('wh-modal-footer');
    const startBtn = footer.createEl('button', { text: '검사 시작', cls: 'wh-btn wh-btn-primary' });
    startBtn.onclick = async () => {
      if (!this.selectedTemplate) { new Notice('템플릿을 선택해주세요.'); return; }
      if (!this.folderPath.trim()) { new Notice('폴더 경로를 입력해주세요.'); return; }
      startBtn.disabled = true;
      startBtn.setText('검사 중...');
      await this.runValidation();
      startBtn.disabled = false;
      startBtn.setText('검사 시작');
    };
  }

  private async runValidation(): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.folderPath));
    if (!(folder instanceof TFolder)) {
      new Notice('폴더를 찾을 수 없습니다.');
      return;
    }

    const files = this.collectFiles(folder);
    this.results = [];
    for (const file of files) {
      const issues = await this.validateFile(file);
      if (issues.length > 0) {
        this.results.push({ filePath: file.path, issues });
      }
    }

    this.currentIndex = 0;
    this.phase = 'results';
    this.render();
  }

  private collectFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === 'md') {
        files.push(child);
      } else if (child instanceof TFolder && this.recursive) {
        files.push(...this.collectFiles(child));
      }
    }
    return files;
  }

  private async validateFile(file: TFile): Promise<ValidationIssue[]> {
    const content = await this.app.vault.read(file);
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!fmMatch) {
      return this.selectedTemplate!.template.fields
        .filter(f => f.required)
        .map(f => ({
          fieldId: f.id,
          fieldTitle: f.title,
          type: 'missing' as const,
          message: `필수 필드 누락: ${f.title}`,
        }));
    }

    const fm = parseYaml(fmMatch[1]) as Record<string, unknown>;
    const fields = (fm.fields as Record<string, unknown>) ?? {};
    const issues: ValidationIssue[] = [];

    for (const field of this.selectedTemplate!.template.fields) {
      if (field.required && !fields[field.id]) {
        issues.push({
          fieldId: field.id,
          fieldTitle: field.title,
          type: 'missing',
          message: `필수 필드 누락: ${field.title}`,
        });
      }
    }
    return issues;
  }

  private renderResults(): void {
    const { contentEl } = this;

    if (this.results.length === 0) {
      contentEl.createDiv({ text: '✅ 모든 파일이 정상입니다.', cls: 'wh-success' });
      const footer = contentEl.createDiv('wh-modal-footer');
      footer.createEl('button', { text: '닫기', cls: 'wh-btn' }).onclick = () => this.close();
      return;
    }

    contentEl.createEl('h5', { text: `${this.results.length}개 파일에서 문제 발견` });
    const list = contentEl.createDiv('wh-result-list');

    this.results.forEach((result, idx) => {
      const item = list.createDiv('wh-result-item');
      item.createDiv({ text: result.filePath, cls: 'wh-result-path' });
      item.createDiv({ text: `${result.issues.length}개 문제`, cls: 'wh-result-count' });
      item.onclick = () => {
        this.currentIndex = idx;
        this.editContent = '';
        this.phase = 'detail';
        this.render();
      };
    });
  }

  private async renderDetail(): Promise<void> {
    const { contentEl } = this;
    const result = this.results[this.currentIndex];

    // 내비게이션
    const nav = contentEl.createDiv('wh-nav');
    const prevBtn = nav.createEl('button', { text: '← 이전', cls: 'wh-btn' });
    prevBtn.disabled = this.currentIndex === 0;
    prevBtn.onclick = () => { this.currentIndex--; this.editContent = ''; this.render(); };
    nav.createDiv({ text: `${this.currentIndex + 1} / ${this.results.length}`, cls: 'wh-nav-count' });
    const nextBtn = nav.createEl('button', { text: '다음 →', cls: 'wh-btn' });
    nextBtn.disabled = this.currentIndex === this.results.length - 1;
    nextBtn.onclick = () => { this.currentIndex++; this.editContent = ''; this.render(); };

    contentEl.createDiv({ text: result.filePath, cls: 'wh-file-path' });

    // 문제 목록
    const issueList = contentEl.createDiv('wh-issue-list');
    issueList.createEl('h6', { text: '문제 목록' });
    result.issues.forEach(issue => {
      issueList.createDiv({ text: `⚠️ ${issue.message}`, cls: 'wh-issue-item' });
    });

    // 에디터
    const file = this.app.vault.getAbstractFileByPath(result.filePath);
    if (!this.editContent && file instanceof TFile) {
      this.editContent = await this.app.vault.read(file);
    }

    const editorArea = contentEl.createDiv('wh-editor-area');

    if (this.useLLM) {
      const llmBtn = editorArea.createEl('button', { text: '🤖 LLM 자동 채우기', cls: 'wh-btn' });
      llmBtn.onclick = async () => {
        llmBtn.disabled = true;
        llmBtn.setText('처리 중...');
        try {
          const suggested = await this.generateLLMFix(result);
          this.editContent = suggested;
          this.render();
        } catch {
          new Notice('LLM 처리 실패. 다시 시도해주세요.');
        } finally {
          llmBtn.disabled = false;
          llmBtn.setText('🤖 LLM 자동 채우기');
        }
      };
    }

    const editor = editorArea.createEl('textarea', { cls: 'wh-input wh-editor-textarea' });
    editor.value = this.editContent;
    editor.oninput = () => { this.editContent = editor.value; };

    // 하단 버튼
    const footer = contentEl.createDiv('wh-modal-footer');
    const backBtn = footer.createEl('button', { text: '목록으로', cls: 'wh-btn' });
    backBtn.onclick = () => { this.phase = 'results'; this.editContent = ''; this.render(); };

    const saveBtn = footer.createEl('button', { text: '저장', cls: 'wh-btn wh-btn-primary' });
    saveBtn.onclick = async () => {
      if (!(file instanceof TFile)) return;
      await this.app.vault.modify(file, editor.value);
      new Notice('저장되었습니다.');
      const newIssues = await this.validateFile(file);
      this.results[this.currentIndex].issues = newIssues;
      this.editContent = '';
      if (newIssues.length === 0) {
        this.results.splice(this.currentIndex, 1);
        if (this.results.length === 0) {
          this.phase = 'results';
        } else {
          this.currentIndex = Math.min(this.currentIndex, this.results.length - 1);
        }
      }
      this.render();
    };
  }

  private async generateLLMFix(result: FileValidationResult): Promise<string> {
    const template = this.selectedTemplate!.template;
    const missingFields = result.issues
      .filter(i => i.type === 'missing')
      .map(i => template.fields.find(f => f.id === i.fieldId))
      .filter(Boolean);

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          `다음 마크다운 파일에 누락된 frontmatter 필드를 채워주세요.\n` +
          `누락된 필드:\n${missingFields.map(f => `- ${f!.title} (${f!.type})`).join('\n')}\n` +
          `파일 내용을 분석하여 적절한 값을 생성하고, 수정된 파일 전체를 반환하세요.`,
      },
      { role: 'user', content: this.editContent },
    ];
    return await this.llm.chat(messages);
  }
}
