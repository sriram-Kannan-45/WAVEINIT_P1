import selfsigned from 'selfsigned'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const certDir = path.resolve(process.cwd(), '.cert')
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true })
}

const keyPath = path.join(certDir, 'localhost-key.pem')
const certPath = path.join(certDir, 'localhost.pem')

console.log('Generating development SSL certificate with SANs...')

const attrs = [
  { name: 'commonName', value: '192.168.0.102' },
  { name: 'organizationName', value: 'WAVE INIT LMS Local Dev' },
]

async function main() {
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    days: 3650,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'basicConstraints',
        cA: true,
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '192.168.0.102' },
        ],
      },
    ],
  })

  fs.writeFileSync(keyPath, pems.private, 'utf8')
  fs.writeFileSync(certPath, pems.cert, 'utf8')

  console.log('✅ Generated .cert/localhost-key.pem and .cert/localhost.pem')

  // Attempt Windows Certificate Store trust installation
  if (process.platform === 'win32') {
    try {
      const psCmd = `powershell -Command "Import-Certificate -FilePath '${certPath.replace(/\\/g, '/')}' -CertStoreLocation 'Cert:\\CurrentUser\\Root'"`
      execSync(psCmd, { stdio: 'inherit' })
      console.log('✅ Installed development certificate into Windows Trusted Root Certification Authorities store!')
    } catch (err) {
      console.warn('⚠️ Could not auto-import cert to Windows store:', err.message)
    }
  }
}

main().catch(console.error)
