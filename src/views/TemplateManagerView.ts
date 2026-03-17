import { App, ItemView, WorkspaceLeaf, Modal, Notice } from 'obsidian';
import { TemplateManager } from '../core/TemplateManager';
import { Template, FormTemplate, LLMTemplate, FormField } from '../types';

export const TEMPLATE_MANAGER_VIEW_TYPE = 'write-helper-template-manager';

export class TemplateManagerView extends ItemView {
  private templates: { filename: string; template: Template }[] = [];

  constructor(leaf: WorkspaceLeaf, private templateManager: TemplateManager) {
    super(leaf);
  }

  getViewType(): string {
    return TEMPLATE_MANAGER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '템플릿 관리';
  }

  getIcon(): string {
    return 'layout-template';
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.templates = await this.templateManager.loadAll();
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    const wrapper = container.createDiv('wh-template-manager');

    const header = wrapper.createDiv('wh-header');
    header.createEl('h4', { text: '템플릿 목록' });
    const addBtn = header.createEl('button', { text: '+ 새 템플릿', cls: 'wh-btn' });
    addBtn.onclick = () => this.openEditor(null);

    const list = wrapper.createDiv('wh-template-list');
    if (this.templates.length === 0) {
      list.createDiv({ text: '템플릿이 없습니다.', cls: 'wh-empty' });
      return;
    }

    this.templates.forEach(({ filename, template }) => {
      const item = list.createDiv('wh-template-item');
      const info = item.createDiv('wh-template-info');
      info.createDiv({ text: template.name, cls: 'wh-template-name' });
      info.createDiv({
        text: template.type === 'form' ? '📋 폼 기반' : '🤖 LLM 기반',
        cls: 'wh-template-type',
      });
      const actions = item.createDiv('wh-template-actions');
      const editBtn = actions.createEl('button', { text: '편집', cls: 'wh-btn wh-btn-sm' });
      editBtn.onclick = () => this.openEditor({ filename, template });
      const deleteBtn = actions.createEl('button', { text: '삭제', cls: 'wh-btn wh-btn-danger wh-btn-sm' });
      deleteBtn.onclick = async () => {
        if (!confirm(`"${template.name}" 템플릿을 삭제할까요?`)) return;
        await this.templateManager.delete(filename);
        await this.refresh();
      };
    });
  }

  private openEditor(target: { filename: string; template: Template } | null): void {
    new TemplateEditorModal(this.app, this.templateManager, target, () => this.refresh()).open();
  }
}

export class TemplateEditorModal extends Modal {
  private template: Template;
  private filename: string;

  constructor(
    app: App,
    private templateManager: TemplateManager,
    private target: { filename: string; template: Template } | null,
    private onSave: () => void
  ) {
    super(app);
    if (target) {
      this.template = JSON.parse(JSON.stringify(target.template));
      this.filename = target.filename;
    } else {
      this.template = { name: '', type: 'form', fields: [] } as FormTemplate;
      this.filename = '';
    }
  }

  onOpen(): void {
    this.titleEl.setText(this.target ? '템플릿 편집' : '새 템플릿');
    this.modalEl.addClass('wh-template-editor-modal');
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    // 템플릿 이름
    const nameRow = contentEl.createDiv('wh-form-row');
    nameRow.createEl('label', { text: '템플릿 이름' });
    const nameInput = nameRow.createEl('input', {
      type: 'text',
      value: this.template.name,
      cls: 'wh-input',
    });
    nameInput.onchange = () => { this.template.name = nameInput.value; };

    // 유형 선택
    const typeRow = contentEl.createDiv('wh-form-row');
    typeRow.createEl('label', { text: '유형' });
    const typeSelect = typeRow.createEl('select', { cls: 'wh-input' });
    [
      { value: 'form', label: '📋 폼 기반' },
      { value: 'llm', label: '🤖 LLM 기반' },
    ].forEach(opt => {
      const option = typeSelect.createEl('option', { value: opt.value, text: opt.label });
      if (this.template.type === opt.value) option.selected = true;
    });
    typeSelect.onchange = () => {
      const newType = typeSelect.value as 'form' | 'llm';
      if (newType === 'form') {
        this.template = { name: this.template.name, type: 'form', fields: [] };
      } else {
        this.template = {
          name: this.template.name,
          type: 'llm',
          system_prompt: '',
          question_flow: [],
          output_template: '',
        };
      }
      this.render();
    };

    // 유형별 에디터
    if (this.template.type === 'form') {
      this.renderFormEditor(contentEl, this.template);
    } else {
      this.renderLLMEditor(contentEl, this.template);
    }

    // 저장 버튼
    const footer = contentEl.createDiv('wh-modal-footer');
    const saveBtn = footer.createEl('button', { text: '저장', cls: 'wh-btn wh-btn-primary' });
    saveBtn.onclick = () => this.save();
  }

  private renderFormEditor(container: HTMLElement, template: FormTemplate): void {
    const section = container.createDiv('wh-section');
    section.createEl('h5', { text: '필드 목록' });

    template.fields.forEach((field, idx) => {
      this.renderFieldEditor(section, field, idx, template);
    });

    const addBtn = section.createEl('button', { text: '+ 필드 추가', cls: 'wh-btn' });
    addBtn.onclick = () => {
      template.fields.push({ id: `field_${Date.now()}`, title: '', type: 'text', required: true });
      this.render();
    };
  }

  private renderFieldEditor(
    container: HTMLElement,
    field: FormField,
    idx: number,
    template: FormTemplate
  ): void {
    const box = container.createDiv('wh-field-editor');

    const row1 = box.createDiv('wh-form-row');
    const titleInput = row1.createEl('input', {
      type: 'text',
      placeholder: '필드 이름',
      value: field.title,
      cls: 'wh-input',
    });
    titleInput.onchange = () => {
      field.title = titleInput.value;
      field.id = titleInput.value.toLowerCase().replace(/\s+/g, '_');
    };

    const typeSelect = row1.createEl('select', { cls: 'wh-input wh-input-sm' });
    ['text', 'multiline', 'date', 'select', 'number'].forEach(t => {
      const opt = typeSelect.createEl('option', { value: t, text: t });
      if (field.type === t) opt.selected = true;
    });
    typeSelect.onchange = () => {
      field.type = typeSelect.value as FormField['type'];
      this.render();
    };

    const reqLabel = row1.createEl('label', { cls: 'wh-checkbox-label' });
    const reqCheck = reqLabel.createEl('input', { type: 'checkbox' });
    reqCheck.checked = field.required;
    reqCheck.onchange = () => { field.required = reqCheck.checked; };
    reqLabel.appendText(' 필수');

    const delBtn = row1.createEl('button', { text: '×', cls: 'wh-btn wh-btn-danger wh-btn-sm' });
    delBtn.onclick = () => { template.fields.splice(idx, 1); this.render(); };

    const descInput = box.createEl('input', {
      type: 'text',
      placeholder: '설명 (선택)',
      value: field.description ?? '',
      cls: 'wh-input',
    });
    descInput.onchange = () => { field.description = descInput.value || undefined; };

    if (field.type === 'select') {
      const optInput = box.createEl('input', {
        type: 'text',
        placeholder: '옵션 (쉼표로 구분)',
        value: (field.options ?? []).join(', '),
        cls: 'wh-input',
      });
      optInput.onchange = () => {
        field.options = optInput.value.split(',').map(s => s.trim()).filter(Boolean);
      };
    }

    const llmInput = box.createEl('textarea', {
      placeholder: 'LLM 프롬프트 (선택) — 필드 입력값을 가공하는 지시문',
      cls: 'wh-input wh-textarea-sm',
    });
    llmInput.value = field.llm_prompt ?? '';
    llmInput.onchange = () => { field.llm_prompt = llmInput.value || undefined; };
  }

  private renderLLMEditor(container: HTMLElement, template: LLMTemplate): void {
    const sysRow = container.createDiv('wh-form-row-col');
    sysRow.createEl('label', { text: '시스템 프롬프트' });
    const sysInput = sysRow.createEl('textarea', { cls: 'wh-input wh-textarea' });
    sysInput.value = template.system_prompt;
    sysInput.onchange = () => { template.system_prompt = sysInput.value; };

    const flowRow = container.createDiv('wh-form-row-col');
    flowRow.createEl('label', { text: '질문 순서' });
    template.question_flow.forEach((q, idx) => {
      const qRow = flowRow.createDiv('wh-question-row');
      qRow.createSpan({ text: `${idx + 1}.`, cls: 'wh-question-num' });
      const qInput = qRow.createEl('input', { type: 'text', value: q, cls: 'wh-input' });
      qInput.onchange = () => { template.question_flow[idx] = qInput.value; };
      const delBtn = qRow.createEl('button', { text: '×', cls: 'wh-btn wh-btn-danger wh-btn-sm' });
      delBtn.onclick = () => { template.question_flow.splice(idx, 1); this.render(); };
    });
    const addQBtn = flowRow.createEl('button', { text: '+ 질문 추가', cls: 'wh-btn' });
    addQBtn.onclick = () => { template.question_flow.push(''); this.render(); };

    const outRow = container.createDiv('wh-form-row-col');
    outRow.createEl('label', { text: '출력 템플릿 (선택)' });
    const outInput = outRow.createEl('textarea', { cls: 'wh-input wh-textarea' });
    outInput.value = template.output_template ?? '';
    outInput.onchange = () => { template.output_template = outInput.value || undefined; };
  }

  private async save(): Promise<void> {
    const name = this.template.name.trim();
    if (!name) {
      new Notice('템플릿 이름을 입력해주세요.');
      return;
    }
    const filename = this.filename || this.templateManager.generateFilename(name);
    await this.templateManager.save(filename, this.template);
    new Notice('템플릿이 저장되었습니다.');
    this.onSave();
    this.close();
  }
}
