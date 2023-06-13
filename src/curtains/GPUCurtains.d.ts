import { CameraBasePerspectiveOptions } from '../core/camera/Camera'
import { GPUCurtainsRenderer } from './renderer/GPUCurtainsRenderer'
import { ScrollManager } from '../utils/ScrollManager'
import { Vec3 } from '../math/Vec3'

interface GPUCurtainsParams {
  container: string | HTMLElement | null
  pixelRatio?: number
  camera?: CameraBasePerspectiveOptions
}

export class GPUCurtains {
  type: string
  options: GPUCurtainsParams
  container: HTMLElement

  renderer: GPUCurtainsRenderer
  canvas: GPUCurtainsRenderer['canvas']

  scrollManager: ScrollManager

  animationFrameID: null | number

  constructor({ container, pixelRatio, camera }: GPUCurtainsParams)

  setContainer(container: string | HTMLElement)
  setRenderer()
  setCurtains()

  setPerspective(fov?: number, near?: number, far?: number)
  setCameraPosition(position: Vec3)

  initEvents()
  resize()

  initScroll()
  updateScroll(lastXDelta?: number, lastYDelta?: number)

  animate()
  render()

  destroy()
}
