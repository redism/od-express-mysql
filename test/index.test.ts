import { getName } from '../src/index'

describe('Example test', () => {
  it('getName', () => {
    expect(getName()).toEqual(`od-express-mysql`)
  })
})
