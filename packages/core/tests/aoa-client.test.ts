import { describe, test, expect } from 'bun:test'
import { defaultTrigger, defaultFilters, SCENARIO_TYPES, OBJECT_CLASSES } from '../src/lib/aoa-client.js'

describe('SCENARIO_TYPES', () => {
  test('contains all 6 supported types', () => {
    expect(SCENARIO_TYPES).toContain('motion')
    expect(SCENARIO_TYPES).toContain('fence')
    expect(SCENARIO_TYPES).toContain('crosslinecounting')
    expect(SCENARIO_TYPES).toContain('occupancyInArea')
    expect(SCENARIO_TYPES).toContain('tailgating')
    expect(SCENARIO_TYPES).toContain('fallDetection')
    expect(SCENARIO_TYPES).toHaveLength(6)
  })
})

describe('OBJECT_CLASSES', () => {
  test('includes human, vehicle, and PPE class', () => {
    expect(OBJECT_CLASSES).toContain('human')
    expect(OBJECT_CLASSES).toContain('vehicle')
    expect(OBJECT_CLASSES).toContain('missing_hardhat')
  })
})

describe('defaultTrigger', () => {
  test('motion → includeArea trigger covering full frame', () => {
    const t = defaultTrigger('motion')
    expect(t.type).toBe('includeArea')
    expect(t.vertices).toBeDefined()
    expect(t.vertices!.length).toBe(4) // rectangle
  })

  test('occupancyInArea → includeArea trigger', () => {
    const t = defaultTrigger('occupancyInArea')
    expect(t.type).toBe('includeArea')
  })

  test('fallDetection → includeArea trigger', () => {
    const t = defaultTrigger('fallDetection')
    expect(t.type).toBe('includeArea')
  })

  test('fence → fence trigger with alarmDirection', () => {
    const t = defaultTrigger('fence')
    expect(t.type).toBe('fence')
    expect(t.alarmDirection).toBe('leftToRight')
    expect(t.vertices!.length).toBe(2) // line
  })

  test('tailgating → fence trigger (not includeArea)', () => {
    // Tailgating uses fence trigger — learned from live camera error
    const t = defaultTrigger('tailgating')
    expect(t.type).toBe('fence')
  })

  test('crosslinecounting → countingLine trigger', () => {
    const t = defaultTrigger('crosslinecounting')
    expect(t.type).toBe('countingLine')
    expect(t.countingDirection).toBe('leftToRight')
    expect(t.vertices!.length).toBe(2)
  })

  test('every SCENARIO_TYPE returns a trigger with a type string', () => {
    for (const type of SCENARIO_TYPES) {
      const t = defaultTrigger(type)
      expect(typeof t.type).toBe('string')
      expect(t.type.length).toBeGreaterThan(0)
    }
  })
})

describe('defaultFilters', () => {
  test('motion → 3 filters (distanceSwayingObject, timeShortLivedLimit, sizePercentage)', () => {
    const filters = defaultFilters('motion')
    expect(filters).toHaveLength(3)
    const types = filters.map((f) => f.type)
    expect(types).toContain('distanceSwayingObject')
    expect(types).toContain('timeShortLivedLimit')
    expect(types).toContain('sizePercentage')
  })

  test('occupancyInArea → 3 filters (same as motion)', () => {
    expect(defaultFilters('occupancyInArea')).toHaveLength(3)
  })

  test('fence → no filters (swayingObject invalid for fence)', () => {
    expect(defaultFilters('fence')).toHaveLength(0)
  })

  test('tailgating → no filters', () => {
    expect(defaultFilters('tailgating')).toHaveLength(0)
  })

  test('crosslinecounting → no filters', () => {
    expect(defaultFilters('crosslinecounting')).toHaveLength(0)
  })

  test('fallDetection → no filters', () => {
    expect(defaultFilters('fallDetection')).toHaveLength(0)
  })
})
