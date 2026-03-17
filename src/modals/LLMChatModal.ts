import { App, Modal, Notice, TFile, normalizePath } from 'obsidian';
import { LLMTemplate, LLMMessage } from '../types';
import { LLMProvider } from '../llm/LLMProvider';
import { TagManager } from '../core/TagManager';

type Phase = 'chat' | 'preview';

export class LLMChatModal extends Modal {
  private messages: LLMMessage[] = [];
  private questionIndex = 0;
  private phase: Phase = 'chat';
  private finalContent = '';

  constructor(
    app: App,
    private template: LLMTemplate,
    private llm: LLMProvider,
    private tagManager: TagManager,
    private outputFolder: string
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.titleEl.setText(`새 노트: ${this.template.name}`);
    this.modalEl.addClass('wh-chat-modal');

    this.messages = [
      {
        role: 'system',
        content:
          `${this.template.system_prompt}\n\n` +
          `아래 질문들을 순서대로 반드시 모두 사용자에게 물어보세요:\n` +
          this.template.question_flow.map((q, i) => `${i + 1}. ${q}`).join('\n') +
          `\n\n모든 질문이 끝난 후 사용자가 정리를 요청하면 대화 내용을 바탕으로 노트를 작성해주세요.` +
          (this.template.output_template
            ? `\n\n노트 형식:\n${this.template.output_template}`
            : ''),
      },
    ];

    this.render();
    await this.askNextQuestion();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    if (this.phase === 'preview') {
      this.renderPreview();
      return;
    }
    this.renderChat();
  }

  private renderChat(): void {
    const { contentEl } = this;

    // 채팅 로그
    const chatLog = contentEl.createDiv('wh-chat-log');
    this.messages
      .filter(m => m.role !== 'system')
      .forEach(msg => {
        const msgEl = chatLog.createDiv(`wh-chat-msg wh-chat-${msg.role}`);
        msgEl.createDiv({ text: msg.role === 'assistant' ? '🤖' : '👤', cls: 'wh-chat-role' });
        msgEl.createDiv({ text: msg.content, cls: 'wh-chat-content' });
      });

    // 진행도
    const total = this.template.question_flow.length;
    const current = Math.min(this.questionIndex, total);
    contentEl.createDiv({
      text: `질문 진행: ${current} / ${total}`,
      cls: 'wh-chat-progress',
    });

    // 입력 영역
    const inputArea = contentEl.createDiv('wh-chat-input-area');
    const textarea = inputArea.createEl('textarea', {
      cls: 'wh-input wh-textarea',
      placeholder: '답변을 입력하세요... (Ctrl+Enter로 전송)',
    });

    const btnRow = inputArea.createDiv('wh-chat-btn-row');
    const sendBtn = btnRow.createEl('button', { text: '전송', cls: 'wh-btn wh-btn-primary' });
    const finalizeBtn = btnRow.createEl('button', { text: '📝 정리해줘', cls: 'wh-btn' });

    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        sendBtn.click();
      }
    });

    sendBtn.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) return;
      textarea.value = '';
      sendBtn.disabled = true;
      finalizeBtn.disabled = true;
      await this.sendMessage(text);
      sendBtn.disabled = false;
      finalizeBtn.disabled = false;
    };

    finalizeBtn.onclick = async () => {
      sendBtn.disabled = true;
      finalizeBtn.disabled = true;
      finalizeBtn.setText('정리 중...');
      await this.finalize();
      sendBtn.disabled = false;
      finalizeBtn.disabled = false;
      finalizeBtn.setText('📝 정리해줘');
    };

    // 스크롤 최하단
    setTimeout(() => { chatLog.scrollTop = chatLog.scrollHeight; }, 50);
  }

  private renderPreview(): void {
    const { contentEl } = this;

    contentEl.createEl('h5', { text: '최종 노트 미리보기' });
    const preview = contentEl.createEl('pre', { cls: 'wh-preview-text wh-preview-large' });
    preview.setText(this.finalContent);

    const refineRow = contentEl.createDiv('wh-refine-row');
    const refineInput = refineRow.createEl('input', {
      type: 'text',
      placeholder: '추가 수정 요청 (예: 더 간결하게)',
      cls: 'wh-input',
    });
    const refineBtn = refineRow.createEl('button', { text: '재생성', cls: 'wh-btn' });
    refineBtn.onclick = async () => {
      const text = refineInput.value.trim();
      if (!text) return;
      refineBtn.disabled = true;
      refineBtn.setText('생성 중...');
      try {
        const refineMessages: LLMMessage[] = [
          ...this.messages,
          { role: 'assistant', content: this.finalContent },
          { role: 'user', content: text },
        ];
        this.finalContent = await this.llm.chat(refineMessages);
        refineInput.value = '';
        this.render();
      } catch {
        new Notice('재생성 실패. 다시 시도해주세요.');
      } finally {
        refineBtn.disabled = false;
        refineBtn.setText('재생성');
      }
    };

    const footer = contentEl.createDiv('wh-modal-footer');
    const backBtn = footer.createEl('button', { text: '← 대화로 돌아가기', cls: 'wh-btn' });
    backBtn.onclick = () => { this.phase = 'chat'; this.render(); };
    const saveBtn = footer.createEl('button', { text: '저장', cls: 'wh-btn wh-btn-primary' });
    saveBtn.onclick = () => this.save();
  }

  private async askNextQuestion(): Promise<void> {
    if (this.questionIndex >= this.template.question_flow.length) return;
    try {
      const response = await this.llm.chat(this.messages);
      this.messages.push({ role: 'assistant', content: response });
      this.questionIndex++;
      this.render();
    } catch {
      new Notice('LLM 호출 실패. 다시 시도해주세요.');
    }
  }

  private async sendMessage(text: string): Promise<void> {
    this.messages.push({ role: 'user', content: text });
    try {
      const response = await this.llm.chat(this.messages);
      this.messages.push({ role: 'assistant', content: response });
      this.render();
    } catch {
      this.messages.pop();
      new Notice('LLM 호출 실패. 다시 시도해주세요.');
      this.render();
    }
  }

  private async finalize(): Promise<void> {
    const finalMessages: LLMMessage[] = [
      ...this.messages,
      {
        role: 'user',
        content:
          '지금까지 나눈 대화를 바탕으로 노트를 정리해주세요.' +
          (this.template.output_template
            ? ` 다음 형식을 따르세요:\n${this.template.output_template}`
            : ''),
      },
    ];
    try {
      this.finalContent = await this.llm.chat(finalMessages);
      this.phase = 'preview';
      this.render();
    } catch {
      new Notice('정리 실패. 다시 시도해주세요.');
    }
  }

  private async save(): Promise<void> {
    let tags: string[] = [];
    try {
      tags = await this.tagManager.generateTags(this.finalContent);
    } catch {
      new Notice('태그 생성 실패. 태그 없이 저장합니다.');
    }

    const date = new Date().toISOString().split('T')[0];
    const frontmatter = [
      '---',
      `template: ${this.template.name}`,
      `date: ${date}`,
      `tags:`,
      ...tags.map(t => `  - ${t}`),
      '---',
    ].join('\n');

    const fullContent = `${frontmatter}\n\n${this.finalContent}`;
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
