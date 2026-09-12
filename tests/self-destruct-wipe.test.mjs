import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { REDUCED_TIMING, WIPE_TIMING, bitState, cellsForLines, fieldCells, glyphAdvance, releaseTime } = await import('../lib/selfDestructWipe.js')

const AREA = { x: 0, y: 0, width: 800, height: 600 }
const steady = () => { let n = 0; return () => (n++ * 0.37) % 1 }
const bit = (y, seed = [0.5, 0.5, 0.5, 0.5, 0.5]) => ({ x: 100, y, seed })

describe('self-destruct animation — layout', () => {
  it('turns a line of text into one bit per character slot, in the middle of the line', () => {
    const cells = cellsForLines([{ x: 10, y: 100, width: 99.2, height: 24, fontSize: 16, style: 2 }], { random: steady() })
    assert.equal(cells.length, Math.round(99.2 / glyphAdvance(16)))
    assert.ok(cells.every(c => c.y === 112 && c.size === 16 && c.style === 2 && (c.bit === 0 || c.bit === 1) && c.seed.length === 5))
    assert.equal(cells[0].x, 10)
  })

  it('skips empty boxes and stops at the cell limit', () => {
    assert.deepEqual(cellsForLines([{ x: 0, y: 0, width: 0, height: 20, fontSize: 16 }, null]), [])
    const lines = Array.from({ length: 50 }, (_, i) => ({ x: 0, y: i * 20, width: 600, height: 20, fontSize: 16 }))
    assert.equal(cellsForLines(lines, { maxCells: 500 }).length, 500)
  })

  it('covers an area with a field of bits, up to a limit', () => {
    assert.equal(fieldCells({ x: 0, y: 0, width: 124, height: 42 }).length, 20)
    assert.equal(fieldCells({ x: 0, y: 0, width: 5000, height: 5000 }, { maxCells: 100 }).length, 100)
    assert.deepEqual(fieldCells(null), [])
  })
})

describe('self-destruct animation — motion', () => {
  it('runs its phases in order, and ends sooner under reduced motion', () => {
    const t = WIPE_TIMING
    assert.ok(t.encode < t.releaseStart && t.releaseStart < t.releaseEnd && t.releaseEnd < t.message && t.message < t.fallEnd && t.fallEnd < t.exit && t.exit < t.done)
    assert.ok(REDUCED_TIMING.message < REDUCED_TIMING.exit && REDUCED_TIMING.exit < REDUCED_TIMING.done && REDUCED_TIMING.done < t.done)
  })

  it('turns the top of the page into bits before the bottom', () => {
    assert.ok(bitState(bit(10), 150, AREA).alpha > bitState(bit(590), 150, AREA).alpha)
    assert.ok(bitState(bit(10), WIPE_TIMING.encode, AREA).alpha > 0.99)
    assert.ok(bitState(bit(590), WIPE_TIMING.encode, AREA).alpha > 0.99)
  })

  it('lets bits go from the top of the page down, each within the release window', () => {
    assert.ok(releaseTime(bit(10), AREA) < releaseTime(bit(590), AREA))
    for (const seed of [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [0.3, 0.8, 0.1, 0.9, 0.2]]) {
      for (const y of [0, 300, 600]) {
        const at = releaseTime(bit(y, seed), AREA)
        assert.ok(at >= WIPE_TIMING.releaseStart && at <= WIPE_TIMING.releaseEnd)
      }
    }
  })

  it('holds a bit in place until it lets go, then it falls faster and fades', () => {
    const b = bit(300, [0.5, 0.5, 0.5, 0.5, 0.9])
    const release = releaseTime(b, AREA)
    const still = bitState(b, release - 1, AREA)
    assert.equal(still.dy, 0)
    assert.ok(still.alpha > 0.99 && still.accent > 0)
    const falls = [100, 250, 400].map(ms => bitState(b, release + ms, AREA))
    assert.ok(falls[0].dy > 0 && falls[1].dy - falls[0].dy > falls[0].dy)
    assert.ok(falls[2].dy > falls[1].dy)
    assert.ok(falls[0].alpha > falls[1].alpha && falls[1].alpha > falls[2].alpha)
    assert.ok(falls[2].dx > 0)
  })

  it('leaves nothing on the page once every bit has fallen', () => {
    for (const seed of [[1, 0, 0, 1, 0], [0, 1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5, 0.5]]) {
      for (const y of [0, 600]) {
        assert.equal(bitState(bit(y, seed), WIPE_TIMING.fallEnd, AREA).alpha, 0)
        assert.ok(bitState(bit(y, seed), WIPE_TIMING.fallEnd - 1, AREA).alpha < 0.001)
      }
    }
  })
})
