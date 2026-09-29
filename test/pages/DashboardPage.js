// POM for role dashboards (/admin, /trainer, /participant).
const { BasePage } = require('./BasePage');

class DashboardPage extends BasePage {
  constructor(page) {
    super(page);
    this.heading = page.getByRole('heading').first();
    this.nav = page.locator('nav, aside').first();
  }

  async open(baseUrl, rolePath) {
    await this.goto(`${baseUrl}${rolePath}`);
  }

  async redirectedToLogin() {
    await this.page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
    return this.page.url().includes('/login');
  }
}

module.exports = { DashboardPage };