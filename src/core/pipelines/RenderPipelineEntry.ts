import { PipelineEntry } from './PipelineEntry'
import { ProjectedShaderChunks, ShaderChunks } from '../shaders/ShaderChunks'
import { CameraRenderer, isRenderer, Renderer } from '../renderers/utils'
import { throwError } from '../../utils/utils'
import {
  PipelineEntryParams,
  PipelineEntryShaders,
  RenderPipelineEntryOptions,
  RenderPipelineEntryParams,
  RenderPipelineEntryPropertiesParams
} from '../../types/PipelineEntries'
import { GPUCurtains } from '../../curtains/GPUCurtains'
import { AllowedBindGroups, BindGroupBufferBindingElement } from '../../types/BindGroups'
import { RenderMaterialAttributes } from '../../types/Materials'

/**
 * Used to create a {@link PipelineEntry} specifically designed to handle {@link core/materials/RenderMaterial.RenderMaterial | RenderMaterial}.
 *
 * ## Shaders patching
 *
 * The {@link RenderPipelineEntry} uses each of its {@link RenderPipelineEntry#bindGroups | bind groups} {@link core/bindings/Binding.Binding | Binding} to patch the given compute shader before creating the {@link GPUShaderModule}.<br>
 * It will prepend every {@link core/bindings/Binding.Binding | Binding} WGSL code snippets (or fragments) with the correct bind group and bindings indices.
 *
 * ## Pipeline compilation
 *
 * The {@link RenderPipelineEntry} will then create a {@link GPURenderPipeline} (asynchronously by default).
 */
export class RenderPipelineEntry extends PipelineEntry {
  /** Shaders to use with this {@link RenderPipelineEntry} */
  shaders: PipelineEntryShaders
  /** {@link RenderMaterialAttributes | Geometry attributes} sent to the {@link RenderPipelineEntry} */
  attributes: RenderMaterialAttributes
  /** {@link GPURenderPipelineDescriptor | Render pipeline descriptor} based on {@link layout} and {@link shaders} */
  descriptor: GPURenderPipelineDescriptor | null
  /** Options used to create this {@link RenderPipelineEntry} */
  options: RenderPipelineEntryOptions

  /**
   * RenderPipelineEntry constructor
   * @param parameters - {@link RenderPipelineEntryParams | parameters} used to create this {@link RenderPipelineEntry}
   */
  constructor(parameters: RenderPipelineEntryParams) {
    let { renderer } = parameters
    const { label, ...renderingOptions } = parameters

    // we could pass our curtains object OR our curtains renderer object
    renderer = (renderer && (renderer as GPUCurtains).renderer) || (renderer as Renderer)

    const type = 'RenderPipelineEntry'

    isRenderer(renderer, label ? label + ' ' + type : type)

    super(parameters)

    this.type = type

    this.shaders = {
      vertex: {
        head: '',
        code: '',
        module: null,
      },
      fragment: {
        head: '',
        code: '',
        module: null,
      },
      full: {
        head: '',
        code: '',
        module: null,
      },
    }

    this.descriptor = null

    this.options = {
      ...this.options,
      ...renderingOptions,
    } as RenderPipelineEntryOptions
  }

  // TODO! need to chose whether we should silently add the camera bind group here
  // or explicitly in the RenderMaterial class createBindGroups() method
  /**
   * Merge our {@link bindGroups | pipeline entry bind groups} with the {@link CameraRenderer#cameraBindGroup | camera bind group} if needed and set them
   * @param bindGroups - {@link core/materials/RenderMaterial.RenderMaterial#bindGroups | bind groups} to use with this {@link RenderPipelineEntry}
   */
  setPipelineEntryBindGroups(bindGroups: AllowedBindGroups[]) {
    this.bindGroups =
      'cameraBindGroup' in this.renderer && this.options.useProjection
        ? [this.renderer.cameraBindGroup, ...bindGroups]
        : bindGroups
  }

  /**
   * Set {@link RenderPipelineEntry} properties (in this case the {@link bindGroups | bind groups} and {@link attributes})
   * @param parameters - the {@link core/materials/RenderMaterial.RenderMaterial#bindGroups | bind groups} and {@link core/materials/RenderMaterial.RenderMaterial#attributes | attributes} to use
   */
  setPipelineEntryProperties(parameters: RenderPipelineEntryPropertiesParams) {
    const { attributes, bindGroups } = parameters

    this.attributes = attributes

    this.setPipelineEntryBindGroups(bindGroups)
  }

  /* SHADERS */

  /**
   * Patch the shaders by appending all the necessary shader chunks, {@link bindGroups | bind groups}) and {@link attributes} WGSL code fragments to the given {@link PipelineEntryParams#shaders | parameter shader code}
   */
  patchShaders() {
    this.shaders.vertex.head = ''
    this.shaders.vertex.code = ''
    this.shaders.fragment.head = ''
    this.shaders.fragment.code = ''
    this.shaders.full.head = ''
    this.shaders.full.code = ''

    // first add chunks
    for (const chunk in ShaderChunks.vertex) {
      this.shaders.vertex.head = `${ShaderChunks.vertex[chunk]}\n${this.shaders.vertex.head}`
      this.shaders.full.head = `${ShaderChunks.vertex[chunk]}\n${this.shaders.full.head}`
    }

    for (const chunk in ShaderChunks.fragment) {
      this.shaders.fragment.head = `${ShaderChunks.fragment[chunk]}\n${this.shaders.fragment.head}`

      if (this.shaders.full.head.indexOf(ShaderChunks.fragment[chunk]) === -1) {
        this.shaders.full.head = `${ShaderChunks.fragment[chunk]}\n${this.shaders.full.head}`
      }
    }

    if (this.options.useProjection) {
      for (const chunk in ProjectedShaderChunks.vertex) {
        this.shaders.vertex.head = `${ProjectedShaderChunks.vertex[chunk]}\n${this.shaders.vertex.head}`
        this.shaders.full.head = `${ProjectedShaderChunks.vertex[chunk]}\n${this.shaders.full.head}`
      }

      for (const chunk in ProjectedShaderChunks.fragment) {
        this.shaders.fragment.head = `${ProjectedShaderChunks.fragment[chunk]}\n${this.shaders.fragment.head}`

        if (this.shaders.full.head.indexOf(ProjectedShaderChunks.fragment[chunk]) === -1) {
          this.shaders.full.head = `${ProjectedShaderChunks.fragment[chunk]}\n${this.shaders.full.head}`
        }
      }
    }

    const groupsBindings = []
    this.bindGroups.forEach((bindGroup) => {
      let bindIndex = 0
      bindGroup.bindings.forEach((binding, bindingIndex) => {
        binding.wgslGroupFragment.forEach((groupFragment, groupFragmentIndex) => {
          groupsBindings.push({
            groupIndex: bindGroup.index,
            visibility: binding.visibility,
            bindIndex,
            wgslStructFragment: (binding as BindGroupBufferBindingElement).wgslStructFragment,
            wgslGroupFragment: groupFragment,
            newLine:
              bindingIndex === bindGroup.bindings.length - 1 &&
              groupFragmentIndex === binding.wgslGroupFragment.length - 1,
          })

          bindIndex++
        })
      })
    })

    groupsBindings.forEach((groupBinding) => {
      if (
        groupBinding.visibility === GPUShaderStage.VERTEX ||
        groupBinding.visibility === (GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE)
      ) {
        // do not duplicate structs
        if (
          groupBinding.wgslStructFragment &&
          this.shaders.vertex.head.indexOf(groupBinding.wgslStructFragment) === -1
        ) {
          this.shaders.vertex.head = `\n${groupBinding.wgslStructFragment}\n${this.shaders.vertex.head}`
        }

        // do not duplicate struct var as well
        if (this.shaders.vertex.head.indexOf(groupBinding.wgslGroupFragment) === -1) {
          this.shaders.vertex.head = `${this.shaders.vertex.head}\n@group(${groupBinding.groupIndex}) @binding(${groupBinding.bindIndex}) ${groupBinding.wgslGroupFragment}`

          if (groupBinding.newLine) this.shaders.vertex.head += `\n`
        }
      }

      if (
        groupBinding.visibility === GPUShaderStage.FRAGMENT ||
        groupBinding.visibility === (GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE)
      ) {
        // do not duplicate structs
        if (
          groupBinding.wgslStructFragment &&
          this.shaders.fragment.head.indexOf(groupBinding.wgslStructFragment) === -1
        ) {
          this.shaders.fragment.head = `\n${groupBinding.wgslStructFragment}\n${this.shaders.fragment.head}`
        }

        // do not duplicate struct var as well
        if (this.shaders.fragment.head.indexOf(groupBinding.wgslGroupFragment) === -1) {
          this.shaders.fragment.head = `${this.shaders.fragment.head}\n@group(${groupBinding.groupIndex}) @binding(${groupBinding.bindIndex}) ${groupBinding.wgslGroupFragment}`

          if (groupBinding.newLine) this.shaders.fragment.head += `\n`
        }
      }

      if (groupBinding.wgslStructFragment && this.shaders.full.head.indexOf(groupBinding.wgslStructFragment) === -1) {
        this.shaders.full.head = `\n${groupBinding.wgslStructFragment}\n${this.shaders.full.head}`
      }

      if (this.shaders.full.head.indexOf(groupBinding.wgslGroupFragment) === -1) {
        this.shaders.full.head = `${this.shaders.full.head}\n@group(${groupBinding.groupIndex}) @binding(${groupBinding.bindIndex}) ${groupBinding.wgslGroupFragment}`

        if (groupBinding.newLine) this.shaders.full.head += `\n`
      }
    })

    // add attributes to vertex shader only
    this.shaders.vertex.head = `${this.attributes.wgslStructFragment}\n${this.shaders.vertex.head}`
    this.shaders.full.head = `${this.attributes.wgslStructFragment}\n${this.shaders.full.head}`

    this.shaders.vertex.code = this.shaders.vertex.head + this.options.shaders.vertex.code
    this.shaders.fragment.code = this.shaders.fragment.head + this.options.shaders.fragment.code

    // check if its one shader string with different entry points
    if (
      this.options.shaders.vertex.entryPoint !== this.options.shaders.fragment.entryPoint &&
      this.options.shaders.vertex.code.localeCompare(this.options.shaders.fragment.code) === 0
    ) {
      this.shaders.full.code = this.shaders.full.head + this.options.shaders.vertex.code
    } else {
      this.shaders.full.code =
        this.shaders.full.head + this.options.shaders.vertex.code + this.options.shaders.fragment.code
    }
  }

  /* SETUP */

  /**
   * Create the {@link shaders}: patch them and create the {@link GPUShaderModule}
   */
  createShaders() {
    this.patchShaders()

    const isSameShader =
      this.options.shaders.vertex.entryPoint !== this.options.shaders.fragment.entryPoint &&
      this.options.shaders.vertex.code.localeCompare(this.options.shaders.fragment.code) === 0

    this.shaders.vertex.module = this.createShaderModule({
      code: this.shaders[isSameShader ? 'full' : 'vertex'].code,
      type: 'vertex',
    })

    this.shaders.fragment.module = this.createShaderModule({
      code: this.shaders[isSameShader ? 'full' : 'fragment'].code,
      type: 'fragment',
    })
  }

  /**
   * Create the render pipeline {@link descriptor}
   */
  createPipelineDescriptor() {
    if (!this.shaders.vertex.module || !this.shaders.fragment.module) return

    let vertexLocationIndex = -1

    // we will assume our renderer alphaMode is set to 'premultiplied'
    // we either disable blending if mesh if opaque
    // use a custom blending if set
    // or use this blend equation if mesh is transparent (see https://limnu.com/webgl-blending-youre-probably-wrong/)
    const blend =
      this.options.blend ??
      (this.options.transparent && {
        color: {
          srcFactor: 'src-alpha',
          dstFactor: 'one-minus-src-alpha',
        },
        alpha: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src-alpha',
        },
      })

    this.descriptor = {
      label: this.options.label,
      layout: this.layout,
      vertex: {
        module: this.shaders.vertex.module,
        entryPoint: this.options.shaders.vertex.entryPoint,
        buffers: this.attributes.vertexBuffers.map((vertexBuffer) => {
          return {
            stepMode: vertexBuffer.stepMode,
            arrayStride: vertexBuffer.arrayStride * 4, // 4 bytes each
            attributes: vertexBuffer.attributes.map((attribute) => {
              vertexLocationIndex++
              return {
                shaderLocation: vertexLocationIndex,
                offset: attribute.bufferOffset, // previous attribute size * 4
                format: attribute.bufferFormat,
              }
            }),
          }
        }),
      },
      fragment: {
        module: this.shaders.fragment.module,
        entryPoint: this.options.shaders.fragment.entryPoint,
        targets: [
          {
            format: this.options.targetFormat ?? this.renderer.options.preferredFormat,
            ...(blend && {
              blend,
            }),
          },
        ],
      },
      primitive: {
        topology: this.options.topology,
        frontFace: this.options.verticesOrder,
        cullMode: this.options.cullMode,
      },
      ...(this.options.depth && {
        depthStencil: {
          depthWriteEnabled: this.options.depthWriteEnabled,
          depthCompare: this.options.depthCompare,
          format: 'depth24plus',
        },
      }),
      ...(this.options.sampleCount > 1 && {
        multisample: {
          count: this.options.sampleCount,
        },
      }),
    } as GPURenderPipelineDescriptor
  }

  /**
   * Create the render {@link pipeline}
   */
  createRenderPipeline() {
    if (!this.shaders.vertex.module || !this.shaders.fragment.module) return

    try {
      this.pipeline = this.renderer.createRenderPipeline(this.descriptor)
    } catch (error) {
      this.status.error = error
      throwError(error)
    }
  }

  /**
   * Asynchronously create the render {@link pipeline}
   * @async
   * @returns - void promise result
   */
  async createRenderPipelineAsync(): Promise<void> {
    if (!this.shaders.vertex.module || !this.shaders.fragment.module) return

    try {
      this.pipeline = await this.renderer.createRenderPipelineAsync(this.descriptor)
      this.status.compiled = true
      this.status.compiling = false
      this.status.error = null
    } catch (error) {
      this.status.error = error
      throwError(error)
    }
  }

  /**
   * Call {@link PipelineEntry#compilePipelineEntry | PipelineEntry compilePipelineEntry} method, then create our render {@link pipeline}
   * @async
   */
  async compilePipelineEntry(): Promise<void> {
    super.compilePipelineEntry()

    if (this.options.useAsync) {
      await this.createRenderPipelineAsync()
    } else {
      this.createRenderPipeline()
      this.status.compiled = true
      this.status.compiling = false
      this.status.error = null
    }
  }
}
