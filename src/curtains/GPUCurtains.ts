import { GPUCurtainsRenderer } from './renderers/GPUCurtainsRenderer'
import { ScrollManager } from '../utils/ScrollManager'
import { resizeManager } from '../utils/ResizeManager'
import { Vec3 } from '../math/Vec3'
import { PingPongPlane } from './meshes/PingPongPlane'
import { ShaderPass } from '../core/renderPasses/ShaderPass'
import { GPURenderer, GPURendererParams, ProjectedMesh } from '../core/renderers/GPURenderer'
import { DOMMesh } from './meshes/DOMMesh'
import { Plane } from './meshes/Plane'
import { ComputePass } from '../core/computePasses/ComputePass'
import { Camera, CameraBasePerspectiveOptions } from '../core/camera/Camera'
import { DOMElementBoundingRect, DOMElementParams, DOMPosition } from '../core/DOM/DOMElement'
import { GPUCameraRenderer, GPUCameraRendererParams } from '../core/renderers/GPUCameraRenderer'
import { GPUDeviceManager } from '../core/renderers/GPUDeviceManager'
import { Renderer } from '../core/renderers/utils'

/**
 * Options used to create a {@link GPUCurtains}
 */
export interface GPUCurtainsOptions extends Omit<GPUCameraRendererParams, 'deviceManager'> {
  /** Whether {@link GPUCurtains} should create its own requestAnimationFrame loop to render or not */
  autoRender?: boolean
  /** Whether {@link GPUCurtains} should handle all resizing by itself or not */
  autoResize?: boolean
  /** Whether {@link GPUCurtains} should listen to scroll event or not */
  watchScroll?: boolean
  /** Flag indicating whether we're running the production mode or not. If not, useful warnings could be logged to the console */
  production: GPUDeviceManager['production']
}

/**
 * Parameters used to create a {@link GPUCurtains}
 */
export interface GPUCurtainsParams extends Partial<Omit<GPUCurtainsOptions, 'container'>> {
  /** {@link HTMLElement} or string representing an {@link HTMLElement} selector that will hold the WebGPU {@link HTMLCanvasElement}. Could be set later if not specified. */
  container?: string | HTMLElement | null
}

/**
 * Used as a global class to create a {@link GPUCurtainsRenderer}, create all objects that need a reference to a renderer, listen to various events such as scroll and resize and render.
 *
 * @example
 * ```javascript
 * // set our main GPUCurtains instance
 * const gpuCurtains = new GPUCurtains({
 *   container: '#canvas' // selector of our WebGPU canvas container
 * })
 *
 * // set the GPU device
 * // note this is asynchronous
 * await gpuCurtains.setDevice()
 * ```
 */
export class GPUCurtains {
  /** The type of this {@link GPUCurtains} */
  type: string
  /** Options used to create this {@link GPUCurtains} */
  options: GPUCurtainsOptions
  /** {@link HTMLElement} that will hold the WebGPU {@link HTMLCanvasElement} */
  container: HTMLElement

  /** {@link GPUDeviceManager} used to handle the {@link GPUAdapter} and {@link GPUDevice} */
  deviceManager: GPUDeviceManager

  /** Tiny scroll event listener wrapper */
  scrollManager: ScrollManager

  /** Request animation frame callback returned id if used */
  animationFrameID: null | number

  // callbacks / events
  /** function assigned to the {@link onRender} callback */
  _onRenderCallback: () => void = () => {
    /* allow empty callback */
  }
  /** function assigned to the {@link onScroll} callback */
  _onScrollCallback: () => void = () => {
    /* allow empty callback */
  }
  /** function assigned to the {@link onError} callback */
  _onErrorCallback: () => void = () => {
    /* allow empty callback */
  }
  /** function assigned to the {@link onContextLost} callback */
  _onContextLostCallback: (info?: GPUDeviceLostInfo) => void = () => {
    /* allow empty callback */
  }

  /**
   * GPUCurtains constructor
   * @param parameters - {@link GPUCurtainsParams | parameters} used to create this {@link GPUCurtains}
   */
  constructor({
    container,
    pixelRatio = window.devicePixelRatio ?? 1,
    preferredFormat,
    alphaMode = 'premultiplied',
    production = false,
    multisampled = true,
    renderPass,
    camera,
    autoRender = true,
    autoResize = true,
    watchScroll = true,
  }: GPUCurtainsParams = {}) {
    this.type = 'CurtainsGPU'

    this.options = {
      container,
      pixelRatio,
      camera,
      production,
      preferredFormat,
      alphaMode,
      multisampled,
      renderPass,
      autoRender,
      autoResize,
      watchScroll,
    }

    this.setDeviceManager()

    if (container) {
      this.setContainer(container)
    }
  }

  /**
   * Set the {@link container}
   * @param container - {@link HTMLElement} or string representing an {@link HTMLElement} selector to use
   */
  setContainer(container: DOMElementParams['element']) {
    if (!container) {
      const container = document.createElement('div')
      container.setAttribute('id', 'curtains-gpu-canvas')
      document.body.appendChild(container)
      this.options.container = container
    } else {
      if (typeof container === 'string') {
        container = document.querySelector(container)

        if (!container) {
          const container = document.createElement('div')
          container.setAttribute('id', 'curtains-gpu-canvas')
          document.body.appendChild(container)
          this.options.container = container
        } else {
          this.options.container = container as HTMLElement
        }
      } else if (container instanceof Element) {
        this.options.container = container as HTMLElement
      }
    }

    this.container = this.options.container as HTMLElement

    this.setCurtains()
  }

  /**
   * Set the default {@link GPUCurtainsRenderer | renderer}
   */
  setMainRenderer() {
    this.createCurtainsRenderer({
      deviceManager: this.deviceManager,
      // TODO ...this.options?
      container: this.options.container,
      pixelRatio: this.options.pixelRatio,
      preferredFormat: this.options.preferredFormat,
      alphaMode: this.options.alphaMode,
      multisampled: this.options.multisampled,
      renderPass: this.options.renderPass,
      camera: this.options.camera,
    })
  }

  /**
   * Patch the options with default values before creating a {@link Renderer}
   * @param parameters - parameters to patch
   */
  patchRendererOptions<T extends GPURendererParams | GPUCameraRendererParams>(parameters: T): T {
    if (parameters.pixelRatio === undefined) parameters.pixelRatio = this.options.pixelRatio

    return parameters
  }

  /**
   * Create a new {@link GPURenderer} instance
   * @param parameters - {@link GPURendererParams | parameters} to use
   */
  createRenderer(parameters: GPURendererParams): GPURenderer {
    parameters = this.patchRendererOptions(parameters)

    return new GPURenderer({ ...parameters, deviceManager: this.deviceManager })
  }

  /**
   * Create a new {@link GPUCameraRenderer} instance
   * @param parameters - {@link GPUCameraRendererParams | parameters} to use
   */
  createCameraRenderer(parameters: GPUCameraRendererParams): GPUCameraRenderer {
    parameters = this.patchRendererOptions(parameters)

    return new GPUCameraRenderer({ ...parameters, deviceManager: this.deviceManager })
  }

  /**
   * Create a new {@link GPUCurtainsRenderer} instance
   * @param parameters - {@link GPUCameraRendererParams | parameters} to use
   */
  createCurtainsRenderer(parameters: GPUCameraRendererParams): GPUCurtainsRenderer {
    parameters = this.patchRendererOptions(parameters)

    return new GPUCurtainsRenderer({ ...parameters, deviceManager: this.deviceManager })
  }

  /**
   * Set our {@link GPUDeviceManager}
   */
  setDeviceManager() {
    this.deviceManager = new GPUDeviceManager({
      label: 'GPUCurtains default device',
      production: this.options.production,
      onError: () =>
        setTimeout(() => {
          this._onErrorCallback && this._onErrorCallback()
        }, 0),
      onDeviceLost: (info) => this._onContextLostCallback && this._onContextLostCallback(info),
    })
  }

  /**
   * Get all created {@link Renderer}
   * @readonly
   */
  get renderers(): Renderer[] {
    return this.deviceManager.renderers
  }

  /**
   * Get the default {@link GPUCurtainsRenderer} created
   * @readonly
   */
  get renderer(): GPUCurtainsRenderer {
    return this.renderers[0] as GPUCurtainsRenderer
  }

  /**
   * Set the {@link GPUDeviceManager} {@link GPUDeviceManager#adapter | adapter} and {@link GPUDeviceManager#device | device} if possible, then set all created {@link Renderer} contexts
   */
  async setDevice() {
    await this.deviceManager.init()
  }

  /**
   * Restore the {@link GPUDeviceManager#adapter | adapter} and {@link GPUDeviceManager#device | device}
   * @async
   */
  async restoreContext() {
    await this.deviceManager.restoreDevice()
  }

  /**
   * Set the various event listeners, set the {@link GPUCurtainsRenderer} and start rendering if needed
   */
  setCurtains() {
    this.initEvents()

    this.setMainRenderer()

    // only if auto render
    if (this.options.autoRender) {
      this.animate()
    }
  }

  /* RENDERER TRACKED OBJECTS */

  /**
   * Get all the created {@link PingPongPlane}
   * @readonly
   */
  get pingPongPlanes(): PingPongPlane[] {
    return this.renderers?.map((renderer) => renderer.pingPongPlanes).flat()
  }

  /**
   * Get all the created {@link ShaderPass}
   * @readonly
   */
  get shaderPasses(): ShaderPass[] {
    return this.renderers?.map((renderer) => renderer.shaderPasses).flat()
  }

  /**
   * Get all the created {@link ProjectedMesh | projected meshes}
   * @readonly
   */
  get meshes(): ProjectedMesh[] {
    return this.renderers?.map((renderer) => renderer.meshes).flat()
  }

  /**
   * Get all the created {@link DOMMesh | DOM Meshes} (including {@link Plane | planes})
   * @readonly
   */
  get domMeshes(): DOMMesh[] {
    return this.renderers
      ?.filter((renderer) => renderer instanceof GPUCurtainsRenderer)
      .map((renderer: GPUCurtainsRenderer) => renderer.domMeshes)
      .flat()
  }

  /**
   * Get all the created {@link Plane | planes}
   * @readonly
   */
  get planes(): Plane[] {
    return this.domMeshes.filter((domMesh) => domMesh instanceof Plane) as Plane[]
  }

  /**
   * Get all the created {@link ComputePass | compute passes}
   * @readonly
   */
  get computePasses(): ComputePass[] {
    return this.renderers?.map((renderer) => renderer.computePasses).flat()
  }

  /**
   * Get the {@link GPUCurtainsRenderer#camera | default GPUCurtainsRenderer camera}
   * @readonly
   */
  get camera(): Camera {
    return this.renderer?.camera
  }

  /**
   * Set the {@link GPUCurtainsRenderer#setPerspective | default GPUCurtainsRenderer camera} perspective
   * @param parameters - {@link CameraBasePerspectiveOptions | parameters} to use for the perspective
   */
  setPerspective({ fov = 50, near = 0.01, far = 50 }: CameraBasePerspectiveOptions = {}) {
    this.renderer?.setPerspective({ fov, near, far })
  }

  /**
   * Set the default {@link GPUCurtainsRenderer#setPerspective | default GPUCurtainsRenderer camera} {@link Camera#position | position}
   * @param position - new {@link Camera#position | position}
   */
  setCameraPosition(position: Vec3 = new Vec3(0, 0, 1)) {
    this.renderer?.setCameraPosition(position)
  }

  /**
   * Get our {@link GPUCurtainsRenderer#setPerspective | default GPUCurtainsRenderer bounding rectangle}
   */
  get boundingRect(): DOMElementBoundingRect {
    return this.renderer?.boundingRect
  }

  /* SCROLL */

  /**
   * Set the {@link scrollManager}
   */
  initScroll() {
    this.scrollManager = new ScrollManager({
      // init values
      scroll: {
        x: window.pageXOffset,
        y: window.pageYOffset,
      },
      delta: {
        x: 0,
        y: 0,
      },
      shouldWatch: this.options.watchScroll,
      onScroll: (delta) => this.updateScroll(delta),
    })
  }

  /**
   * Update all {@link DOMMesh#updateScrollPosition | DOMMesh scroll positions}
   * @param delta - last {@link ScrollManager#delta | scroll delta values}
   */
  updateScroll(delta: DOMPosition = { x: 0, y: 0 }) {
    this.domMeshes.forEach((mesh) => {
      if (mesh.domElement) {
        mesh.updateScrollPosition(delta)
      }
    })

    this._onScrollCallback && this._onScrollCallback()
  }

  /**
   * Update our {@link ScrollManager#scroll | scrollManager scroll values}. Called each time the scroll has changed if {@link GPUCurtains#options.watchScroll | watchScroll option} is set to true. Could be called externally as well.
   * @param scroll - new {@link DOMPosition | scroll values}
   */
  updateScrollValues(scroll: DOMPosition = { x: 0, y: 0 }) {
    this.scrollManager.updateScrollValues(scroll)
  }

  /**
   * Get our {@link ScrollManager#delta | scrollManager delta values}
   * @readonly
   */
  get scrollDelta(): DOMPosition {
    return this.scrollManager.delta
  }

  /**
   * Get our {@link ScrollManager#scroll | scrollManager scroll values}
   * @readonly
   */
  get scrollValues(): DOMPosition {
    return this.scrollManager.scroll
  }

  /* EVENT LISTENERS */

  /**
   * Set the resize and scroll event listeners
   */
  initEvents() {
    resizeManager.useObserver(this.options.autoResize)

    this.initScroll()
  }

  /* EVENTS */

  /**
   * Called at each render frame
   * @param callback - callback to run at each render
   * @returns - our {@link GPUCurtains}
   */
  onRender(callback: () => void): GPUCurtains {
    if (callback) {
      this._onRenderCallback = callback
    }

    return this
  }

  /**
   * Called each time the {@link ScrollManager#scroll | scrollManager scroll values} changed
   * @param callback - callback to run each time the {@link ScrollManager#scroll | scrollManager scroll values} changed
   * @returns - our {@link GPUCurtains}
   */
  onScroll(callback: () => void): GPUCurtains {
    if (callback) {
      this._onScrollCallback = callback
    }

    return this
  }

  /**
   * Called if there's been an error while trying to create the {@link GPUDeviceManager#device | device}
   * @param callback - callback to run if there's been an error while trying to create the {@link GPUDeviceManager#device | device}
   * @returns - our {@link GPUCurtains}
   */
  onError(callback: () => void): GPUCurtains {
    if (callback) {
      this._onErrorCallback = callback
    }

    return this
  }

  /**
   * Called whenever the {@link GPUDeviceManager#device | device} is lost
   * @param callback - callback to run whenever the {@link GPUDeviceManager#device | device} is lost
   * @returns - our {@link GPUCurtains}
   */
  onContextLost(callback: (info?: GPUDeviceLostInfo) => void): GPUCurtains {
    if (callback) {
      this._onContextLostCallback = callback
    }

    return this
  }

  /**
   * Create a requestAnimationFrame loop and run it
   */
  animate() {
    this.render()
    this.animationFrameID = window.requestAnimationFrame(this.animate.bind(this))
  }

  /**
   * Render our {@link GPUDeviceManager}
   */
  render() {
    this._onRenderCallback && this._onRenderCallback()

    this.deviceManager.render()
  }

  /**
   * Destroy our {@link GPUCurtains} and {@link GPUDeviceManager}
   */
  destroy() {
    if (this.animationFrameID) {
      window.cancelAnimationFrame(this.animationFrameID)
    }

    this.deviceManager.destroy()
    this.scrollManager?.destroy()
    resizeManager.destroy()
  }
}
