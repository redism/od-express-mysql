import * as assert from 'assert'
import * as Knex from 'knex'
import * as mysql from 'mysql'

export const knex = Knex({ client: 'mysql' })

export interface Queriable {
  query: mysql.QueryFunction
}

export class ODMySQLContext {
  deferred: (() => Promise<any>)[] = []
  inTransaction: boolean = false
  hasConnection: boolean = false

  constructor (private pool: mysql.Pool) {
  }

  async cleanup () {
    for (let i = 0; i < this.deferred.length; i += 1) {
      await Promise.resolve(this.deferred[i]())
    }
  }

  async query (query: string, ...optionals) {
    return new Promise((resolve, reject) => {
      this.pool.query(query, ...optionals, function (err, rows) {
        if (err) {
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  }

  async beginTransaction () {
    return new Promise((resolve, reject) => {
      if (this.inTransaction) {
        return reject(new Error('Already in transaction'))
      }

      if (this.hasConnection) {
        return reject(new Error('Already has connection. Release it first.'))
      }

      this.pool.getConnection((err, conn) => {
        if (err) {
          return reject(err)
        }

        this.hasConnection = true

        const release = async () => {
          if (this.inTransaction) {
            this.inTransaction = false
            console.error(`Transaction finished without explicit commit() or rollback(). Rolling back.`)
            await new Promise((resolve, reject) => {
              conn.rollback(err => {
                err ? reject(err) : resolve()
              })
            })
          }

          if (this.hasConnection) {
            this.hasConnection = false
            conn.release()
          }
        }

        this.deferred.push(release)

        conn.beginTransaction(err => {
          if (err) {
            return reject(err)
          }

          this.inTransaction = true
          const transaction = {
            connection: conn,
            query: async (query: string, ...optionals) => {
              return new Promise((resolve, reject) => {
                conn.query(query, ...optionals, function (err, rows) {
                  if (err) {
                    reject(err)
                  } else {
                    resolve(rows)
                  }
                })
              })
            },
            commit: async () => {
              assert(this.inTransaction, `Not in a transaction. commit() failed.`)
              return new Promise((resolve, reject) => {
                conn.commit(err => {
                  if (err) {
                    conn.rollback(err => {
                      if (err) {
                        console.error(`Rollback failed.`)
                        return reject(err)
                      }
                      this.inTransaction = false
                      release().then(() => reject(err), reject)
                    })
                  } else {
                    this.inTransaction = false
                    release().then(() => resolve(), reject)
                  }
                })
              })
            },
            rollback: async () => {
              assert(this.inTransaction, `Not in a transaction. commit() failed.`)
              return new Promise(resolve => {
                conn.rollback(() => {
                  this.inTransaction = false
                  release().then(() => resolve(), reject)
                })
              })
            }
          }

          resolve(transaction)
        })
      })
    })
  }
}

export class ODMySQLMiddleware {
  pool: mysql.Pool

  constructor (options: mysql.PoolConfig | string) {
    this.pool = mysql.createPool(options)
  }

  async end () {
    return new Promise(resolve => this.pool.end(resolve))
  }

  middleware (propName = 'mysql') {
    return (req, res, next) => {
      const context = new ODMySQLContext(this.pool)
      req[propName] = context
      next()
      context.cleanup().catch(ex => console.error(ex))
    }
  }
}
