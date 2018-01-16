export const isDeadLockError = err => err && err.errno && err.errno === 1213
export const isForeignKeyError = err => err && err.errno && err.errno === 1452
export const isDupKeyError = err => err && err.errno && err.errno === 1062
export const getDupKeyErrorIndexName = err => {
  // ex: Duplicate entry '1023' for key 'partner_sub1_unique_index'
  const key = err.sqlMessage.split('for key ')[1]
  return key.substring(1, key.length - 1)
}
