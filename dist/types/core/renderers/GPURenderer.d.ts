/// <reference types="dist" />
import { PipelineManager } from '../pipelines/PipelineManager';
import { DOMElement, DOMElementBoundingRect } from '../DOM/DOMElement';
import { Scene } from '../scenes/Scene';
import { RenderPass, RenderPassParams } from '../renderPasses/RenderPass';
import { ComputePass } from '../computePasses/ComputePass';
import { PingPongPlane } from '../../curtains/meshes/PingPongPlane';
import { ShaderPass } from '../renderPasses/ShaderPass';
import { RenderTarget } from '../renderPasses/RenderTarget';
import { Texture } from '../textures/Texture';
import { Sampler } from '../samplers/Sampler';
import { DOMMesh } from '../../curtains/meshes/DOMMesh';
import { Plane } from '../../curtains/meshes/Plane';
import { Mesh } from '../meshes/Mesh';
import { TasksQueueManager } from '../../utils/TasksQueueManager';
import { AllowedBindGroups } from '../../types/BindGroups';
import { RenderTexture } from '../textures/RenderTexture';
import { GPUDeviceManager } from './GPUDeviceManager';
import { FullscreenPlane } from '../meshes/FullscreenPlane';
/**
 * Parameters used to create a {@link GPURenderer}
 */
export interface GPURendererParams {
    /** The {@link GPUDeviceManager} used to create this {@link GPURenderer} */
    deviceManager: GPUDeviceManager;
    /** {@link HTMLElement} or selector used as a container for our {@link GPURenderer#canvas | canvas} */
    container: string | HTMLElement;
    /** Pixel ratio to use for rendering */
    pixelRatio?: number;
    /** Texture rendering {@link GPUTextureFormat | preferred format} */
    preferredFormat?: GPUTextureFormat;
    /** Set the {@link GPUCanvasContext | context} alpha mode */
    alphaMode?: GPUCanvasAlphaMode;
    /** Whether the {@link GPURenderer} should add an extra {@link ShaderPass} MSAA pass after drawing the whole scene. */
    multisampled?: boolean;
    /** The {@link GPURenderer#renderPass | renderer RenderPass} parameters */
    renderPass?: {
        /** Whether the {@link GPURenderer#renderPass | renderer RenderPass} should handle depth. Default to `true` */
        depth: RenderPassParams['depth'];
        /** The {@link GPURenderer#renderPass | renderer RenderPass} sample count (i.e. whether it should use multisampled antialiasing). Default to `4` */
        sampleCount: RenderPassParams['sampleCount'];
        /** The {@link GPUColor | color values} to clear to before drawing the {@link GPURenderer#renderPass | renderer RenderPass}. Default to `[0, 0, 0, 0]` */
        clearValue: GPUColor;
    };
}
/** Any Mesh that is bound to a DOM Element */
export type DOMProjectedMesh = DOMMesh | Plane;
/** Any Mesh that is projected (i.e use a {@link core/camera/Camera.Camera | Camera} to compute a model view projection matrix) */
export type ProjectedMesh = Mesh | DOMProjectedMesh;
/** Any Mesh that can be drawn, including fullscreen quad meshes used for post processing */
export type RenderedMesh = ProjectedMesh | PingPongPlane | ShaderPass | FullscreenPlane;
/** Any Mesh or Compute pass */
export type SceneObject = RenderedMesh | ComputePass;
/**
 * Base renderer class, that could technically be used to render compute passes and draw fullscreen quads, even tho it is strongly advised to use at least the {@link core/renderers/GPUCameraRenderer.GPUCameraRenderer | GPUCameraRenderer} class instead.
 * A renderer is responsible for:
 * - Setting a {@link GPUCanvasContext | context}
 * - Handling the {@link HTMLCanvasElement | canvas} onto everything is drawn
 * - Creating a {@link RenderPass} that will handle our render and depth textures and the render pass descriptor
 * - Keeping track of every specific class objects created relative to computing and rendering
 * - Creating a {@link Scene} class that will take care of the rendering process of all previously mentioned objects
 */
export declare class GPURenderer {
    /** The type of the {@link GPURenderer} */
    type: string;
    /** The universal unique id of this {@link GPURenderer} */
    readonly uuid: string;
    /** The {@link GPUDeviceManager} used to create this {@link GPURenderer} */
    deviceManager: GPUDeviceManager;
    /** {@link HTMLCanvasElement} onto everything is drawn */
    canvas: HTMLCanvasElement;
    /** The WebGPU {@link GPUCanvasContext | context} used */
    context: null | GPUCanvasContext;
    /** Set the {@link GPUCanvasContext | context} alpha mode */
    alphaMode?: GPUCanvasAlphaMode;
    /** Options used to create this {@link GPURenderer} */
    options: GPURendererParams;
    /** Whether the {@link GPURenderer} should add an extra {@link ShaderPass} MSAA pass after drawing the whole scene. */
    multisampled: boolean;
    /** The {@link RenderPass | render pass} used to render our result to screen */
    renderPass: RenderPass;
    /** Additional {@link RenderPass | render pass} used by {@link ShaderPass} for compositing / post processing. Does not handle depth */
    postProcessingPass: RenderPass;
    /** {@link RenderPass | Multisampled render pass} used by an internal {@link ShaderPass} for MSAA, if {@link multisampled} is set to `true` */
    /** The {@link Scene} used */
    scene: Scene;
    /** An array containing all our created {@link ComputePass} */
    computePasses: ComputePass[];
    /** An array containing all our created {@link PingPongPlane} */
    pingPongPlanes: PingPongPlane[];
    /** An array containing all our created {@link ShaderPass} */
    shaderPasses: ShaderPass[];
    /** An array containing all our created {@link RenderTarget} */
    renderTargets: RenderTarget[];
    /** An array containing all our created {@link ProjectedMesh | projected meshes} */
    meshes: ProjectedMesh[];
    /** An array containing all our created {@link RenderTexture} */
    renderTextures: RenderTexture[];
    /** Pixel ratio to use for rendering */
    pixelRatio: number;
    /** {@link DOMElement} that will track our canvas container size */
    domElement: DOMElement;
    /** Allow to add callbacks to be executed at each render before the {@link GPUCommandEncoder} is created */
    onBeforeCommandEncoderCreation: TasksQueueManager;
    /** Allow to add callbacks to be executed at each render after the {@link GPUCommandEncoder} has been created but before the {@link Scene} is rendered */
    onBeforeRenderScene: TasksQueueManager;
    /** Allow to add callbacks to be executed at each render after the {@link GPUCommandEncoder} has been created and after the {@link Scene} has been rendered */
    onAfterRenderScene: TasksQueueManager;
    /** Allow to add callbacks to be executed at each render after the {@link Scene} has been rendered and the {@link GPUCommandEncoder} has been submitted */
    onAfterCommandEncoderSubmission: TasksQueueManager;
    /** function assigned to the {@link onBeforeRender} callback */
    _onBeforeRenderCallback: (commandEncoder: GPUCommandEncoder) => void;
    /** function assigned to the {@link onAfterRender} callback */
    _onAfterRenderCallback: (commandEncoder: GPUCommandEncoder) => void;
    /** function assigned to the {@link onAfterResize} callback */
    _onAfterResizeCallback: () => void;
    /**
     * GPURenderer constructor
     * @param parameters - {@link GPURendererParams | parameters} used to create this {@link GPURenderer}
     */
    constructor({ deviceManager, container, pixelRatio, preferredFormat, alphaMode, multisampled, renderPass, }: GPURendererParams);
    /**
     * Set {@link canvas} size
     * @param boundingRect - new {@link domElement | DOM Element} {@link DOMElement#boundingRect | bounding rectangle}
     */
    setSize(boundingRect: DOMElementBoundingRect): void;
    /**
     * Resize our {@link GPURenderer}
     * @param boundingRect - new {@link domElement | DOM Element} {@link DOMElement#boundingRect | bounding rectangle}
     */
    resize(boundingRect?: DOMElementBoundingRect | null): void;
    /**
     * Resize all tracked objects
     */
    onResize(): void;
    /**
     * Get our {@link domElement | DOM Element} {@link DOMElement#boundingRect | bounding rectangle}
     */
    get boundingRect(): DOMElementBoundingRect;
    /**
     * Get our {@link domElement | DOM Element} {@link DOMElement#boundingRect | bounding rectangle} accounting for current {@link pixelRatio | pixel ratio}
     */
    get pixelRatioBoundingRect(): DOMElementBoundingRect;
    /**
     * Get our {@link GPUDeviceManager#device | device}
     * @readonly
     */
    get device(): GPUDevice | undefined;
    /**
     * Get whether our {@link GPUDeviceManager} is ready (i.e. its {@link GPUDeviceManager#adapter | adapter} and {@link GPUDeviceManager#device | device} are set) its {@link context} is set and its size is set
     * @readonly
     */
    get ready(): boolean;
    /**
     * Get our {@link GPUDeviceManager#production | GPUDeviceManager production flag}
     * @readonly
     */
    get production(): boolean;
    /**
     * Get all the created {@link GPUDeviceManager#samplers | samplers}
     * @readonly
     */
    get samplers(): Sampler[];
    /**
     * Get all the created {@link GPUDeviceManager#buffers | GPU buffers}
     * @readonly
     */
    get buffers(): GPUBuffer[];
    /**
     * Get the {@link GPUDeviceManager#pipelineManager | pipeline manager}
     * @readonly
     */
    get pipelineManager(): PipelineManager;
    /**
     * Get all the rendered objects (i.e. compute passes, meshes, ping pong planes and shader passes) created by the {@link GPUDeviceManager}
     * @readonly
     */
    get deviceRenderedObjects(): SceneObject[];
    /**
     * Configure our {@link context} with the given options
     */
    configureContext(): void;
    /**
     * Set our {@link context} if possible and set {@link renderPass | main render pass} and {@link scene}
     */
    setContext(): void;
    /**
     * Called when the {@link GPUDeviceManager#device | device} is lost.
     * Force all our scene objects to lose context.
     */
    loseContext(): void;
    /**
     * Called when the {@link GPUDeviceManager#device | device} should be restored.
     * Configure the context again, resize the {@link RenderTarget | render targets} and {@link RenderTexture | render textures}, restore our {@link renderedObjects | rendered objects} context.
     * @async
     */
    restoreContext(): void;
    /**
     * Set our {@link renderPass | main render pass} that will be used to render the result of our draw commands back to the screen
     */
    setMainRenderPasses(): void;
    /**
     * Set our {@link scene}
     */
    setScene(): void;
    /**
     * Create a {@link GPUBuffer}
     * @param bufferDescriptor - {@link GPUBufferDescriptor | GPU buffer descriptor}
     * @returns - newly created {@link GPUBuffer}
     */
    createBuffer(bufferDescriptor: GPUBufferDescriptor): GPUBuffer;
    /**
     * Remove a {@link GPUBuffer} from our {@link GPUDeviceManager#buffers | GPU buffers array}
     * @param buffer - {@link GPUBuffer} to remove
     * @param [originalLabel] - original {@link GPUBuffer} label in case the buffer has been swapped and its label has changed
     */
    removeBuffer(buffer: GPUBuffer, originalLabel?: string): void;
    /**
     * Write to a {@link GPUBuffer}
     * @param buffer - {@link GPUBuffer} to write to
     * @param bufferOffset - {@link GPUSize64 | buffer offset}
     * @param data - {@link BufferSource | data} to write
     */
    queueWriteBuffer(buffer: GPUBuffer, bufferOffset: GPUSize64, data: BufferSource): void;
    /**
     * Copy a source {@link GPUBuffer} into a destination {@link GPUBuffer}
     * @param parameters - parameters used to realize the copy
     * @param parameters.srcBuffer - source {@link GPUBuffer}
     * @param [parameters.dstBuffer] - destination {@link GPUBuffer}. Will create a new one if none provided.
     * @param [parameters.commandEncoder] - {@link GPUCommandEncoder} to use for the copy. Will create a new one and submit the command buffer if none provided.
     * @returns - destination {@link GPUBuffer} after copy
     */
    copyBufferToBuffer({ srcBuffer, dstBuffer, commandEncoder, }: {
        srcBuffer: GPUBuffer;
        dstBuffer?: GPUBuffer;
        commandEncoder?: GPUCommandEncoder;
    }): GPUBuffer | null;
    /**
     * Get all created {@link AllowedBindGroups | bind group} tracked by our {@link GPUDeviceManager}
     * @readonly
     */
    get bindGroups(): AllowedBindGroups[];
    /**
     * Add a {@link AllowedBindGroups | bind group} to our {@link GPUDeviceManager#bindGroups | bind groups array}
     * @param bindGroup - {@link AllowedBindGroups | bind group} to add
     */
    addBindGroup(bindGroup: AllowedBindGroups): void;
    /**
     * Remove a {@link AllowedBindGroups | bind group} from our {@link GPUDeviceManager#bindGroups | bind groups array}
     * @param bindGroup - {@link AllowedBindGroups | bind group} to remove
     */
    removeBindGroup(bindGroup: AllowedBindGroups): void;
    /**
     * Create a {@link GPUBindGroupLayout}
     * @param bindGroupLayoutDescriptor - {@link GPUBindGroupLayoutDescriptor | GPU bind group layout descriptor}
     * @returns - newly created {@link GPUBindGroupLayout}
     */
    createBindGroupLayout(bindGroupLayoutDescriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
    /**
     * Create a {@link GPUBindGroup}
     * @param bindGroupDescriptor - {@link GPUBindGroupDescriptor | GPU bind group descriptor}
     * @returns - newly created {@link GPUBindGroup}
     */
    createBindGroup(bindGroupDescriptor: GPUBindGroupDescriptor): GPUBindGroup;
    /**
     * Create a {@link GPUShaderModule}
     * @param shaderModuleDescriptor - {@link shaderModuleDescriptor | shader module descriptor}
     * @returns - newly created {@link GPUShaderModule}
     */
    createShaderModule(shaderModuleDescriptor: GPUShaderModuleDescriptor): GPUShaderModule;
    /**
     * Create a {@link GPUPipelineLayout}
     * @param pipelineLayoutDescriptor - {@link GPUPipelineLayoutDescriptor | GPU pipeline layout descriptor}
     * @returns - newly created {@link GPUPipelineLayout}
     */
    createPipelineLayout(pipelineLayoutDescriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
    /**
     * Create a {@link GPURenderPipeline}
     * @param pipelineDescriptor - {@link GPURenderPipelineDescriptor | GPU render pipeline descriptor}
     * @returns - newly created {@link GPURenderPipeline}
     */
    createRenderPipeline(pipelineDescriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
    /**
     * Asynchronously create a {@link GPURenderPipeline}
     * @async
     * @param pipelineDescriptor - {@link GPURenderPipelineDescriptor | GPU render pipeline descriptor}
     * @returns - newly created {@link GPURenderPipeline}
     */
    createRenderPipelineAsync(pipelineDescriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline>;
    /**
     * Create a {@link GPUComputePipeline}
     * @param pipelineDescriptor - {@link GPUComputePipelineDescriptor | GPU compute pipeline descriptor}
     * @returns - newly created {@link GPUComputePipeline}
     */
    createComputePipeline(pipelineDescriptor: GPUComputePipelineDescriptor): GPUComputePipeline;
    /**
     * Asynchronously create a {@link GPUComputePipeline}
     * @async
     * @param pipelineDescriptor - {@link GPUComputePipelineDescriptor | GPU compute pipeline descriptor}
     * @returns - newly created {@link GPUComputePipeline}
     */
    createComputePipelineAsync(pipelineDescriptor: GPUComputePipelineDescriptor): Promise<GPUComputePipeline>;
    /**
     * Get all created {@link Texture} tracked by our {@link GPUDeviceManager}
     * @readonly
     */
    get textures(): Texture[];
    /**
     * Add a {@link Texture} to our {@link GPUDeviceManager#textures | textures array}
     * @param texture - {@link Texture} to add
     */
    addTexture(texture: Texture): void;
    /**
     * Remove a {@link Texture} from our {@link GPUDeviceManager#textures | textures array}
     * @param texture - {@link Texture} to remove
     */
    removeTexture(texture: Texture): void;
    /**
     * Add a {@link RenderTexture} to our {@link renderTextures} array
     * @param texture - {@link RenderTexture} to add
     */
    addRenderTexture(texture: RenderTexture): void;
    /**
     * Remove a {@link RenderTexture} from our {@link renderTextures} array
     * @param texture - {@link RenderTexture} to remove
     */
    removeRenderTexture(texture: RenderTexture): void;
    /**
     * Create a {@link GPUTexture}
     * @param textureDescriptor - {@link GPUTextureDescriptor | GPU texture descriptor}
     * @returns - newly created {@link GPUTexture}
     */
    createTexture(textureDescriptor: GPUTextureDescriptor): GPUTexture;
    /**
     * Upload a {@link Texture#texture | texture} to the GPU
     * @param texture - {@link Texture} class object with the {@link Texture#texture | texture} to upload
     */
    uploadTexture(texture: Texture): void;
    /**
     * Import a {@link GPUExternalTexture}
     * @param video - {@link HTMLVideoElement} source
     * @returns - {@link GPUExternalTexture}
     */
    importExternalTexture(video: HTMLVideoElement): GPUExternalTexture;
    /**
     * Check if a {@link Sampler} has already been created with the same {@link Sampler#options | parameters}.
     * Use it if found, else create a new one and add it to the {@link GPUDeviceManager#samplers | samplers array}.
     * @param sampler - {@link Sampler} to create
     * @returns - the {@link GPUSampler}
     */
    createSampler(sampler: Sampler): GPUSampler;
    /**
     * Remove a {@link Sampler} from our {@link GPUDeviceManager#samplers | samplers array}
     * @param sampler - {@link Sampler} to remove
     */
    removeSampler(sampler: Sampler): void;
    /**
     * Set different tasks queue managers to execute callbacks at different phases of our render call:
     * - {@link onBeforeCommandEncoderCreation}: callbacks executed before the creation of the command encoder
     * - {@link onBeforeRenderScene}: callbacks executed after the creation of the command encoder and before rendering the {@link Scene}
     * - {@link onAfterRenderScene}: callbacks executed after the creation of the command encoder and after rendering the {@link Scene}
     * - {@link onAfterCommandEncoderSubmission}: callbacks executed after the submission of the command encoder
     */
    setTasksQueues(): void;
    /**
     * Set all objects arrays that we'll keep track of
     */
    setRendererObjects(): void;
    /**
     * Get all this {@link GPURenderer} rendered objects (i.e. compute passes, meshes, ping pong planes and shader passes)
     * @readonly
     */
    get renderedObjects(): SceneObject[];
    /**
     * Get all objects ({@link RenderedMesh | rendered meshes} or {@link ComputePass | compute passes}) using a given {@link AllowedBindGroups | bind group}.
     * Useful to know if a resource is used by multiple objects and if it is safe to destroy it or not.
     * @param bindGroup - {@link AllowedBindGroups | bind group} to check
     */
    getObjectsByBindGroup(bindGroup: AllowedBindGroups): undefined | SceneObject[];
    /**
     * Get all objects ({@link RenderedMesh | rendered meshes} or {@link ComputePass | compute passes}) using a given {@link Texture} or {@link RenderTexture}.
     * Useful to know if a resource is used by multiple objects and if it is safe to destroy it or not.
     * @param texture - {@link Texture} or {@link RenderTexture} to check
     */
    getObjectsByTexture(texture: Texture | RenderTexture): undefined | SceneObject[];
    /**
     * Assign a callback function to _onBeforeRenderCallback
     * @param callback - callback to run just before the {@link render} method will be executed
     * @returns - our {@link GPURenderer}
     */
    onBeforeRender(callback: (commandEncoder?: GPUCommandEncoder) => void): this;
    /**
     * Assign a callback function to _onAfterRenderCallback
     * @param callback - callback to run just after the {@link render} method has been executed
     * @returns - our {@link GPURenderer}
     */
    onAfterRender(callback: (commandEncoder?: GPUCommandEncoder) => void): this;
    /**
     * Assign a callback function to _onAfterResizeCallback
     * @param callback - callback to run just after the {@link GPURenderer} has been resized
     * @returns - our {@link GPURenderer}
     */
    onAfterResize(callback: (commandEncoder?: GPUCommandEncoder) => void): this;
    /**
     * Set the current {@link RenderPass#descriptor | render pass descriptor} texture {@link GPURenderPassColorAttachment#view | view} and {@link GPURenderPassColorAttachment#resolveTarget | resolveTarget} (depending on whether we're using multisampling)
     * @param renderPass - current {@link RenderPass}
     * @param renderTexture - {@link GPUTexture} to use, or the {@link context} {@link GPUTexture | current texture} if null
     * @returns - the {@link GPUTexture | current render texture}
     */
    setRenderPassCurrentTexture(renderPass: RenderPass, renderTexture?: GPUTexture | null): GPUTexture;
    /**
     * Render a single {@link ComputePass}
     * @param commandEncoder - current {@link GPUCommandEncoder}
     * @param computePass - {@link ComputePass}
     */
    renderSingleComputePass(commandEncoder: GPUCommandEncoder, computePass: ComputePass): void;
    /**
     * Render a single {@link RenderedMesh | Mesh}
     * @param commandEncoder - current {@link GPUCommandEncoder}
     * @param mesh - {@link RenderedMesh | Mesh} to render
     */
    renderSingleMesh(commandEncoder: GPUCommandEncoder, mesh: RenderedMesh): void;
    /**
     * Render an array of objects (either {@link RenderedMesh | Meshes} or {@link ComputePass}) once. This method won't call any of the renderer render hooks like {@link onBeforeRender}, {@link onAfterRender}
     * @param objects - Array of {@link RenderedMesh | Meshes} or {@link ComputePass} to render
     */
    renderOnce(objects: SceneObject[]): void;
    /**
     * Force to clear a {@link GPURenderer} content to its {@link RenderPass#options.clearValue | clear value} by rendering and empty pass.
     * @param commandEncoder
     */
    forceClear(commandEncoder?: GPUCommandEncoder): void;
    /**
     * Called by the {@link GPUDeviceManager#render | GPUDeviceManager render method} before the {@link GPUCommandEncoder} has been created
     */
    onBeforeCommandEncoder(): void;
    /**
     * Called by the {@link GPUDeviceManager#render | GPUDeviceManager render method} after the {@link GPUCommandEncoder} has been created.
     */
    onAfterCommandEncoder(): void;
    /**
     * Called at each draw call to render our scene and its content
     * @param commandEncoder - current {@link GPUCommandEncoder}
     */
    render(commandEncoder: GPUCommandEncoder): void;
    /**
     * Destroy our {@link GPURenderer} and everything that needs to be destroyed as well
     */
    destroy(): void;
}
