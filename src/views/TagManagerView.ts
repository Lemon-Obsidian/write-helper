import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import { TagManager } from '../core/TagManager';

export const TAG_MANAGER_VIEW_TYPE = 'write-helper-tag-manager';

export class TagManagerView extends ItemView {
  private tags: string[] = [];

  constructor(leaf: WorkspaceLeaf, private tagManager: TagManager) {
    super(leaf);
  }

  getViewType(): string {
    return TAG_MANAGER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '태그 관리';
  }

  getIcon(): string {
    return 'tag';
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.tags = await this.tagManager.loadTags();
    this.render();
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    const wrapper = container.createDiv('wh-tag-manager');

    const header = wrapper.createDiv('wh-header');
    header.createEl('h4', { text: '전역 태그 목록' });
    const addBtn = header.createEl('button', { text: '+ 추가', cls: 'wh-btn' });
    addBtn.onclick = () => this.addTag();

    const list = wrapper.createDiv('wh-tag-list');
    if (this.tags.length === 0) {
      list.createDiv({ text: '태그가 없습니다.', cls: 'wh-empty' });
      return;
    }

    this.tags.forEach(tag => {
      const item = list.createDiv('wh-tag-item');
      item.createSpan({ text: tag, cls: 'wh-tag-name' });
      const deleteBtn = item.createEl('button', { text: '삭제', cls: 'wh-btn wh-btn-danger wh-btn-sm' });
      deleteBtn.onclick = async () => {
        this.tags = this.tags.filter(t => t !== tag);
        await this.tagManager.saveTags(this.tags);
        this.render();
      };
    });
  }

  private async addTag(): Promise<void> {
    const name = prompt('새 태그 이름:');
    if (!name?.trim()) return;
    if (this.tags.includes(name.trim())) {
      new Notice('이미 존재하는 태그입니다.');
      return;
    }
    this.tags.push(name.trim());
    await this.tagManager.saveTags(this.tags);
    this.render();
  }
}
