import { Renderer } from '../../types/renderer-utils'
import { ComputeMaterial } from '../materials/ComputeMaterial'
import { WorkBindings } from '../bindings/WorkBindings'
import { MaterialShaders } from '../materials/Material'
import { MeshBindings, MeshBindingsTypes } from '../meshes/MeshBaseMixin'
import { BufferBindings } from '../bindings/BufferBindings'

interface WorkGroupParams {
  name: string
  label: string
  type: string
  value: number[] | Float32Array
}

interface ComputePassOptions {
  label: string
  renderOrder: number
  shaders: MaterialShaders
  uniforms: MeshBindings[]
  storages: MeshBindings[]
  workGroups: WorkGroupParams[]
}

type ComputePassParams = Partial<ComputePassOptions>

type ComputeBindingsTypes = MeshBindingsTypes | 'workGroups'
type ComputeBindingsParams = Record<ComputeBindingsTypes, MeshBindings[] | WorkGroupParams[]>

export class ComputePass {
  type: string
  uuid: string
  index: number
  renderer: Renderer
  renderOrder: number

  options: ComputePassOptions

  material: ComputeMaterial

  uniforms: ComputeMaterial['uniforms']

  constructor(renderer: Renderer, parameters: ComputePassParams)

  setComputeMaterial(computeParameters)

  addToScene()
  removeFromScene()

  createBindings({
    uniforms,
    storages,
    workGroups,
  }: ComputeBindingsParams): Record<MeshBindingsTypes, BufferBindings[] | WorkBindings[]>

  onBeforeRender: (callback: () => void) => ComputePass
  onRender: (callback: () => void) => ComputePass
  onAfterRender: (callback: () => void) => ComputePass

  onBeforeRenderPass()
  onRenderPass(pass: GPUComputePassEncoder)
  onAfterRenderPass()

  render(pass: GPUComputePassEncoder)

  get canComputePass(): boolean

  copyBufferToResult(commandEncoder: GPUCommandEncoder)
  setWorkGroupsResult()
  getWorkGroupResult(name: string): Float32Array | null

  remove()
  destroy()
}
