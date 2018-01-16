import * as express from 'express'
import * as request from 'supertest'
import { ODMySQLContext, ODMySQLMiddleware } from '../src'

describe('using middleware', () => {
  let app
  beforeAll(async () => {
    app = express()
    const mw = new ODMySQLMiddleware({
      host: process.env.mysql_host || '127.0.0.1',
      user: process.env.mysql_user || 'root',
      password: process.env.mysql_password || 'test',
      port: process.env.mysql_port ? parseInt(process.env.mysql_port as string, 10) : 3306,
    }).middleware()

    app.get('/test/query', mw, function (req, res) {
      req['mysql'].query('select 1 + 1 as count')
        .then(ret => {
          res.status(200).json({ ok: 1, result: ret[0].count })
        }, ex => {
          res.status(400).json({ ok: 0, ex })
        })
    })

    const wrapAsync = (fn) => {
      return function (req, res) {
        Promise.resolve(fn(req, res)).then(v => {
          res.status(200).json({ value: v })
        }, ex => {
          console.log(ex)
          res.status(400).json({ error: ex.toString() })
        })
      }
    }

    app.post('/test/transaction', mw, wrapAsync(async (req, res) => {
      const mysql = req['mysql'] as ODMySQLContext
      const trans = await mysql.beginTransaction()
      await trans.commit()
      return 0
    }))
  })

  it('simple query', async () => {
    const p = await request(app).get('/test/query').expect(200)
    expect(p.body.result).toEqual(2)
  })

  it('transaction', async () => {
    const p = await request(app).post('/test/transaction').expect(200)
    expect(p.body.value).toEqual(0)
  })
})
