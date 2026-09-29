// Base Page Object: shared navigation + assertions for localhost UI.
class BasePage {
  constructor(page) {
    this.page = page;
  }

  async goto(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async title() {
    return this.page.title();
  }

  async hasText(text) {
    return this.page.getByText(text, { exact: false }).first().isVisible().catch(() => false);
  }

  async consoleErrors() {
    const errors = [];
    this.page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));
    return errors;
  }
}

module.exports = { BasePage };