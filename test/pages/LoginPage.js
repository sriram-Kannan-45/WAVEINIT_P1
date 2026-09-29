// POM for /login (frontend/src/pages/Login.jsx).
// Real landmarks: "Welcome Back" title, email/password placeholders, AuthButton submit.
const { BasePage } = require('./BasePage');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    this.heading = page.getByText('Welcome Back', { exact: false }).first();
    this.emailInput = page
      .locator('input[placeholder="Enter your email"], input[type="email"], input[name="email"]')
      .first();
    this.passwordInput = page
      .locator('input[placeholder="Enter your password"], input[type="password"]')
      .first();
    this.submitButton = page
      .locator('button[type="submit"]')
      .or(page.getByRole('button', { name: /log\s?in|sign\s?in/i }))
      .first();
    // Role selector chips present on the shared login page.
    this.adminChip = page.getByText('Admin', { exact: true }).first();
    this.trainerChip = page.getByText('Trainer', { exact: true }).first();
    this.learnerChip = page.getByText('Learner', { exact: true }).first();
  }

  async open(baseUrl) {
    await this.goto(`${baseUrl}/login`);
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async isOnLogin() {
    return this.page.url().includes('/login');
  }
}

module.exports = { LoginPage };