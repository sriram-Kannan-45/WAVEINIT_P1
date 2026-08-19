const b = require('bcryptjs')
const db = require('./src/config/db')
const { Sequelize, QueryTypes } = require('sequelize')
const tests = ['admin123','Admin123','admin@123','password123','12345678','test123','Test@123','password','Admin@123','trainer123','participant123','learner123','1234','sriram123','sriram']
;(async () => {
  const sequelize = db.sequelize
  const rows = await sequelize.query('SELECT id,email,password FROM users', { type: QueryTypes.SELECT })
  for (const u of rows) {
    let found = null
    for (const t of tests) {
      try { if (await b.compare(t, u.password)) { found = t; break } } catch (e) {}
    }
    console.log(u.email, '=>', found || 'NOT FOUND')
  }
  process.exit(0)
})()
