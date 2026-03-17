import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { WriteHelperSettings, Template, FormTemplate, LLMTemplate } from './types';
import { LLMProvider } from './llm/LLMProvider';
import { OpenAIProvider } from './llm/OpenAIProvider';
import { TagManager } from './core/TagManager';
import { TemplateManager } from './core/TemplateManager';
import { TagManagerView, TAG_MANAGER_VIEW_TYPE } from './views/TagManagerView';
import { TemplateManagerView, TEMPLATE_MANAGER_VIEW_TYPE } from './views/TemplateManagerView';
import { FormFillModal } from './modals/FormFillModal';
import { LLMChatModal } from './modals/LLMChatModal';
import { ValidationModal } from './modals/ValidationModal';

const DEFAULT_TAG_PROMPT =
  `글의 내용을 분석하여 핵심 태그를 생성해주세요.\n` +
  `- 태그는 재사용 가능하고 의미 있는 단어로 구성하세요\n` +
  `- 너무 구체적이거나 일회성 태그는 피하세요\n` +
  `- 기존 태그 목록에 적절한 태그가 있으면 반드시 재사용하세요\n` +
  `- 새 태그는 꼭 필요한 경우에만 추가하세요\n` +
  `- 3~7개 사이의 태그를 생성하세요`;

const DEFAULT_SETTINGS: WriteHelperSettings = {
  rootFolder: '.write-helper',
  openaiApiKey: '',
  openaiModel: 'gpt-4o',
  tagPrompt: DEFAULT_TAG_PROMPT,
};

export default class WriteHelperPlugin extends Plugin {
  settings: WriteHelperSettings;
  llm: LLMProvider;
  tagManager: TagManager;
  templateManager: TemplateManager;

  async onload() {
    await this.loadSettings();
    this.initServices();

    this.registerView(TAG_MANAGER_VIEW_TYPE, leaf => new TagManagerView(leaf, this.tagManager));
    this.registerView(
      TEMPLATE_MANAGER_VIEW_TYPE,
      leaf => new TemplateManagerView(leaf, this.templateManager)
    );

    this.addRibbonIcon('layout-template', '템플릿 관리', () => this.openTemplateManager());
    this.addRibbonIcon('tag', '태그 관리', () => this.openTagManager());

    this.addCommand({
      id: 'open-template-manager',
      name: '템플릿 관리 열기',
      callback: () => this.openTemplateManager(),
    });
    this.addCommand({
      id: 'open-tag-manager',
      name: '태그 관리 열기',
      callback: () => this.openTagManager(),
    });
    this.addCommand({
      id: 'new-note-from-template',
      name: '템플릿으로 새 노트 작성',
      callback: () => this.openNewNoteModal(),
    });
    this.addCommand({
      id: 'validate-folder',
      name: '폴더 파일 교정',
      callback: () => this.openValidationModal(),
    });

    this.addSettingTab(new WriteHelperSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(TAG_MANAGER_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(TEMPLATE_MANAGER_VIEW_TYPE);
  }

  initServices() {
    this.llm = new OpenAIProvider(this.settings.openaiApiKey, this.settings.openaiModel);
    this.tagManager = new TagManager(this.app, this.settings, this.llm);
    this.templateManager = new TemplateManager(this.app, this.settings.rootFolder);
  }

  async openTemplateManager() {
    const leaves = this.app.workspace.getLeavesOfType(TEMPLATE_MANAGER_VIEW_TYPE);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
    } else {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: TEMPLATE_MANAGER_VIEW_TYPE, active: true });
    }
  }

  async openTagManager() {
    const leaves = this.app.workspace.getLeavesOfType(TAG_MANAGER_VIEW_TYPE);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
    } else {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: TAG_MANAGER_VIEW_TYPE, active: true });
    }
  }

  async openNewNoteModal() {
    if (!this.settings.openaiApiKey) {
      new Notice('OpenAI API 키를 먼저 설정해주세요.');
      return;
    }
    const templates = await this.templateManager.loadAll();
    if (templates.length === 0) {
      new Notice('먼저 템플릿을 생성해주세요.');
      return;
    }
    new TemplateSelectorModal(this.app, templates, ({ template }) => {
      const outputFolder = this.app.workspace.getActiveFile()?.parent?.path ?? '';
      if (template.type === 'form') {
        new FormFillModal(
          this.app,
          template as FormTemplate,
          this.settings,
          this.llm,
          this.tagManager,
          outputFolder
        ).open();
      } else {
        new LLMChatModal(
          this.app,
          template as LLMTemplate,
          this.llm,
          this.tagManager,
          outputFolder
        ).open();
      }
    }).open();
  }

  openValidationModal() {
    if (!this.settings.openaiApiKey) {
      new Notice('OpenAI API 키를 먼저 설정해주세요.');
      return;
    }
    new ValidationModal(this.app, this.templateManager, this.llm).open();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.initServices();
  }
}

class TemplateSelectorModal extends Modal {
  constructor(
    app: App,
    private templates: { filename: string; template: Template }[],
    private onSelect: (t: { filename: string; template: Template }) => void
  ) {
    super(app);
  }

  onOpen() {
    this.titleEl.setText('템플릿 선택');
    const { contentEl } = this;
    this.templates.forEach(t => {
      const btn = contentEl.createEl('button', {
        text: `${t.template.type === 'form' ? '📋' : '🤖'} ${t.template.name}`,
        cls: 'wh-template-select-btn',
      });
      btn.onclick = () => { this.close(); this.onSelect(t); };
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class WriteHelperSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: WriteHelperPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('플러그인 루트 폴더')
      .setDesc('템플릿, 태그 등 플러그인 데이터가 저장될 vault 내 폴더 경로')
      .addText(text =>
        text
          .setPlaceholder('.write-helper')
          .setValue(this.plugin.settings.rootFolder)
          .onChange(async val => {
            this.plugin.settings.rootFolder = val || '.write-helper';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('OpenAI API 키')
      .setDesc('OpenAI API 키를 입력하세요')
      .addText(text =>
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.openaiApiKey)
          .onChange(async val => {
            this.plugin.settings.openaiApiKey = val;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('OpenAI 모델')
      .setDesc('사용할 OpenAI 모델')
      .addText(text =>
        text
          .setPlaceholder('gpt-4o')
          .setValue(this.plugin.settings.openaiModel)
          .onChange(async val => {
            this.plugin.settings.openaiModel = val || 'gpt-4o';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('태그 생성 프롬프트')
      .setDesc('태그 자동 생성 시 사용할 시스템 프롬프트')
      .addTextArea(text =>
        text
          .setValue(this.plugin.settings.tagPrompt)
          .onChange(async val => {
            this.plugin.settings.tagPrompt = val;
            await this.plugin.saveSettings();
          })
      );
  }
}
