import { Plugin, PluginSettingTab, App, Setting } from "obsidian";

interface WriteHelperSettings {
  // 설정 필드를 여기에 추가
}

const DEFAULT_SETTINGS: WriteHelperSettings = {
  // 기본값
};

export default class WriteHelperPlugin extends Plugin {
  settings: WriteHelperSettings;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new WriteHelperSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class WriteHelperSettingTab extends PluginSettingTab {
  plugin: WriteHelperPlugin;

  constructor(app: App, plugin: WriteHelperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
  }
}
