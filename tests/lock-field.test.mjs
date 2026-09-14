import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { EFFECTS, FIELD, clearFactor, createField, liveEffects, stepField, sweepFront, unlockRadius } = await import('../lib/lockField.js')

const never = () => 1 // a random() that never flips a bit
const always = () => 0 // a random() that flips every bit it can
const half = () => 0.5
const near = (a, b) => Math.abs(a - b) < 1e-6
const cellAt = (field, x, y) => Math.round(y / FIELD.line) * field.cols + Math.round(x / FIELD.cell)

describe('lock screen field — layout', () => {
  it('covers the window with bits on the site’s grid', () => {
    const field = createField(124, 42, { random: half })
    assert.equal(field.cols, 10)
    assert.equal(field.rows, 2)
    assert.equal(field.xs.length, 20)
    assert.ok(near(field.xs[1], FIELD.cell))
    assert.ok(near(field.ys[10], FIELD.line))
    assert.ok([...field.bits].every(bit => bit === 0 || bit === 1))
  })

  it('draws nothing for a window with no size', () => {
    const field = createField(0, 0)
    assert.equal(field.xs.length, 0)
    assert.equal(stepField(field, { dt: 1 }).length, 0)
  })
})

describe('lock screen field — resting and the sweep', () => {
  it('holds still at the resting opacity with Reduce Motion on', () => {
    const field = createField(400, 300, { random: half })
    const bits = [...field.bits]
    const alpha = stepField(field, { time: 3, dt: 1, now: 100, base: 0.05, peak: 0.3, still: true, random: always, effects: [{ type: 'scramble', x: 200, y: 150, radius: 300, duration: 1000, start: 0 }] })
    assert.ok([...alpha].every(a => near(a, 0.05)))
    assert.deepEqual([...field.bits], bits)
  })

  it('lights up the bits on the sweep and leaves the rest resting', () => {
    const field = createField(1440, 900, { random: half })
    const time = 2
    const front = sweepFront(time, 1440, 900)
    const alpha = stepField(field, { time, dt: 1 / 12, base: 0.05, peak: 0.3, random: never })
    let onSweep = 0
    let resting = 0
    for (let i = 0; i < field.xs.length; i++) {
      const d = Math.abs(field.xs[i] + field.ys[i] * 0.6 - front)
      if (d < 5) { assert.ok(alpha[i] > 0.3); onSweep++ }
      if (d > FIELD.sweepBand) { assert.ok(near(alpha[i], 0.05)); resting++ }
    }
    assert.ok(onSweep > 0 && resting > 0)
  })

  it('crosses the window once a period, starting off screen', () => {
    assert.equal(sweepFront(0, 1000, 500), -150)
    assert.equal(sweepFront(FIELD.period, 1000, 500), -150)
    assert.ok(sweepFront(FIELD.period / 2, 1000, 500) > 0)
  })
})

describe('lock screen field — the clearing behind the words', () => {
  it('fades bits most at the centre and not at all outside', () => {
    const clear = { x: 100, y: 100, rx: 50, ry: 20 }
    assert.ok(near(clearFactor(clear, 100, 100), 0.12))
    assert.equal(clearFactor(clear, 160, 100), 1)
    assert.ok(clearFactor(clear, 125, 100) > clearFactor(clear, 110, 100))
    assert.equal(clearFactor(null, 0, 0), 1)
  })

  it('applies to the drawn field', () => {
    const field = createField(800, 600, { random: half })
    const clear = { x: 400, y: 300, rx: 200, ry: 100 }
    const alpha = stepField(field, { base: 0.05, peak: 0.3, clear })
    assert.ok(alpha[cellAt(field, 400, 294)] < 0.02)
    assert.ok(near(alpha[cellAt(field, 0, 0)], 0.05))
  })
})

describe('lock screen field — a wrong password and unlocking', () => {
  // At time 0 the sweep is off screen, so only the effect changes the field
  const scramble = { type: 'scramble', x: 400, y: 300, ...EFFECTS.scramble, start: 1000 }
  const stepAt = (now, effect, random = never) => {
    const field = createField(800, 600, { random: half })
    const bits = [...field.bits]
    const alpha = stepField(field, { time: 0, dt: 1 / 12, now, effects: [effect], base: 0.05, peak: 0.3, random })
    return { field, bits, alpha }
  }

  it('scrambles the bits around the password field, then settles', () => {
    const start = stepAt(1000, scramble)
    const centre = cellAt(start.field, 400, 294)
    assert.ok(start.alpha[centre] > 0.3)
    assert.ok(near(start.alpha[cellAt(start.field, 0, 0)], 0.05))
    const after = stepAt(1000 + EFFECTS.scramble.duration, scramble)
    assert.ok(near(after.alpha[centre], 0.05))
  })

  it('shows a wrong password through the clearing behind the words', () => {
    const clear = { x: 400, y: 300, rx: 300, ry: 150 }
    const field = createField(800, 600, { random: half })
    const busy = stepField(field, { time: 0, dt: 1 / 12, now: 1000, effects: [scramble], base: 0.05, peak: 0.3, clear, random: never })
    const quiet = stepField(createField(800, 600, { random: half }), { time: 0, dt: 1 / 12, now: 1000, effects: [], base: 0.05, peak: 0.3, clear, random: never })
    const centre = cellAt(field, 400, 294)
    assert.ok(quiet[centre] < 0.02)
    assert.ok(busy[centre] > 0.15)
  })

  it('flips bits while it scrambles', () => {
    // Compared with the same step without the scramble, since resting bits flicker too
    const quiet = stepAt(1000, { ...scramble, start: -5000 }, always)
    const busy = stepAt(1000, scramble, always)
    const centre = cellAt(busy.field, 400, 294)
    const corner = cellAt(busy.field, 0, 0)
    assert.notEqual(busy.field.bits[centre], quiet.field.bits[centre])
    assert.equal(busy.field.bits[corner], quiet.field.bits[corner])
  })

  it('decrypts outward from the field and leaves the window empty when done', () => {
    const unlock = { type: 'unlock', x: 400, y: 300, radius: 2000, duration: EFFECTS.unlock.duration, start: 0 }
    const { field, alpha } = stepAt(50, unlock)
    assert.equal(alpha[cellAt(field, 400, 294)], 0)
    assert.ok(near(alpha[cellAt(field, 0, 0)], 0.05))
    assert.deepEqual(liveEffects([unlock], 10), { live: [unlock], unlocked: false })
    assert.deepEqual(liveEffects([unlock], EFFECTS.unlock.duration), { live: [], unlocked: true })
    assert.deepEqual(liveEffects([scramble], 5000), { live: [], unlocked: false })
  })

  it('eases the unlock out and stops at its radius', () => {
    assert.equal(unlockRadius(0, 100), 0)
    assert.equal(unlockRadius(1, 100), 100)
    assert.equal(unlockRadius(2, 100), 100)
    assert.ok(unlockRadius(0.5, 100) > 50)
  })

  it('never draws a bit stronger than the full ink', () => {
    const field = createField(800, 600, { random: half })
    const time = 3
    const effects = [
      { type: 'scramble', x: 400, y: 300, radius: 900, duration: 1000, start: 0 },
      { type: 'unlock', x: 400, y: 300, radius: 400, duration: 1000, start: 0 }
    ]
    const alpha = stepField(field, { time, dt: 1 / 12, now: 1, effects, base: 0.2, peak: 0.9, random: never })
    assert.ok([...alpha].every(a => a >= 0 && a <= 1))
  })
})
