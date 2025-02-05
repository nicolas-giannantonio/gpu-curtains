import { PipelineManager } from '../pipelines/PipelineManager'
import { DOMElement, DOMElementBoundingRect } from '../DOM/DOMElement'
import { Scene } from '../scenes/Scene'
import { RenderPass, RenderPassParams } from '../renderPasses/RenderPass'
import { generateUUID, throwWarning } from '../../utils/utils'

import { ComputePass } from '../computePasses/ComputePass'
import { PingPongPlane } from '../../curtains/meshes/PingPongPlane'
import { ShaderPass } from '../renderPasses/ShaderPass'
import { RenderTarget } from '../renderPasses/RenderTarget'
import { Texture } from '../textures/Texture'
import { Sampler } from '../samplers/Sampler'

import { DOMMesh } from '../../curtains/meshes/DOMMesh'
import { Plane } from '../../curtains/meshes/Plane'
import { Mesh } from '../meshes/Mesh'
import { TasksQueueManager } from '../../utils/TasksQueueManager'
import { AllowedBindGroups } from '../../types/BindGroups'
import { RenderTexture } from '../textures/RenderTexture'
import { GPUDeviceManager } from './GPUDeviceManager'
import { FullscreenPlane } from '../meshes/FullscreenPlane'

/**
 * Parameters used to create a {@link GPURenderer}
 */
export interface GPURendererParams {
  /** The {@link GPUDeviceManager} used to create this {@link GPURenderer} */
  deviceManager: GPUDeviceManager
  /** {@link HTMLElement} or selector used as a container for our {@link GPURenderer#canvas | canvas} */
  container: string | HTMLElement
  /** Pixel ratio to use for rendering */
  pixelRatio?: number
  /** Texture rendering {@link GPUTextureFormat | preferred format} */
  preferredFormat?: GPUTextureFormat
  /** Set the {@link GPUCanvasContext | context} alpha mode */
  alphaMode?: GPUCanvasAlphaMode

  /** Whether the {@link GPURenderer} should add an extra {@link ShaderPass} MSAA pass after drawing the whole scene. */
  multisampled?: boolean

  /** The {@link GPURenderer#renderPass | renderer RenderPass} parameters */
  renderPass?: {
    /** Whether the {@link GPURenderer#renderPass | renderer RenderPass} should handle depth. Default to `true` */
    depth: RenderPassParams['depth']
    /** The {@link GPURenderer#renderPass | renderer RenderPass} sample count (i.e. whether it should use multisampled antialiasing). Default to `4` */
    sampleCount: RenderPassParams['sampleCount']
    /** The {@link GPUColor | color values} to clear to before drawing the {@link GPURenderer#renderPass | renderer RenderPass}. Default to `[0, 0, 0, 0]` */
    clearValue: GPUColor
  }
}

/** Any Mesh that is bound to a DOM Element */
export type DOMProjectedMesh = DOMMesh | Plane
/** Any Mesh that is projected (i.e use a {@link core/camera/Camera.Camera | Camera} to compute a model view projection matrix) */
export type ProjectedMesh = Mesh | DOMProjectedMesh
/** Any Mesh that can be drawn, including fullscreen quad meshes used for post processing */
export type RenderedMesh = ProjectedMesh | PingPongPlane | ShaderPass | FullscreenPlane
/** Any Mesh or Compute pass */
export type SceneObject = RenderedMesh | ComputePass

/**
 * Base renderer class, that could technically be used to render compute passes and draw fullscreen quads, even tho it is strongly advised to use at least the {@link core/renderers/GPUCameraRenderer.GPUCameraRenderer | GPUCameraRenderer} class instead.
 * A renderer is responsible for:
 * - Setting a {@link GPUCanvasContext | context}
 * - Handling the {@link HTMLCanvasElement | canvas} onto everything is drawn
 * - Creating a {@link RenderPass} that will handle our render and depth textures and the render pass descriptor
 * - Keeping track of every specific class objects created relative to computing and rendering
 * - Creating a {@link Scene} class that will take care of the rendering process of all previously mentioned objects
 */
export class GPURenderer {
  /** The type of the {@link GPURenderer} */
  type: string
  /** The universal unique id of this {@link GPURenderer} */
  readonly uuid: string

  /** The {@link GPUDeviceManager} used to create this {@link GPURenderer} */
  deviceManager: GPUDeviceManager

  /** {@link HTMLCanvasElement} onto everything is drawn */
  canvas: HTMLCanvasElement
  /** The WebGPU {@link GPUCanvasContext | context} used */
  context: null | GPUCanvasContext
  /** Set the {@link GPUCanvasContext | context} alpha mode */
  alphaMode?: GPUCanvasAlphaMode

  /** Options used to create this {@link GPURenderer} */
  options: GPURendererParams

  /** Whether the {@link GPURenderer} should add an extra {@link ShaderPass} MSAA pass after drawing the whole scene. */
  multisampled: boolean
  /** The {@link RenderPass | render pass} used to render our result to screen */
  renderPass: RenderPass
  /** Additional {@link RenderPass | render pass} used by {@link ShaderPass} for compositing / post processing. Does not handle depth */
  postProcessingPass: RenderPass

  /** {@link RenderPass | Multisampled render pass} used by an internal {@link ShaderPass} for MSAA, if {@link multisampled} is set to `true` */
  //multisamplingPass: RenderPass | undefined

  /** The {@link Scene} used */
  scene: Scene

  /** An array containing all our created {@link ComputePass} */
  computePasses: ComputePass[]
  /** An array containing all our created {@link PingPongPlane} */
  pingPongPlanes: PingPongPlane[]
  /** An array containing all our created {@link ShaderPass} */
  shaderPasses: ShaderPass[]
  /** An array containing all our created {@link RenderTarget} */
  renderTargets: RenderTarget[]
  /** An array containing all our created {@link ProjectedMesh | projected meshes} */
  meshes: ProjectedMesh[]
  /** An array containing all our created {@link RenderTexture} */
  renderTextures: RenderTexture[]

  /** Pixel ratio to use for rendering */
  pixelRatio: number

  /** {@link DOMElement} that will track our canvas container size */
  domElement: DOMElement

  /** Allow to add callbacks to be executed at each render before the {@link GPUCommandEncoder} is created */
  onBeforeCommandEncoderCreation: TasksQueueManager
  /** Allow to add callbacks to be executed at each render after the {@link GPUCommandEncoder} has been created but before the {@link Scene} is rendered */
  onBeforeRenderScene: TasksQueueManager
  /** Allow to add callbacks to be executed at each render after the {@link GPUCommandEncoder} has been created and after the {@link Scene} has been rendered */
  onAfterRenderScene: TasksQueueManager
  /** Allow to add callbacks to be executed at each render after the {@link Scene} has been rendered and the {@link GPUCommandEncoder} has been submitted */
  onAfterCommandEncoderSubmission: TasksQueueManager

  // callbacks / events
  /** function assigned to the {@link onBeforeRender} callback */
  _onBeforeRenderCallback = (commandEncoder: GPUCommandEncoder) => {
    /* allow empty callback */
  }
  /** function assigned to the {@link onAfterRender} callback */
  _onAfterRenderCallback = (commandEncoder: GPUCommandEncoder) => {
    /* allow empty callback */
  }
  /** function assigned to the {@link onAfterResize} callback */
  _onAfterResizeCallback: () => void = () => {
    /* allow empty callback */
  }

  /**
   * GPURenderer constructor
   * @param parameters - {@link GPURendererParams | parameters} used to create this {@link GPURenderer}
   */
  constructor({
    deviceManager,
    container,
    pixelRatio = 1,
    preferredFormat,
    alphaMode = 'premultiplied',
    multisampled = true,
    renderPass,
  }: GPURendererParams) {
    this.type = 'GPURenderer'
    this.uuid = generateUUID()

    this.deviceManager = deviceManager
    this.deviceManager.addRenderer(this)

    // render pass default values
    renderPass = { ...{ depth: true, sampleCount: 4, clearValue: [0, 0, 0, 0] }, ...renderPass }
    preferredFormat = preferredFormat ?? this.deviceManager.gpu?.getPreferredCanvasFormat()

    this.options = {
      deviceManager,
      container,
      pixelRatio,
      preferredFormat,
      alphaMode,
      multisampled,
      renderPass,
    }

    this.pixelRatio = pixelRatio ?? window.devicePixelRatio ?? 1
    this.alphaMode = alphaMode

    this.setTasksQueues()
    this.setRendererObjects()

    // create the canvas
    const isContainerCanvas = container instanceof HTMLCanvasElement
    this.canvas = isContainerCanvas ? (container as HTMLCanvasElement) : document.createElement('canvas')

    // needed to get container bounding box
    this.domElement = new DOMElement({
      element: container,
      priority: 5, // renderer callback need to be called first
      onSizeChanged: (boundingRect) => this.resize(boundingRect),
    })

    if (!isContainerCanvas) {
      // append the canvas
      this.domElement.element.appendChild(this.canvas)
    }

    // device is already available? create the context!
    if (this.deviceManager.device) {
      this.setContext()
    }
  }

  /**
   * Set {@link canvas} size
   * @param boundingRect - new {@link domElement | DOM Element} {@link DOMElement#boundingRect | bounding rectangle}
   */
  setSize(boundingRect: DOMElementBoundingRect) {
    const devicePixelRatio = window.devicePixelRatio ?? 1
    const scaleBoundingRect = this.pixelRatio / devicePixelRatio

    this.canvas.style.width = Math.floor(boundingRect.width) + 'px'
    this.canvas.style.height = Math.floor(boundingRect.height) + 'px'

    const renderingSize = {
      width: Math.floor(boundingRect.width * scaleBoundingRect),
      height: Math.floor(boundingRect.height * scaleBoundingRect),
    }

    this.canvas.width = this.device
      ? Math.min(renderingSize.width, this.device.limits.maxTextureDimension2D)
      : renderingSize.width
    this.canvas.height = this.device
      ? Math.min(renderingSize.height, this.device.limits.maxTextureDimension2D)
      : renderingSize.height
  }

  /**
   * Resize our {@link GPURenderer}
   * @param boundingRect - new {@link domElement | DOM Element} {@link DOMElement#boundingRect | bounding rectangle}
   */
  resize(boundingRect: DOMElementBoundingRect | null = null) {
    if (!this.domElement && !boundingRect) return

    if (!boundingRect) boundingRect = this.domElement.element.getBoundingClientRect()

    this.setSize(boundingRect)

    this.onResize()

    this._onAfterResizeCallback && this._onAfterResizeCallback()
  }

  /**
   * Resize all tracked objects
   */
  onResize() {
    // resize render & shader passes
    this.renderPass?.resize()
    this.postProcessingPass?.resize()
    //this.multisamplingPass?.resize()

    this.renderTargets.forEach((renderTarget) => renderTarget.resize(this.pixelRatioBoundingRect))
    this.renderTextures.forEach((renderTexture) => renderTexture.resize())

    // force compute passes onAfterResize callback
    this.computePasses.forEach((computePass) => computePass.resize())

    // now resize meshes that are bound to the renderer size
    // especially useful to resize render textures
    this.pingPongPlanes.forEach((pingPongPlane) => pingPongPlane.resize(this.boundingRect))
    this.shaderPasses.forEach((shaderPass) => shaderPass.resize(this.boundingRect))
    this.meshes.forEach((mesh) => {
      if (!('domElement' in mesh)) {
        // resize meshes that do not have a bound DOM element
        mesh.resize(this.boundingRect)
      } else {
        this.onBeforeCommandEncoderCreation.add(
          () => {
            // update position for DOM meshes only if they're not currently being resized
            if (!mesh.domElement.isResizing) {
              mesh.domElement.setSize()
            }
          },
          { once: true }
        )
      }
    })
  }

  /**
   * Get our {@link domElement | DOM Element} {@link DOMElement#boundingRect | bounding rectangle}
   */
  get boundingRect(): DOMElementBoundingRect {
    if (!!this.domElement.boundingRect) {
      return this.domElement.boundingRect
    } else {
      const boundingRect = this.domElement.element?.getBoundingClientRect()
      return {
        top: boundingRect.top,
        right: boundingRect.right,
        bottom: boundingRect.bottom,
        left: boundingRect.left,
        width: boundingRect.width,
        height: boundingRect.height,
        x: boundingRect.x,
        y: boundingRect.y,
      }
    }
  }

  /**
   * Get our {@link domElement | DOM Element} {@link DOMElement#boundingRect | bounding rectangle} accounting for current {@link pixelRatio | pixel ratio}
   */
  get pixelRatioBoundingRect(): DOMElementBoundingRect {
    const devicePixelRatio = window.devicePixelRatio ?? 1
    const scaleBoundingRect = this.pixelRatio / devicePixelRatio

    return Object.keys(this.boundingRect).reduce(
      (a, key) => ({ ...a, [key]: this.boundingRect[key] * scaleBoundingRect }),
      {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      }
    )
  }

  /* USEFUL DEVICE MANAGER OBJECTS */

  /**
   * Get our {@link GPUDeviceManager#device | device}
   * @readonly
   */
  get device(): GPUDevice | undefined {
    return this.deviceManager.device
  }

  /**
   * Get whether our {@link GPUDeviceManager} is ready (i.e. its {@link GPUDeviceManager#adapter | adapter} and {@link GPUDeviceManager#device | device} are set) its {@link context} is set and its size is set
   * @readonly
   */
  get ready(): boolean {
    return this.deviceManager.ready && !!this.context && !!this.canvas.style.width
  }

  /**
   * Get our {@link GPUDeviceManager#production | GPUDeviceManager production flag}
   * @readonly
   */
  get production(): boolean {
    return this.deviceManager.production
  }

  /**
   * Get all the created {@link GPUDeviceManager#samplers | samplers}
   * @readonly
   */
  get samplers(): Sampler[] {
    return this.deviceManager.samplers
  }

  /**
   * Get all the created {@link GPUDeviceManager#buffers | GPU buffers}
   * @readonly
   */
  get buffers(): GPUBuffer[] {
    return this.deviceManager.buffers
  }

  /**
   * Get the {@link GPUDeviceManager#pipelineManager | pipeline manager}
   * @readonly
   */
  get pipelineManager(): PipelineManager {
    return this.deviceManager.pipelineManager
  }

  /**
   * Get all the rendered objects (i.e. compute passes, meshes, ping pong planes and shader passes) created by the {@link GPUDeviceManager}
   * @readonly
   */
  get deviceRenderedObjects(): SceneObject[] {
    return this.deviceManager.deviceRenderedObjects
  }

  /**
   * Configure our {@link context} with the given options
   */
  configureContext() {
    this.context.configure({
      device: this.device,
      format: this.options.preferredFormat,
      alphaMode: this.alphaMode,
      // needed so we can copy textures for post processing usage
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
      //viewFormats: []
    })
  }

  /**
   * Set our {@link context} if possible and set {@link renderPass | main render pass} and {@link scene}
   */
  setContext() {
    this.context = this.canvas.getContext('webgpu')

    if (this.device) {
      this.configureContext()

      this.setMainRenderPasses()
      this.setScene()
    }
  }

  /**
   * Called when the {@link GPUDeviceManager#device | device} is lost.
   * Force all our scene objects to lose context.
   */
  loseContext() {
    // force all our scene objects to lose context
    this.renderedObjects.forEach((sceneObject) => sceneObject.loseContext())
  }

  /**
   * Called when the {@link GPUDeviceManager#device | device} should be restored.
   * Configure the context again, resize the {@link RenderTarget | render targets} and {@link RenderTexture | render textures}, restore our {@link renderedObjects | rendered objects} context.
   * @async
   */
  restoreContext() {
    this.configureContext()

    // recreate all render textures first
    this.renderTextures.forEach((renderTexture) => {
      renderTexture.forceResize({
        width: Math.floor(this.pixelRatioBoundingRect.width),
        height: Math.floor(this.pixelRatioBoundingRect.height),
        depth: 1,
      })
    })

    // resize render passes/recreate their textures
    this.renderPass?.resize()
    this.postProcessingPass?.resize()
    //this.multisamplingPass?.resize()

    this.renderTargets.forEach((renderTarget) => renderTarget.resize(this.pixelRatioBoundingRect))

    // restore context of all our scene objects
    this.renderedObjects.forEach((sceneObject) => sceneObject.restoreContext())
  }

  /* PIPELINES, SCENE & MAIN RENDER PASS */

  /**
   * Set our {@link renderPass | main render pass} that will be used to render the result of our draw commands back to the screen
   */
  setMainRenderPasses() {
    // TODO handle multisampling differently?
    // cf: https://webgpufundamentals.org/webgpu/lessons/webgpu-multisampling.html#you-do-not-have-to-set-a-resolve-target-on-every-render-pass
    this.renderPass = new RenderPass(this, {
      label: 'Main render pass',
      targetFormat: this.options.preferredFormat,
      ...this.options.renderPass,
    })

    this.postProcessingPass = new RenderPass(this, {
      label: 'Post processing render pass',
      targetFormat: this.options.preferredFormat,
      depth: false,
      sampleCount: this.options.renderPass.sampleCount, // TODO?
    })

    // TODO
    // if (this.options.multisampled) {
    //   this.multisamplingPass = new RenderPass(this, {
    //     label: 'MSAA render pass',
    //     targetFormat: this.options.preferredFormat,
    //     depth: false,
    //     loadOp: 'load',
    //     sampleCount: 4,
    //   })
    //
    //   const resolveTexture = new RenderTexture(this, {
    //     label: 'MSAA render pass resolve texture',
    //     name: 'resolveTexture',
    //     format: this.options.preferredFormat,
    //   })
    //
    //   this.multisamplingPass.descriptor.colorAttachments[0].resolveTarget = resolveTexture.texture.createView({
    //     label: 'MSAA render pass resolve texture view',
    //   })
    // }
  }

  /**
   * Set our {@link scene}
   */
  setScene() {
    this.scene = new Scene({ renderer: this })
  }

  /* BUFFERS & BINDINGS */

  /**
   * Create a {@link GPUBuffer}
   * @param bufferDescriptor - {@link GPUBufferDescriptor | GPU buffer descriptor}
   * @returns - newly created {@link GPUBuffer}
   */
  createBuffer(bufferDescriptor: GPUBufferDescriptor): GPUBuffer {
    const buffer = this.device?.createBuffer(bufferDescriptor)
    this.deviceManager.addBuffer(buffer)
    return buffer
  }

  /**
   * Remove a {@link GPUBuffer} from our {@link GPUDeviceManager#buffers | GPU buffers array}
   * @param buffer - {@link GPUBuffer} to remove
   * @param [originalLabel] - original {@link GPUBuffer} label in case the buffer has been swapped and its label has changed
   */
  removeBuffer(buffer: GPUBuffer, originalLabel?: string) {
    this.deviceManager.removeBuffer(buffer, originalLabel)
  }

  /**
   * Write to a {@link GPUBuffer}
   * @param buffer - {@link GPUBuffer} to write to
   * @param bufferOffset - {@link GPUSize64 | buffer offset}
   * @param data - {@link BufferSource | data} to write
   */
  queueWriteBuffer(buffer: GPUBuffer, bufferOffset: GPUSize64, data: BufferSource) {
    this.device?.queue.writeBuffer(buffer, bufferOffset, data)
  }

  /**
   * Copy a source {@link GPUBuffer} into a destination {@link GPUBuffer}
   * @param parameters - parameters used to realize the copy
   * @param parameters.srcBuffer - source {@link GPUBuffer}
   * @param [parameters.dstBuffer] - destination {@link GPUBuffer}. Will create a new one if none provided.
   * @param [parameters.commandEncoder] - {@link GPUCommandEncoder} to use for the copy. Will create a new one and submit the command buffer if none provided.
   * @returns - destination {@link GPUBuffer} after copy
   */
  copyBufferToBuffer({
    srcBuffer,
    dstBuffer,
    commandEncoder,
  }: {
    srcBuffer: GPUBuffer
    dstBuffer?: GPUBuffer
    commandEncoder?: GPUCommandEncoder
  }): GPUBuffer | null {
    if (!srcBuffer) {
      throwWarning(`${this.type}: cannot copy to buffer because the source buffer has not been provided`)
      return null
    }

    if (!dstBuffer) {
      dstBuffer = this.createBuffer({
        label: this.type + ': destination copy buffer from: ' + srcBuffer.label,
        size: srcBuffer.size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      })
    }

    if (srcBuffer.mapState !== 'unmapped') {
      throwWarning(`${this.type}: Cannot copy from ${srcBuffer} because it is currently mapped`)
      return
    }
    if (dstBuffer.mapState !== 'unmapped') {
      throwWarning(`${this.type}: Cannot copy from ${dstBuffer} because it is currently mapped`)
      return
    }

    // if there's no command encoder provided, we'll have to create one and submit it after the copy process
    const hasCommandEncoder = !!commandEncoder

    if (!hasCommandEncoder) {
      commandEncoder = this.device?.createCommandEncoder({ label: 'Copy buffer command encoder' })
    }

    commandEncoder.copyBufferToBuffer(srcBuffer, 0, dstBuffer, 0, dstBuffer.size)

    if (!hasCommandEncoder) {
      const commandBuffer = commandEncoder.finish()
      this.device?.queue.submit([commandBuffer])
    }

    return dstBuffer
  }

  /* BIND GROUPS & LAYOUTS */

  /**
   * Get all created {@link AllowedBindGroups | bind group} tracked by our {@link GPUDeviceManager}
   * @readonly
   */
  get bindGroups(): AllowedBindGroups[] {
    return this.deviceManager.bindGroups
  }

  /**
   * Add a {@link AllowedBindGroups | bind group} to our {@link GPUDeviceManager#bindGroups | bind groups array}
   * @param bindGroup - {@link AllowedBindGroups | bind group} to add
   */
  addBindGroup(bindGroup: AllowedBindGroups) {
    this.deviceManager.addBindGroup(bindGroup)
  }

  /**
   * Remove a {@link AllowedBindGroups | bind group} from our {@link GPUDeviceManager#bindGroups | bind groups array}
   * @param bindGroup - {@link AllowedBindGroups | bind group} to remove
   */
  removeBindGroup(bindGroup: AllowedBindGroups) {
    this.deviceManager.removeBindGroup(bindGroup)
  }

  /**
   * Create a {@link GPUBindGroupLayout}
   * @param bindGroupLayoutDescriptor - {@link GPUBindGroupLayoutDescriptor | GPU bind group layout descriptor}
   * @returns - newly created {@link GPUBindGroupLayout}
   */
  createBindGroupLayout(bindGroupLayoutDescriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
    return this.device?.createBindGroupLayout(bindGroupLayoutDescriptor)
  }

  /**
   * Create a {@link GPUBindGroup}
   * @param bindGroupDescriptor - {@link GPUBindGroupDescriptor | GPU bind group descriptor}
   * @returns - newly created {@link GPUBindGroup}
   */
  createBindGroup(bindGroupDescriptor: GPUBindGroupDescriptor): GPUBindGroup {
    return this.device?.createBindGroup(bindGroupDescriptor)
  }

  /* SHADERS & PIPELINES */

  /**
   * Create a {@link GPUShaderModule}
   * @param shaderModuleDescriptor - {@link shaderModuleDescriptor | shader module descriptor}
   * @returns - newly created {@link GPUShaderModule}
   */
  createShaderModule(shaderModuleDescriptor: GPUShaderModuleDescriptor): GPUShaderModule {
    return this.device?.createShaderModule(shaderModuleDescriptor)
  }

  /**
   * Create a {@link GPUPipelineLayout}
   * @param pipelineLayoutDescriptor - {@link GPUPipelineLayoutDescriptor | GPU pipeline layout descriptor}
   * @returns - newly created {@link GPUPipelineLayout}
   */
  createPipelineLayout(pipelineLayoutDescriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout {
    return this.device?.createPipelineLayout(pipelineLayoutDescriptor)
  }

  /**
   * Create a {@link GPURenderPipeline}
   * @param pipelineDescriptor - {@link GPURenderPipelineDescriptor | GPU render pipeline descriptor}
   * @returns - newly created {@link GPURenderPipeline}
   */
  createRenderPipeline(pipelineDescriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
    return this.device?.createRenderPipeline(pipelineDescriptor)
  }

  /**
   * Asynchronously create a {@link GPURenderPipeline}
   * @async
   * @param pipelineDescriptor - {@link GPURenderPipelineDescriptor | GPU render pipeline descriptor}
   * @returns - newly created {@link GPURenderPipeline}
   */
  async createRenderPipelineAsync(pipelineDescriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline> {
    return await this.device?.createRenderPipelineAsync(pipelineDescriptor)
  }

  /**
   * Create a {@link GPUComputePipeline}
   * @param pipelineDescriptor - {@link GPUComputePipelineDescriptor | GPU compute pipeline descriptor}
   * @returns - newly created {@link GPUComputePipeline}
   */
  createComputePipeline(pipelineDescriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
    return this.device?.createComputePipeline(pipelineDescriptor)
  }

  /**
   * Asynchronously create a {@link GPUComputePipeline}
   * @async
   * @param pipelineDescriptor - {@link GPUComputePipelineDescriptor | GPU compute pipeline descriptor}
   * @returns - newly created {@link GPUComputePipeline}
   */
  async createComputePipelineAsync(pipelineDescriptor: GPUComputePipelineDescriptor): Promise<GPUComputePipeline> {
    return await this.device?.createComputePipelineAsync(pipelineDescriptor)
  }

  /* TEXTURES */

  /**
   * Get all created {@link Texture} tracked by our {@link GPUDeviceManager}
   * @readonly
   */
  get textures(): Texture[] {
    return this.deviceManager.textures
  }

  /**
   * Add a {@link Texture} to our {@link GPUDeviceManager#textures | textures array}
   * @param texture - {@link Texture} to add
   */
  addTexture(texture: Texture) {
    this.deviceManager.addTexture(texture)
  }

  /**
   * Remove a {@link Texture} from our {@link GPUDeviceManager#textures | textures array}
   * @param texture - {@link Texture} to remove
   */
  removeTexture(texture: Texture) {
    this.deviceManager.removeTexture(texture)
  }

  /**
   * Add a {@link RenderTexture} to our {@link renderTextures} array
   * @param texture - {@link RenderTexture} to add
   */
  addRenderTexture(texture: RenderTexture) {
    this.renderTextures.push(texture)
  }

  /**
   * Remove a {@link RenderTexture} from our {@link renderTextures} array
   * @param texture - {@link RenderTexture} to remove
   */
  removeRenderTexture(texture: RenderTexture) {
    this.renderTextures = this.renderTextures.filter((t) => t.uuid !== texture.uuid)
  }

  /**
   * Create a {@link GPUTexture}
   * @param textureDescriptor - {@link GPUTextureDescriptor | GPU texture descriptor}
   * @returns - newly created {@link GPUTexture}
   */
  createTexture(textureDescriptor: GPUTextureDescriptor): GPUTexture {
    return this.device?.createTexture(textureDescriptor)
  }

  /**
   * Upload a {@link Texture#texture | texture} to the GPU
   * @param texture - {@link Texture} class object with the {@link Texture#texture | texture} to upload
   */
  uploadTexture(texture: Texture) {
    this.deviceManager.uploadTexture(texture)
  }

  /**
   * Import a {@link GPUExternalTexture}
   * @param video - {@link HTMLVideoElement} source
   * @returns - {@link GPUExternalTexture}
   */
  importExternalTexture(video: HTMLVideoElement): GPUExternalTexture {
    // TODO WebCodecs may be the way to go when time comes!
    // https://developer.chrome.com/blog/new-in-webgpu-113/#use-webcodecs-videoframe-source-in-importexternaltexture
    // see onVideoFrameCallback method in Texture class
    // const videoFrame = new VideoFrame(video)
    // return this.device?.importExternalTexture({ source: videoFrame })
    return this.device?.importExternalTexture({ source: video })
  }

  /**
   * Check if a {@link Sampler} has already been created with the same {@link Sampler#options | parameters}.
   * Use it if found, else create a new one and add it to the {@link GPUDeviceManager#samplers | samplers array}.
   * @param sampler - {@link Sampler} to create
   * @returns - the {@link GPUSampler}
   */
  createSampler(sampler: Sampler): GPUSampler {
    const existingSampler = this.samplers.find((existingSampler) => {
      return JSON.stringify(existingSampler.options) === JSON.stringify(sampler.options) && existingSampler.sampler
    })

    if (existingSampler) {
      return existingSampler.sampler
    } else {
      const { type, ...samplerOptions } = sampler.options
      const gpuSampler: GPUSampler = this.device?.createSampler({
        label: sampler.label,
        ...samplerOptions,
      })

      this.deviceManager.addSampler(sampler)

      return gpuSampler
    }
  }

  /**
   * Remove a {@link Sampler} from our {@link GPUDeviceManager#samplers | samplers array}
   * @param sampler - {@link Sampler} to remove
   */
  removeSampler(sampler: Sampler) {
    this.deviceManager.removeSampler(sampler)
  }

  /* OBJECTS & TASKS */

  /**
   * Set different tasks queue managers to execute callbacks at different phases of our render call:
   * - {@link onBeforeCommandEncoderCreation}: callbacks executed before the creation of the command encoder
   * - {@link onBeforeRenderScene}: callbacks executed after the creation of the command encoder and before rendering the {@link Scene}
   * - {@link onAfterRenderScene}: callbacks executed after the creation of the command encoder and after rendering the {@link Scene}
   * - {@link onAfterCommandEncoderSubmission}: callbacks executed after the submission of the command encoder
   */
  setTasksQueues() {
    this.onBeforeCommandEncoderCreation = new TasksQueueManager()
    this.onBeforeRenderScene = new TasksQueueManager()
    this.onAfterRenderScene = new TasksQueueManager()
    this.onAfterCommandEncoderSubmission = new TasksQueueManager()
  }

  /**
   * Set all objects arrays that we'll keep track of
   */
  setRendererObjects() {
    // keep track of compute passes, meshes, etc.
    this.computePasses = []
    this.pingPongPlanes = []
    this.shaderPasses = []
    this.renderTargets = []
    this.meshes = []
    this.renderTextures = []
  }

  /**
   * Get all this {@link GPURenderer} rendered objects (i.e. compute passes, meshes, ping pong planes and shader passes)
   * @readonly
   */
  get renderedObjects(): SceneObject[] {
    return [...this.computePasses, ...this.meshes, ...this.shaderPasses, ...this.pingPongPlanes]
  }

  /**
   * Get all objects ({@link RenderedMesh | rendered meshes} or {@link ComputePass | compute passes}) using a given {@link AllowedBindGroups | bind group}.
   * Useful to know if a resource is used by multiple objects and if it is safe to destroy it or not.
   * @param bindGroup - {@link AllowedBindGroups | bind group} to check
   */
  getObjectsByBindGroup(bindGroup: AllowedBindGroups): undefined | SceneObject[] {
    return this.deviceRenderedObjects.filter((object) => {
      return [
        ...object.material.bindGroups,
        ...object.material.inputsBindGroups,
        ...object.material.clonedBindGroups,
      ].some((bG) => bG.uuid === bindGroup.uuid)
    })
  }

  /**
   * Get all objects ({@link RenderedMesh | rendered meshes} or {@link ComputePass | compute passes}) using a given {@link Texture} or {@link RenderTexture}.
   * Useful to know if a resource is used by multiple objects and if it is safe to destroy it or not.
   * @param texture - {@link Texture} or {@link RenderTexture} to check
   */
  getObjectsByTexture(texture: Texture | RenderTexture): undefined | SceneObject[] {
    return this.deviceRenderedObjects.filter((object) => {
      return [...object.material.textures, ...object.material.renderTextures].some((t) => t.uuid === texture.uuid)
    })
  }

  /* EVENTS */

  /**
   * Assign a callback function to _onBeforeRenderCallback
   * @param callback - callback to run just before the {@link render} method will be executed
   * @returns - our {@link GPURenderer}
   */
  onBeforeRender(callback: (commandEncoder?: GPUCommandEncoder) => void) {
    if (callback) {
      this._onBeforeRenderCallback = callback
    }

    return this
  }

  /**
   * Assign a callback function to _onAfterRenderCallback
   * @param callback - callback to run just after the {@link render} method has been executed
   * @returns - our {@link GPURenderer}
   */
  onAfterRender(callback: (commandEncoder?: GPUCommandEncoder) => void) {
    if (callback) {
      this._onAfterRenderCallback = callback
    }

    return this
  }

  /**
   * Assign a callback function to _onAfterResizeCallback
   * @param callback - callback to run just after the {@link GPURenderer} has been resized
   * @returns - our {@link GPURenderer}
   */
  onAfterResize(callback: (commandEncoder?: GPUCommandEncoder) => void) {
    if (callback) {
      this._onAfterResizeCallback = callback
    }

    return this
  }

  /* RENDER */

  /**
   * Set the current {@link RenderPass#descriptor | render pass descriptor} texture {@link GPURenderPassColorAttachment#view | view} and {@link GPURenderPassColorAttachment#resolveTarget | resolveTarget} (depending on whether we're using multisampling)
   * @param renderPass - current {@link RenderPass}
   * @param renderTexture - {@link GPUTexture} to use, or the {@link context} {@link GPUTexture | current texture} if null
   * @returns - the {@link GPUTexture | current render texture}
   */
  setRenderPassCurrentTexture(renderPass: RenderPass, renderTexture: GPUTexture | null = null) {
    if (!renderTexture) {
      renderTexture = this.context.getCurrentTexture()
      renderTexture.label = `${this.type} context current texture`
    }

    if (renderPass.options.sampleCount > 1) {
      renderPass.descriptor.colorAttachments[0].view = renderPass.viewTexture.texture.createView({
        label: renderPass.viewTexture.options.label + ' view',
      })
      renderPass.descriptor.colorAttachments[0].resolveTarget = renderTexture.createView({
        label: renderTexture.label + ' resolve target view',
      })
    } else {
      renderPass.descriptor.colorAttachments[0].view = renderTexture.createView({
        label: renderTexture.label + ' view',
      })
    }

    return renderTexture
  }

  /**
   * Render a single {@link ComputePass}
   * @param commandEncoder - current {@link GPUCommandEncoder}
   * @param computePass - {@link ComputePass}
   */
  renderSingleComputePass(commandEncoder: GPUCommandEncoder, computePass: ComputePass) {
    const pass = commandEncoder.beginComputePass()
    computePass.render(pass)
    pass.end()

    computePass.copyBufferToResult(commandEncoder)
  }

  /**
   * Render a single {@link RenderedMesh | Mesh}
   * @param commandEncoder - current {@link GPUCommandEncoder}
   * @param mesh - {@link RenderedMesh | Mesh} to render
   */
  renderSingleMesh(commandEncoder: GPUCommandEncoder, mesh: RenderedMesh) {
    const pass = commandEncoder.beginRenderPass(this.renderPass.descriptor)
    mesh.render(pass)
    pass.end()
  }

  /**
   * Render an array of objects (either {@link RenderedMesh | Meshes} or {@link ComputePass}) once. This method won't call any of the renderer render hooks like {@link onBeforeRender}, {@link onAfterRender}
   * @param objects - Array of {@link RenderedMesh | Meshes} or {@link ComputePass} to render
   */
  renderOnce(objects: SceneObject[]) {
    const commandEncoder = this.device?.createCommandEncoder({
      label: 'Renderer once command encoder',
    })

    this.pipelineManager.resetCurrentPipeline()

    objects.forEach((object) => {
      if (object instanceof ComputePass) {
        this.renderSingleComputePass(commandEncoder, object)
      } else {
        this.renderSingleMesh(commandEncoder, object)
      }
    })

    const commandBuffer = commandEncoder.finish()
    this.device?.queue.submit([commandBuffer])

    this.pipelineManager.resetCurrentPipeline()
  }

  /**
   * Force to clear a {@link GPURenderer} content to its {@link RenderPass#options.clearValue | clear value} by rendering and empty pass.
   * @param commandEncoder
   */
  forceClear(commandEncoder?: GPUCommandEncoder) {
    // if there's no command encoder provided, we'll have to create one and submit it after the copy process
    const hasCommandEncoder = !!commandEncoder

    if (!hasCommandEncoder) {
      commandEncoder = this.device?.createCommandEncoder({ label: 'Force clear command encoder' })
    }

    this.setRenderPassCurrentTexture(this.renderPass)
    const pass = commandEncoder.beginRenderPass(this.renderPass.descriptor)
    pass.end()

    if (!hasCommandEncoder) {
      const commandBuffer = commandEncoder.finish()
      this.device?.queue.submit([commandBuffer])
    }
  }

  /**
   * Called by the {@link GPUDeviceManager#render | GPUDeviceManager render method} before the {@link GPUCommandEncoder} has been created
   */
  onBeforeCommandEncoder() {
    if (!this.ready) return
    // now render!
    this.onBeforeCommandEncoderCreation.execute()
  }

  /**
   * Called by the {@link GPUDeviceManager#render | GPUDeviceManager render method} after the {@link GPUCommandEncoder} has been created.
   */
  onAfterCommandEncoder() {
    if (!this.ready) return

    this.onAfterCommandEncoderSubmission.execute()
  }

  /**
   * Called at each draw call to render our scene and its content
   * @param commandEncoder - current {@link GPUCommandEncoder}
   */
  render(commandEncoder: GPUCommandEncoder) {
    if (!this.ready) return

    this._onBeforeRenderCallback && this._onBeforeRenderCallback(commandEncoder)
    this.onBeforeRenderScene.execute(commandEncoder)

    this.scene?.render(commandEncoder)

    // TODO not working
    // if (this.options.multisampled && this.multisamplingPass) {
    //   const pass = commandEncoder.beginRenderPass(this.multisamplingPass.descriptor)
    //   pass.end()
    // }

    this._onAfterRenderCallback && this._onAfterRenderCallback(commandEncoder)
    this.onAfterRenderScene.execute(commandEncoder)
  }

  /**
   * Destroy our {@link GPURenderer} and everything that needs to be destroyed as well
   */
  destroy() {
    this.domElement?.destroy()

    // destroy render passes
    this.renderPass?.destroy()
    this.postProcessingPass?.destroy()
    //this.multisamplingPass?.destroy()

    this.renderTargets.forEach((renderTarget) => renderTarget.destroy())
    this.renderedObjects.forEach((sceneObject) => sceneObject.remove())

    this.renderTextures.forEach((texture) => texture.destroy())

    this.context?.unconfigure()
  }
}
