// POM for public pages: /, /verify-certificate, /privacy, /forgot-password.
const { BasePage } = require('./BasePage');

class PublicPages extends BasePage {
  constructor(page) {
    super(page);
    this.privacyHeading = page
      .getByText('Privacy Policy & Data Processing Disclosure', { exact: false })
      .first();
    this.privacyVersion = page.getByText('Version: 2.0', { exact: false }).first();
    this.certVerifyHeading = page
      .getByText('Certificate Verification Portal', { exact: false })
      .first();
    this.certCodeInput = page
      .locator('input[placeholder*="Certificate Code" i], input[placeholder*="CERT-" i]')
      .first();
  }

  async openRoot(baseUrl) {
    await this.goto(`${baseUrl}/`);
  }

  async openVerifyCertificate(baseUrl) {
    await this.goto(`${baseUrl}/verify-certificate`);
  }

  async openPrivacy(baseUrl) {
    await this.goto(`${baseUrl}/privacy`);
  }

  async openForgotPassword(baseUrl) {
    await this.goto(`${baseUrl}/forgot-password`);
  }

  async openApply(baseUrl) {
    await this.goto(`${baseUrl}/apply`);
  }
}

module.exports = { PublicPages };