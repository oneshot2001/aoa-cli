export type ScenarioType =
  | 'object-in-area'
  | 'crossline-counting'
  | 'line-crossing'
  | 'occupancy'
  | 'time-in-area'

export type ObjectClass = 'human' | 'vehicle' | 'bicycle' | 'bus' | 'car' | 'truck'

export interface AoaScenario {
  id: number
  name: string
  type: ScenarioType
  objects: ObjectClass[]
  enabled: boolean
  devices?: number[]
}
