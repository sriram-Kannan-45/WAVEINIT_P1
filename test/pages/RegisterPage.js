// POM for /register.
const { BasePage } = require('./BasePage');

class RegisterPage extends BasePage {
  constructor(page) {
    super(page);
    this.nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    this.emailInput = page.locator('input[type="email"], input[name="email"]').first();
    this.passwordInput = page.locator('input[type="password"]').first();
    this.submitButton = page.getByRole('button', { name: /register|sign\s?up|create/i }).first();
  }

  async open(baseUrl) {
    await this.goto(`${baseUrl}/register`);
  }
}

module.exports = { RegisterPage };