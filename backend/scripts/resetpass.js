const b = require('bcryptjs')
const db = require('./src/config/db')
const { QueryTypes } = require('sequelize')
;(async () => {
  const sequelize = db.sequelize
  const pairs = [
    { email: 'wavene20@gmail.com', password: '123456789' },
    { email: 'titooram123@gmail.com', password: 'sriram123@' },
  ]
  for (const p of pairs) {
    const pw = await b.hash(p.password, 12)
    await sequelize.query(
      'UPDATE users SET password = :pw, passwordVersion = 2 WHERE email = :email',
      { replacements: { pw, email: p.email } }
    )
    console.log('set', p.email, '=>', p.password)
  }
  process.exit(0)
})()
