import { DOMObject3D } from '../objects3D/DOMObject3D'
import { isCurtainsRenderer } from '../../core/renderers/utils'
import { ProjectedMeshBaseMixin } from '../../core/meshes/mixins/ProjectedMeshBaseMixin'
import { MeshBaseRenderParams } from '../../core/meshes/mixins/MeshBaseMixin'
import { throwWarning } from '../../utils/utils'
import { GPUCurtainsRenderer } from '../renderers/GPUCurtainsRenderer'
import { GPUCurtains } from '../GPUCurtains'
import { Texture } from '../../core/textures/Texture'
import { AllowedGeometries } from '../../types/Materials'
import { RenderTexture, RenderTextureParams } from '../../core/textures/RenderTexture'
import { DOMElementBoundingRect, DOMElementParams } from '../../core/DOM/DOMElement'

/**
 * Base parameters to create a {@link DOMMesh}
 */
export interface DOMMeshBaseParams extends MeshBaseRenderParams {
  /** Whether to automatically create a {@link Texture} for all {@link HTMLImageElement}, {@link HTMLVideoElement} and {@link HTMLCanvasElement} child of the specified {@link DOMMesh} {@link HTMLElement} */
  autoloadSources?: boolean
  /** Whether to automatically update the {@link DOMMesh} position on scroll */
  watchScroll?: boolean
}

/**
 * Parameters to create a {@link DOMMesh}
 */
export interface DOMMeshParams extends DOMMeshBaseParams {
  /** {@link core/geometries/Geometry.Geometry | Geometry} to use with the {@link DOMMesh} */
  geometry: AllowedGeometries
}

/** @const - default {@link DOMMesh} parameters */
const defaultDOMMeshParams = {
  autoloadSources: true,
  watchScroll: true,
} as DOMMeshBaseParams

/**
 * Create a {@link core/meshes/Mesh.Mesh | Mesh} based on a {@link DOMObject3D}, which allow the {@link core/meshes/Mesh.Mesh | Mesh} to be scaled and positioned based on a {@link HTMLElement} {@link DOMElementBoundingRect | bounding rectangle}.
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
 *
 * // create a DOMMesh with a box geometry,
 * // assuming there's a HTML element with the "mesh" ID in the DOM
 * // will use the normals colors as default shading
 * const domMesh = new DOMMesh(gpuCurtains, '#mesh', {
 *   label: 'My DOM Mesh',
 *   geometry: new BoxGeometry(),
 * })
 * ```
 */
export class DOMMesh extends ProjectedMeshBaseMixin(DOMObject3D) {
  /** {@link GPUCurtainsRenderer} used to create this {@link DOMObject3D} */
  renderer: GPUCurtainsRenderer
  /** Whether to automatically create a {@link Texture} for all {@link HTMLImageElement}, {@link HTMLVideoElement} and {@link HTMLCanvasElement} child of the specified {@link DOMMesh} {@link HTMLElement} */
  autoloadSources: boolean
  /** Whether all the sources have been successfully loaded */
  _sourcesReady: boolean

  // callbacks / events
  /** function assigned to the {@link onLoading} callback */
  _onLoadingCallback = (texture: Texture): void => {
    /* allow empty callback */
  }

  /**
   * DOMMesh constructor
   * @param renderer - {@link GPUCurtainsRenderer} object or {@link GPUCurtains} class object used to create this {@link DOMMesh}
   * @param element - {@link HTMLElement} or string representing an {@link HTMLElement} selector used to scale and position the {@link DOMMesh}
   * @param parameters - {@link DOMMeshParams | parameters} used to create this {@link DOMMesh}
   */
  constructor(
    renderer: GPUCurtainsRenderer | GPUCurtains,
    element: DOMElementParams['element'],
    parameters: DOMMeshParams
  ) {
    super(renderer, element, { ...defaultDOMMeshParams, ...parameters })

    parameters = { ...defaultDOMMeshParams, ...parameters }

    // we could pass our curtains object OR our curtains renderer object
    renderer = (renderer && (renderer as GPUCurtains).renderer) || (renderer as GPUCurtainsRenderer)

    isCurtainsRenderer(renderer, parameters.label ? parameters.label + ' DOMMesh' : 'DOMMesh')

    this.type = 'DOMMesh'

    const { autoloadSources } = parameters

    this.autoloadSources = autoloadSources

    this.sourcesReady = false
    this.setInitSources()
  }

  /**
   * Get/set whether our {@link material} and {@link geometry} are ready
   * @readonly
   */
  get ready(): boolean {
    return this._ready
  }

  set ready(value: boolean) {
    this._ready = value

    if (this.DOMMeshReady) {
      this._onReadyCallback && this._onReadyCallback()
    }
  }

  /**
   * Get/set whether all the initial {@link DOMMesh} sources have been successfully loaded
   * @readonly
   */
  get sourcesReady(): boolean {
    return this._sourcesReady
  }

  set sourcesReady(value: boolean) {
    this._sourcesReady = value

    if (this.DOMMeshReady) {
      this._onReadyCallback && this._onReadyCallback()
    }
  }

  /**
   * Get whether our {@link DOMMesh} is ready. A {@link DOMMesh} is ready when its {@link sourcesReady | sources are ready} and its {@link material} and {@link geometry} are ready.
   * @readonly
   */
  get DOMMeshReady(): boolean {
    return this.ready && this.sourcesReady
  }

  /**
   * Add a {@link DOMMesh} to the renderer and the {@link core/scenes/Scene.Scene | Scene}
   */
  addToScene() {
    super.addToScene()
    ;(this.renderer as GPUCurtainsRenderer).domMeshes.push(this)
  }

  /**
   * Remove a {@link DOMMesh} from the renderer and the {@link core/scenes/Scene.Scene | Scene}
   */
  removeFromScene() {
    super.removeFromScene()
    ;(this.renderer as GPUCurtainsRenderer).domMeshes = (this.renderer as GPUCurtainsRenderer).domMeshes.filter(
      (m) => m.uuid !== this.uuid
    )
  }

  /**
   * Load initial {@link DOMMesh} sources if needed and create associated {@link Texture}
   */
  setInitSources() {
    let loaderSize = 0
    let sourcesLoaded = 0

    if (this.autoloadSources) {
      const images = this.domElement.element.querySelectorAll('img')
      const videos = this.domElement.element.querySelectorAll('video')
      const canvases = this.domElement.element.querySelectorAll('canvas')

      loaderSize = images.length + videos.length + canvases.length

      const onSourceUploaded = (texture) => {
        sourcesLoaded++

        this._onLoadingCallback && this._onLoadingCallback(texture)

        if (sourcesLoaded === loaderSize) {
          this.sourcesReady = true
        }
      }

      if (!loaderSize) {
        this.sourcesReady = true
      }

      // load images
      if (images.length) {
        images.forEach((image) => {
          const texture = this.createTexture({
            name: image.getAttribute('data-texture-name') ?? 'texture' + this.textures.length,
          })

          texture.onSourceUploaded(() => onSourceUploaded(texture)).loadImage(image.src)
        })
      }

      // load videos
      if (videos.length) {
        videos.forEach((video) => {
          const texture = this.createTexture({
            name: video.getAttribute('data-texture-name') ?? 'texture' + this.textures.length,
          })

          texture.onSourceUploaded(() => onSourceUploaded(texture)).loadVideo(video)
        })
      }

      // load canvases
      if (canvases.length) {
        canvases.forEach((canvas) => {
          const texture = this.createTexture({
            name: canvas.getAttribute('data-texture-name') ?? 'texture' + this.textures.length,
          })

          texture.onSourceUploaded(() => onSourceUploaded(texture)).loadCanvas(canvas)
        })
      }
    } else {
      this.sourcesReady = true
    }
  }

  /**
   * Reset/change the {@link domElement | DOM Element}
   * @param element - new {@link HTMLElement} or string representing an {@link HTMLElement} selector to use
   */
  resetDOMElement(element: string | HTMLElement) {
    if (!!element) {
      super.resetDOMElement(element)
    } else if (!element && !this.renderer.production) {
      throwWarning(
        `${this.options.label}: You are trying to reset a ${this.type} with a HTML element that does not exist. The old HTML element will be kept instead.`
      )
    }
  }

  /**
   * Get our {@link DOMMesh#domElement | DOM Element} {@link core/DOM/DOMElement.DOMElement#boundingRect | bounding rectangle} accounting for current {@link core/renderers/GPURenderer.GPURenderer#pixelRatio | renderer pixel ratio}
   */
  get pixelRatioBoundingRect(): DOMElementBoundingRect {
    const devicePixelRatio = window.devicePixelRatio ?? 1
    const scaleBoundingRect = this.renderer.pixelRatio / devicePixelRatio

    return Object.keys(this.domElement.boundingRect).reduce(
      (a, key) => ({ ...a, [key]: this.domElement.boundingRect[key] * scaleBoundingRect }),
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

  /**
   * Create a new {@link RenderTexture}
   * @param  options - {@link RenderTextureParams | RenderTexture parameters}
   * @returns - newly created {@link RenderTexture}
   */
  createRenderTexture(options: RenderTextureParams): RenderTexture {
    options = {
      ...options,
      size: { width: this.pixelRatioBoundingRect.width, height: this.pixelRatioBoundingRect.height },
    }

    return super.createRenderTexture(options)
  }

  /**
   * Resize the Mesh's render textures only if they're not storage textures
   */
  resizeRenderTextures() {
    this.renderTextures
      ?.filter((renderTexture) => renderTexture.options.usage === 'texture')
      .forEach((renderTexture) =>
        renderTexture.resize({ width: this.pixelRatioBoundingRect.width, height: this.pixelRatioBoundingRect.height })
      )
  }

  /* EVENTS */

  /**
   * Called each time one of the initial sources associated {@link Texture#texture | GPU texture} has been uploaded to the GPU
   * @param callback - callback to call each time a {@link Texture#texture | GPU texture} has been uploaded to the GPU
   * @returns - our {@link DOMMesh}
   */
  onLoading(callback: (texture: Texture) => void): DOMMesh {
    if (callback) {
      this._onLoadingCallback = callback
    }

    return this
  }
}
