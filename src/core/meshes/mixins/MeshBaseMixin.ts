import { generateUUID, throwWarning } from '../../../utils/utils'
import { isRenderer, Renderer } from '../../renderers/utils'
import { RenderMaterial } from '../../materials/RenderMaterial'
import { Texture } from '../../textures/Texture'
import { Geometry } from '../../geometries/Geometry'
import { RenderTexture, RenderTextureParams } from '../../textures/RenderTexture'
import { ExternalTextureParams, TextureParams, TextureParent } from '../../../types/Textures'
import { RenderTarget } from '../../renderPasses/RenderTarget'
import { GPUCurtains } from '../../../curtains/GPUCurtains'
import { ProjectedMesh } from '../../renderers/GPURenderer'
import { Material } from '../../materials/Material'
import { DOMElementBoundingRect } from '../../DOM/DOMElement'
import { AllowedGeometries, RenderMaterialParams } from '../../../types/Materials'
import { ProjectedMeshBaseClass } from './ProjectedMeshBaseMixin'
import default_vsWgsl from '../../shaders/chunks/default_vs.wgsl'
import default_fsWgsl from '../../shaders/chunks/default_fs.wgsl'

let meshIndex = 0

export interface MeshBaseRenderParams extends RenderMaterialParams {
  /** Whether we should add this Mesh to our {@link core/scenes/Scene.Scene | Scene} to let it handle the rendering process automatically */
  autoRender?: boolean
  /** Flag indicating whether to draw this Mesh or not */
  visible?: boolean
  /** Controls the order in which this Mesh should be rendered by our {@link core/scenes/Scene.Scene | Scene} */
  renderOrder?: number
  /** {@link RenderTarget} to render this Mesh to */
  renderTarget?: RenderTarget
  /** Parameters used by this Mesh to create a {@link Texture} */
  texturesOptions?: ExternalTextureParams
}

/**
 * Base parameters used to create a Mesh
 */
export interface MeshBaseParams extends MeshBaseRenderParams {
  /** Geometry to use */
  geometry: AllowedGeometries
}

/**
 *  Base options used to create this Mesh
 */
export interface MeshBaseOptions {
  /** The label of this Mesh, sent to various GPU objects for debugging purpose */
  label?: MeshBaseParams['label']
  /** Shaders to use by this Mesh {@link RenderMaterial} */
  shaders?: MeshBaseParams['shaders']
  /** Parameters used by this Mesh to create a {@link Texture} */
  texturesOptions?: ExternalTextureParams
  /** {@link RenderTarget} to render this Mesh to, if any */
  renderTarget?: RenderTarget | null
  /** Whether we should add this Mesh to our {@link core/scenes/Scene.Scene | Scene} to let it handle the rendering process automatically */
  autoRender?: boolean
  /** Whether to compile this Mesh {@link RenderMaterial} {@link core/pipelines/RenderPipelineEntry.RenderPipelineEntry#pipeline | render pipeline} asynchronously or not */
  useAsyncPipeline?: boolean
}

/** @const - Default Mesh parameters to merge with user defined parameters */
const defaultMeshBaseParams: MeshBaseParams = {
  // geometry
  geometry: new Geometry(),
  // material
  shaders: {},
  autoRender: true,
  useProjection: false,
  // rendering
  cullMode: 'back',
  depth: true,
  depthWriteEnabled: true,
  depthCompare: 'less',
  transparent: false,
  visible: true,
  renderOrder: 0,
  // textures
  texturesOptions: {},
}

// based on https://stackoverflow.com/a/75673107/13354068
// we declare first a class, and then the mixin with a return type
/**
 * This class describes the properties and methods to set up a basic Mesh, implemented in the {@link MeshBaseMixin}:
 * - Set and render the {@link Geometry} and {@link RenderMaterial}
 * - Add helpers to create {@link Texture} and {@link RenderTexture}
 * - Handle resizing, device lost/restoration and destroying the resources
 */
export declare class MeshBaseClass {
  /** The type of the {@link MeshBaseClass} */
  type: string
  /** The universal unique id of the {@link MeshBaseClass} */
  readonly uuid: string
  /** Index of this {@link MeshBaseClass}, i.e. creation order */
  readonly index: number
  /** The {@link Renderer} used */
  renderer: Renderer

  /** Options used to create this {@link MeshBaseClass} */
  options: MeshBaseOptions

  /** {@link RenderMaterial} used by this {@link MeshBaseClass} */
  material: RenderMaterial
  /** {@link AllowedGeometries | Geometry} used by this {@link MeshBaseClass} */
  geometry: MeshBaseParams['geometry']

  /** {@link RenderTarget} to render this Mesh to, if any */
  renderTarget: null | RenderTarget

  /** Controls the order in which this {@link MeshBaseClass} should be rendered by our {@link core/scenes/Scene.Scene | Scene} */
  renderOrder: number
  /** Whether this {@link MeshBaseClass} should be treated as transparent. Impacts the {@link core/pipelines/RenderPipelineEntry.RenderPipelineEntry#pipeline | render pipeline} blend properties */
  transparent: boolean

  /** Flag indicating whether to draw this {@link MeshBaseClass} or not */
  visible: boolean
  /** Flag indicating whether this {@link MeshBaseClass} is ready to be drawn */
  _ready: boolean

  /** Empty object to store any additional data or custom properties into your Mesh. */
  userData: Record<string, unknown>

  // callbacks
  /** function assigned to the {@link onReady} callback */
  _onReadyCallback: () => void
  /** function assigned to the {@link onBeforeRender} callback */
  _onBeforeRenderCallback: () => void
  /** function assigned to the {@link onRender} callback */
  _onRenderCallback: () => void
  /** function assigned to the {@link onAfterRender} callback */
  _onAfterRenderCallback: () => void
  /** function assigned to the {@link onAfterResize} callback */
  _onAfterResizeCallback: () => void
  /**
   * Assign a callback function to _onReadyCallback
   * @param callback - callback to run when {@link MeshBaseClass} is ready
   * @returns - our Mesh
   */
  onReady: (callback: () => void) => MeshBaseClass | ProjectedMeshBaseClass
  /**
   * Assign a callback function to _onBeforeRenderCallback
   * @param callback - callback to run just before {@link MeshBaseClass} will be rendered
   * @returns - our Mesh
   */
  onBeforeRender: (callback: () => void) => MeshBaseClass | ProjectedMeshBaseClass
  /**
   * Assign a callback function to _onRenderCallback
   * @param callback - callback to run when {@link MeshBaseClass} is rendered
   * @returns - our Mesh
   */
  onRender: (callback: () => void) => MeshBaseClass | ProjectedMeshBaseClass
  /**
   * Assign a callback function to _onAfterRenderCallback
   * @param callback - callback to run just after {@link MeshBaseClass} has been rendered
   * @returns - our Mesh
   */
  onAfterRender: (callback: () => void) => MeshBaseClass | ProjectedMeshBaseClass
  /**
   * Assign a callback function to _onBeforeRenderCallback
   * @param callback - callback to run just after {@link MeshBaseClass} has been resized
   * @returns - our Mesh
   */
  onAfterResize: (callback: () => void) => MeshBaseClass | ProjectedMeshBaseClass

  /**
   * {@link MeshBaseClass} constructor
   * @param renderer - our {@link Renderer} class object
   * @param element - a DOM HTML Element that can be bound to a Mesh
   * @param parameters - {@link MeshBaseParams | Mesh base parameters}
   */
  constructor(renderer: Renderer, element: HTMLElement | null, parameters: MeshBaseParams)

  /**
   * Get private #autoRender value
   * @readonly
   */
  get autoRender(): boolean // allow to read value from child classes

  /**
   * Get/set whether a Mesh is ready or not
   * @readonly
   */
  get ready(): boolean
  set ready(value: boolean)

  /**
   * Add a Mesh to the renderer and the {@link core/scenes/Scene.Scene | Scene}
   */
  addToScene(): void

  /**
   * Remove a Mesh from the renderer and the {@link core/scenes/Scene.Scene | Scene}
   */
  removeFromScene(): void

  /**
   * Set a new {@link Renderer} for this Mesh
   * @param renderer - new {@link Renderer} to set
   */
  setRenderer(renderer: Renderer | GPUCurtains): void

  /**
   * Called when the {@link core/renderers/GPUDeviceManager.GPUDeviceManager#device | device} has been lost to prepare everything for restoration.
   * Basically set all the {@link GPUBuffer} to null so they will be reset next time we try to draw the Mesh
   */
  loseContext(): void

  /**
   * Called when the {@link core/renderers/GPUDeviceManager.GPUDeviceManager#device | device} has been restored
   */
  restoreContext(): void

  /**
   * Set default shaders if one or both of them are missing
   */
  setShaders(): void

  /**
   * Compute the Mesh geometry if needed
   */
  computeGeometry(): void

  /**
   * Create the Mesh Geometry vertex and index buffers if needed
   */
  createGeometryBuffers(): void

  /**
   * Set our Mesh geometry: create buffers and add attributes to material
   */
  setGeometry(): void

  /**
   * Set a Mesh transparent property, then set its material
   * @param meshParameters - {@link RenderMaterialParams | RenderMaterial parameters}
   */
  setMaterial(meshParameters: RenderMaterialParams): void

  /**
   * Set Mesh material attributes
   */
  setMaterialGeometryAttributes(): void

  /**
   * Get our {@link RenderMaterial#textures | RenderMaterial textures array}
   * @readonly
   */
  get textures(): Texture[]

  /**
   * Get our {@link RenderMaterial#renderTextures | RenderMaterial render textures array}
   * @readonly
   */
  get renderTextures(): RenderTexture[]

  /**
   * Create a new {@link Texture}
   * @param options - {@link TextureParams | Texture parameters}
   * @returns - newly created Texture
   */
  createTexture(options: TextureParams): Texture

  /**
   * Add a {@link Texture}
   * @param texture - {@link Texture} to add
   */
  addTexture(texture: Texture)

  /**
   * Callback run when a new {@link Texture} has been created
   * @param texture - newly created Texture
   */
  onTextureAdded(texture: Texture): void

  /**
   * Create a new {@link RenderTexture}
   * @param  options - {@link RenderTextureParams | RenderTexture parameters}
   * @returns - newly created RenderTexture
   */
  createRenderTexture(options: RenderTextureParams): RenderTexture

  /**
   * Add a {@link RenderTexture}
   * @param renderTexture - {@link RenderTexture} to add
   */
  addRenderTexture(renderTexture: RenderTexture)

  /**
   * Assign or remove a {@link RenderTarget} to this Mesh
   * Since this manipulates the {@link core/scenes/Scene.Scene | Scene} stacks, it can be used to remove a RenderTarget as well.
   * @param renderTarget - the RenderTarget to assign or null if we want to remove the current RenderTarget
   */
  setRenderTarget(renderTarget: RenderTarget | null): void

  /**
   * Get the current {@link RenderMaterial} uniforms
   * @readonly
   */
  get uniforms(): Material['uniforms']

  /**
   * Get the current {@link RenderMaterial} storages
   * @readonly
   */
  get storages(): Material['storages']

  /**
   * Resize the Mesh's textures
   * @param boundingRect
   */
  resize(boundingRect?: DOMElementBoundingRect): void

  /**
   * Called before rendering the Mesh
   * Set the geometry if needed (create buffers and add attributes to the {@link RenderMaterial})
   * Then executes {@link RenderMaterial#onBeforeRender}: create its bind groups and pipeline if needed and eventually update its struct
   */
  onBeforeRenderPass(): void

  /**
   * Render our {@link MeshBaseClass} if the {@link RenderMaterial} is ready
   * @param pass - current render pass encoder
   */
  onRenderPass(pass: GPURenderPassEncoder): void

  /**
   * Called after having rendered the Mesh
   */
  onAfterRenderPass(): void

  /**
   * Render our Mesh
   * - Execute {@link onBeforeRenderPass}
   * - Stop here if {@link Renderer} is not ready or Mesh is not {@link visible}
   * - Execute super render call if it exists
   * - {@link onRenderPass | render} our {@link material} and {@link geometry}
   * - Execute {@link onAfterRenderPass}
   * @param pass - current render pass encoder
   */
  render(pass: GPURenderPassEncoder): void

  /**
   * Remove the Mesh from the {@link core/scenes/Scene.Scene | Scene} and destroy it
   */
  remove(): void

  /**
   * Destroy the Mesh
   */
  destroy(): void
}

/**
 * To get started, we need a type which we'll use to extend
 * other classes from. The main responsibility is to declare
 * that the type being passed in is a class.
 * We use a generic version which can apply a constraint on
 * the class which this mixin is applied to
 * @typeParam T - the base constructor
 */
export type MixinConstructor<T = {}> = new (...args: any[]) => T

/**
 * Used to mix the basic Mesh properties and methods defined in {@link MeshBaseClass} (basically, set a {@link Geometry} and a {@link RenderMaterial} and render them, add helpers to create {@link Texture} and {@link RenderTexture}) with a given Base of type {@link core/objects3D/Object3D.Object3D | Object3D}, {@link core/objects3D/ProjectedObject3D.ProjectedObject3D | ProjectedObject3D}, {@link curtains/objects3D/DOMObject3D.DOMObject3D | DOMObject3D} or an empty class.
 * @exports MeshBaseMixin
 * @param Base - the class to mix onto
 * @returns - the mixed classes, creating a basic Mesh.
 */
function MeshBaseMixin<TBase extends MixinConstructor>(Base: TBase): MixinConstructor<MeshBaseClass> & TBase {
  /**
   * MeshBase defines our base properties and methods
   */
  return class MeshBase extends Base implements MeshBaseClass {
    /** The type of the {@link MeshBase} */
    type: string
    /** The universal unique id of the {@link MeshBase} */
    readonly uuid: string
    /** Index of this {@link MeshBase}, i.e. creation order */
    readonly index: number
    /** The {@link Renderer} used */
    renderer: Renderer

    /** Options used to create this {@link MeshBase} */
    options: MeshBaseOptions

    /** {@link RenderMaterial} used by this {@link MeshBase} */
    material: RenderMaterial
    /** {@link AllowedGeometries | Geometry} used by this {@link MeshBase} */
    geometry: MeshBaseParams['geometry']

    /** {@link RenderTarget} to render this Mesh to, if any */
    renderTarget: null | RenderTarget

    /** Controls the order in which this {@link MeshBase} should be rendered by our {@link core/scenes/Scene.Scene | Scene} */
    renderOrder: number
    /** Whether this {@link MeshBase} should be treated as transparent. Impacts the {@link core/pipelines/RenderPipelineEntry.RenderPipelineEntry#pipeline | render pipeline} blend properties */
    transparent: boolean

    /** Flag indicating whether to draw this {@link MeshBase} or not */
    visible: boolean
    /** Flag indicating whether this {@link MeshBase} is ready to be drawn */
    _ready: boolean

    /** Empty object to store any additional data or custom properties into your {@link MeshBase}. */
    userData: Record<string, unknown>

    /** Whether we should add this {@link MeshBase} to our {@link core/scenes/Scene.Scene | Scene} to let it handle the rendering process automatically */
    #autoRender = true

    // callbacks / events
    /** function assigned to the {@link onReady} callback */
    _onReadyCallback: () => void = () => {
      /* allow empty callback */
    }
    /** function assigned to the {@link onBeforeRender} callback */
    _onBeforeRenderCallback: () => void = () => {
      /* allow empty callback */
    }
    /** function assigned to the {@link onRender} callback */
    _onRenderCallback: () => void = () => {
      /* allow empty callback */
    }
    /** function assigned to the {@link onAfterRender} callback */
    _onAfterRenderCallback: () => void = () => {
      /* allow empty callback */
    }
    /** function assigned to the {@link onAfterResize} callback */
    _onAfterResizeCallback: () => void = () => {
      /* allow empty callback */
    }

    /**
     * MeshBase constructor
     *
     * @typedef MeshBaseArrayParams
     * @type {array}
     * @property {(Renderer|GPUCurtains)} 0 - our {@link Renderer} class object
     * @property {(string|HTMLElement|null)} 1 - a DOM HTML Element that can be bound to a Mesh
     * @property {MeshBaseParams} 2 - {@link MeshBaseParams | Mesh base parameters}
     *
     * @param {MeshBaseArrayParams} params - our MeshBaseMixin parameters
     */
    constructor(...params: any[]) {
      super(
        params[0] as Renderer | GPUCurtains,
        params[1] as HTMLElement | string | null,
        { ...defaultMeshBaseParams, ...params[2] } as MeshBaseParams
      )

      let renderer = params[0]
      const parameters = { ...defaultMeshBaseParams, ...params[2] }

      this.type = 'MeshBase'

      this.uuid = generateUUID()
      Object.defineProperty(this as MeshBase, 'index', { value: meshIndex++ })

      // we could pass our curtains object OR our curtains renderer object
      renderer = (renderer && (renderer as GPUCurtains).renderer) || (renderer as Renderer)

      isRenderer(renderer, parameters.label ? parameters.label + ' ' + this.type : this.type)

      this.renderer = renderer

      const {
        label,
        shaders,
        geometry,
        visible,
        renderOrder,
        renderTarget,
        texturesOptions,
        autoRender,
        ...meshParameters
      } = parameters

      // set default sample count
      meshParameters.sampleCount =
        meshParameters.sampleCount ?? (this.renderer && this.renderer.renderPass)
          ? this.renderer.renderPass.options.sampleCount
          : 1

      this.options = {
        ...(this.options ?? {}), // merge possible lower options?
        label: label ?? 'Mesh ' + this.renderer.meshes.length,
        shaders,
        texturesOptions,
        ...(renderTarget !== undefined && { renderTarget }),
        ...(autoRender !== undefined && { autoRender }),
        ...(meshParameters.useAsyncPipeline !== undefined && { useAsyncPipeline: meshParameters.useAsyncPipeline }),
      }

      this.renderTarget = renderTarget ?? null

      this.geometry = geometry

      if (autoRender !== undefined) {
        this.#autoRender = autoRender
      }

      this.visible = visible
      this.renderOrder = renderOrder
      this.ready = false

      this.userData = {}

      this.computeGeometry()

      this.setMaterial({
        label: this.options.label,
        shaders: this.options.shaders,
        ...{ ...meshParameters, verticesOrder: geometry.verticesOrder, topology: geometry.topology },
      } as RenderMaterialParams)

      this.addToScene()
    }

    /**
     * Get private #autoRender value
     * @readonly
     */
    get autoRender(): boolean {
      return this.#autoRender
    }

    /**
     * Get/set whether a Mesh is ready or not
     * @readonly
     */
    get ready(): boolean {
      return this._ready
    }

    set ready(value: boolean) {
      if (value) {
        this._onReadyCallback && this._onReadyCallback()
      }
      this._ready = value
    }

    /* SCENE */

    /**
     * Add a Mesh to the renderer and the {@link core/scenes/Scene.Scene | Scene}
     */
    addToScene() {
      this.renderer.meshes.push(this as unknown as ProjectedMesh)

      // update sample count if needed
      this.material?.setRenderingOptions({
        sampleCount: this.renderTarget
          ? this.renderTarget.renderPass.options.sampleCount
          : this.renderer.renderPass.options.sampleCount,
      })

      if (this.#autoRender) {
        this.renderer.scene.addMesh(this as unknown as ProjectedMesh)
      }
    }

    /**
     * Remove a Mesh from the renderer and the {@link core/scenes/Scene.Scene | Scene}
     */
    removeFromScene() {
      if (this.#autoRender) {
        this.renderer.scene.removeMesh(this as unknown as ProjectedMesh)
      }

      this.renderer.meshes = this.renderer.meshes.filter((m) => m.uuid !== this.uuid)
    }

    /**
     * Set a new {@link Renderer} for this Mesh
     * @param renderer - new {@link Renderer} to set
     */
    setRenderer(renderer: Renderer | GPUCurtains) {
      // we could pass our curtains object OR our curtains renderer object
      renderer = (renderer && (renderer as GPUCurtains).renderer) || (renderer as Renderer)

      if (
        !renderer ||
        !(
          renderer.type === 'GPURenderer' ||
          renderer.type === 'GPUCameraRenderer' ||
          renderer.type === 'GPUCurtainsRenderer'
        )
      ) {
        throwWarning(
          `${this.options.label}: Cannot set ${renderer} as a renderer because it is not of a valid Renderer type.`
        )
        return
      }

      const oldRenderer = this.renderer
      this.removeFromScene()
      this.renderer = renderer
      this.addToScene()

      // if old renderer does not contain any meshes any more
      // clear it
      if (!oldRenderer.meshes.length) {
        oldRenderer.onBeforeRenderScene.add(
          (commandEncoder) => {
            oldRenderer.forceClear(commandEncoder)
          },
          { once: true }
        )
      }
    }

    /**
     * Assign or remove a {@link RenderTarget} to this Mesh
     * Since this manipulates the {@link core/scenes/Scene.Scene | Scene} stacks, it can be used to remove a RenderTarget as well.
     * @param renderTarget - the RenderTarget to assign or null if we want to remove the current RenderTarget
     */
    setRenderTarget(renderTarget: RenderTarget | null) {
      if (renderTarget && renderTarget.type !== 'RenderTarget') {
        throwWarning(`${this.options.label ?? this.type}: renderTarget is not a RenderTarget: ${renderTarget}`)
        return
      }

      // ensure the mesh is in the correct scene stack
      this.removeFromScene()
      this.renderTarget = renderTarget
      this.addToScene()
    }

    /**
     * Called when the {@link core/renderers/GPUDeviceManager.GPUDeviceManager#device | device} has been lost to prepare everything for restoration.
     * Basically set all the {@link GPUBuffer} to null so they will be reset next time we try to draw the Mesh
     */
    loseContext() {
      // first the geometry
      this.geometry.vertexBuffers.forEach((vertexBuffer) => {
        vertexBuffer.buffer = null
      })

      if ('indexBuffer' in this.geometry) {
        this.geometry.indexBuffer.buffer = null
      }

      // then the material
      this.material.loseContext()
    }

    /**
     * Called when the {@link core/renderers/GPUDeviceManager.GPUDeviceManager#device | device} has been restored
     */
    restoreContext() {
      this.material.restoreContext()
    }

    /* SHADERS */

    /**
     * Set default shaders if one or both of them are missing
     */
    setShaders() {
      let { shaders } = this.options

      if (!shaders) {
        shaders = {
          vertex: {
            code: default_vsWgsl,
            entryPoint: 'main',
          },
          fragment: {
            code: default_fsWgsl,
            entryPoint: 'main',
          },
        }
      } else {
        if (!shaders.vertex || !shaders.vertex.code) {
          shaders.vertex = {
            code: default_vsWgsl,
            entryPoint: 'main',
          }
        }

        if (!shaders.fragment || !shaders.fragment.code) {
          shaders.fragment = {
            code: default_fsWgsl,
            entryPoint: 'main',
          }
        }
      }
    }

    /* GEOMETRY */

    /**
     * Compute the Mesh geometry if needed
     */
    computeGeometry() {
      if (this.geometry.shouldCompute) {
        this.geometry.computeGeometry()
      }
    }

    /**
     * Create the Mesh Geometry vertex and index buffers if needed
     */
    createGeometryBuffers() {
      if (!this.geometry.ready) {
        this.geometry.vertexBuffers.forEach((vertexBuffer) => {
          if (!vertexBuffer.buffer) {
            vertexBuffer.buffer = this.renderer.createBuffer({
              label: this.options.label + ' geometry: ' + vertexBuffer.name + ' buffer',
              size: vertexBuffer.array.byteLength,
              usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            })

            this.renderer.queueWriteBuffer(vertexBuffer.buffer, 0, vertexBuffer.array)
          }
        })

        // if it's an indexed geometry, create index GPUBuffer as well
        if ('indexBuffer' in this.geometry && this.geometry.indexBuffer && !this.geometry.indexBuffer.buffer) {
          this.geometry.indexBuffer.buffer = this.renderer.createBuffer({
            label: this.options.label + ' geometry: index buffer',
            size: this.geometry.indexBuffer.array.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
          })

          this.renderer.queueWriteBuffer(this.geometry.indexBuffer.buffer, 0, this.geometry.indexBuffer.array)
        }
      }
    }

    /**
     * Set our Mesh geometry: create buffers and add attributes to material
     */
    setGeometry() {
      if (this.geometry && this.renderer.ready) {
        this.createGeometryBuffers()
        this.setMaterialGeometryAttributes()
      }
    }

    /* MATERIAL */

    /**
     * Set a Mesh transparent property, then set its material
     * @param meshParameters - {@link RenderMaterialParams | RenderMaterial parameters}
     */
    setMaterial(meshParameters: RenderMaterialParams) {
      this.transparent = meshParameters.transparent

      this.setShaders()

      this.material = new RenderMaterial(this.renderer, meshParameters)
      // add eventual textures passed as parameters
      this.material.options.textures
        ?.filter((texture) => texture instanceof Texture)
        .forEach((texture) => this.onTextureAdded(texture))
    }

    /**
     * Set Mesh material attributes
     */
    setMaterialGeometryAttributes() {
      if (this.material && !this.material.attributes) {
        this.material.setAttributesFromGeometry(this.geometry)
      }
    }

    /* TEXTURES */

    /**
     * Get our {@link RenderMaterial#textures | RenderMaterial textures array}
     * @readonly
     */
    get textures(): Texture[] {
      return this.material?.textures || []
    }

    /**
     * Get our {@link RenderMaterial#renderTextures | RenderMaterial render textures array}
     * @readonly
     */
    get renderTextures(): RenderTexture[] {
      return this.material?.renderTextures || []
    }

    /**
     * Create a new {@link Texture}
     * @param options - {@link TextureParams | Texture parameters}
     * @returns - newly created {@link Texture}
     */
    createTexture(options: TextureParams): Texture {
      if (!options.name) {
        options.name = 'texture' + this.textures.length
      }

      if (!options.label) {
        options.label = this.options.label + ' ' + options.name
      }

      const texture = new Texture(this.renderer, { ...options, ...this.options.texturesOptions })

      this.addTexture(texture)

      return texture
    }

    /**
     * Add a {@link Texture}
     * @param texture - {@link Texture} to add
     */
    addTexture(texture: Texture) {
      this.material.addTexture(texture)
      this.onTextureAdded(texture)
    }

    /**
     * Callback run when a new {@link Texture} has been added
     * @param texture - newly created Texture
     */
    onTextureAdded(texture: Texture) {
      texture.parentMesh = this as unknown as TextureParent
    }

    /**
     * Create a new {@link RenderTexture}
     * @param  options - {@link RenderTextureParams | RenderTexture parameters}
     * @returns - newly created {@link RenderTexture}
     */
    createRenderTexture(options: RenderTextureParams): RenderTexture {
      if (!options.name) {
        options.name = 'renderTexture' + this.renderTextures.length
      }

      const renderTexture = new RenderTexture(this.renderer, options)

      this.addRenderTexture(renderTexture)

      return renderTexture
    }

    /**
     * Add a {@link RenderTexture}
     * @param renderTexture - {@link RenderTexture} to add
     */
    addRenderTexture(renderTexture: RenderTexture) {
      this.material.addTexture(renderTexture)
    }

    /* BINDINGS */

    /**
     * Get the current {@link RenderMaterial} uniforms
     * @readonly
     */
    get uniforms(): Material['uniforms'] {
      return this.material?.uniforms
    }

    /**
     * Get the current {@link RenderMaterial} storages
     * @readonly
     */
    get storages(): Material['storages'] {
      return this.material?.storages
    }

    /* RESIZE */

    /**
     * Resize the Mesh's render textures only if they're not storage textures
     */
    resizeRenderTextures() {
      this.renderTextures
        ?.filter((renderTexture) => renderTexture.options.usage !== 'storageTexture')
        .forEach((renderTexture) => renderTexture.resize())
    }

    /**
     * Resize the Mesh's textures
     * @param boundingRect
     */
    resize(boundingRect?: DOMElementBoundingRect | null) {
      // resize render textures first
      this.resizeRenderTextures()

      // @ts-ignore
      if (super.resize) {
        // @ts-ignore
        super.resize(boundingRect)
      }

      // resize textures
      this.textures?.forEach((texture) => {
        texture.resize()
      })

      this._onAfterResizeCallback && this._onAfterResizeCallback()
    }

    /* EVENTS */

    /**
     * Assign a callback function to _onReadyCallback
     * @param callback - callback to run when {@link MeshBase} is ready
     * @returns - our Mesh
     */
    onReady(callback: () => void): MeshBase | ProjectedMeshBaseClass {
      if (callback) {
        this._onReadyCallback = callback
      }

      return this
    }

    /**
     * Assign a callback function to _onBeforeRenderCallback
     * @param callback - callback to run just before {@link MeshBase} will be rendered
     * @returns - our Mesh
     */
    onBeforeRender(callback: () => void): MeshBase | ProjectedMeshBaseClass {
      if (callback) {
        this._onBeforeRenderCallback = callback
      }

      return this
    }

    /**
     * Assign a callback function to _onRenderCallback
     * @param callback - callback to run when {@link MeshBase} is rendered
     * @returns - our Mesh
     */
    onRender(callback: () => void): MeshBase | ProjectedMeshBaseClass {
      if (callback) {
        this._onRenderCallback = callback
      }

      return this
    }

    /**
     * Assign a callback function to _onAfterRenderCallback
     * @param callback - callback to run just after {@link MeshBase} has been rendered
     * @returns - our Mesh
     */
    onAfterRender(callback: () => void): MeshBase | ProjectedMeshBaseClass {
      if (callback) {
        this._onAfterRenderCallback = callback
      }

      return this
    }

    /**
     * Assign a callback function to _onBeforeRenderCallback
     * @param callback - callback to run just after {@link MeshBase} has been resized
     * @returns - our Mesh
     */
    onAfterResize(callback: () => void): MeshBase | ProjectedMeshBaseClass {
      if (callback) {
        this._onAfterResizeCallback = callback
      }

      return this
    }

    /* RENDER */

    /**
     * Called before rendering the Mesh
     * Set the geometry if needed (create buffers and add attributes to the {@link RenderMaterial})
     * Then executes {@link RenderMaterial#onBeforeRender}: create its bind groups and pipeline if needed and eventually update its struct
     */
    onBeforeRenderPass() {
      if (!this.renderer.ready) return

      if (this.material && this.material.ready && this.geometry && this.geometry.ready && !this.ready) {
        this.ready = true
      }

      this.setGeometry()

      this._onBeforeRenderCallback && this._onBeforeRenderCallback()

      this.material.onBeforeRender()
    }

    /**
     * Render our {@link MeshBase} if the {@link RenderMaterial} is ready
     * @param pass - current render pass encoder
     */
    onRenderPass(pass: GPURenderPassEncoder) {
      if (!this.material.ready) return

      this._onRenderCallback && this._onRenderCallback()

      // render ou material
      this.material.render(pass)
      // then render our geometry
      this.geometry.render(pass)
    }

    /**
     * Called after having rendered the Mesh
     */
    onAfterRenderPass() {
      this._onAfterRenderCallback && this._onAfterRenderCallback()
    }

    /**
     * Render our Mesh
     * - Execute {@link onBeforeRenderPass}
     * - Stop here if {@link Renderer} is not ready or Mesh is not {@link visible}
     * - Execute super render call if it exists
     * - {@link onRenderPass | render} our {@link material} and {@link geometry}
     * - Execute {@link onAfterRenderPass}
     * @param pass - current render pass encoder
     */
    render(pass: GPURenderPassEncoder) {
      this.onBeforeRenderPass()

      // no point to render if the WebGPU device is not ready
      if (!this.renderer.ready || !this.visible) return

      // @ts-ignore
      if (super.render) {
        // @ts-ignore
        super.render()
      }

      this.onRenderPass(pass)

      this.onAfterRenderPass()
    }

    /* DESTROY */

    /**
     * Remove the Mesh from the {@link core/scenes/Scene.Scene | Scene} and destroy it
     */
    remove() {
      this.removeFromScene()
      this.destroy()

      // if the renderer does not contain any meshes any more
      // clear it
      if (!this.renderer.meshes.length) {
        this.renderer.onBeforeRenderScene.add(
          (commandEncoder) => {
            this.renderer.forceClear(commandEncoder)
          },
          { once: true }
        )
      }
    }

    /**
     * Destroy the Mesh
     */
    destroy() {
      // @ts-ignore
      if (super.destroy) {
        // @ts-ignore
        super.destroy()
      }

      this.material?.destroy()

      // remove geometry buffers from device cache
      this.geometry.vertexBuffers.forEach((vertexBuffer) => {
        // use original vertex buffer label in case it has been swapped (usually by a compute pass)
        this.renderer.removeBuffer(
          vertexBuffer.buffer,
          this.options.label + ' geometry: ' + vertexBuffer.name + ' buffer'
        )
      })

      if ('indexBuffer' in this.geometry) {
        this.renderer.removeBuffer(this.geometry.indexBuffer.buffer)
      }

      this.geometry?.destroy()
    }
  }
}

export { MeshBaseMixin }
