import { Binding, BindingParams } from './Binding'
import { SamplerOptions } from '../samplers/Sampler'

/** Defines a {@link SamplerBinding} {@link SamplerBinding#resource | resource} */
export type SamplerBindingResource = GPUSampler | null

/**
 * An object defining all possible {@link SamplerBinding} class instancing parameters
 */
export interface SamplerBindingParams extends BindingParams {
  /** {@link SamplerBinding} {@link GPUBindGroup | GPU bind group} resource */
  sampler: SamplerBindingResource
  /** The bind group layout binding {@link GPUSamplerBindingLayout#type | type} of this {@link GPUSampler | GPU sampler} */
  type: SamplerOptions['type']
}

/**
 * SamplerBinding class:
 * Used to handle GPUSampler struct
 */
export class SamplerBinding extends Binding {
  /** Our {@link SamplerBinding} resource, i.e. a {@link GPUSampler} */
  sampler: SamplerBindingResource
  /** An array of strings to append to our shaders code declaring all the WGSL variables representing this {@link SamplerBinding} */
  wgslGroupFragment: string[]
  /** Options used to create this {@link SamplerBinding} */
  options: SamplerBindingParams

  /**
   * SamplerBinding constructor
   * @param parameters - {@link SamplerBindingParams | parameters} used to create our SamplerBindings
   */
  constructor({
    label = 'Sampler',
    name = 'sampler',
    bindingType,
    visibility,
    sampler,
    type = 'filtering',
  }: SamplerBindingParams) {
    bindingType = bindingType ?? 'sampler'

    super({ label, name, bindingType, visibility })

    this.options = {
      ...this.options,
      sampler,
      type,
    }

    this.resource = sampler // should be a sampler

    this.setWGSLFragment()
  }

  /**
   * Get {@link GPUBindGroupLayoutEntry#sampler | bind group layout entry resource}
   * @readonly
   */
  get resourceLayout(): { sampler: GPUSamplerBindingLayout } {
    return {
      sampler: {
        type: this.options.type, // TODO set shouldResetBindGroupLayout to true if it changes afterwards
      },
    }
  }

  /**
   * Get the {@link GPUBindGroupEntry#resource | bind group resource}
   */
  get resource(): SamplerBindingResource {
    return this.sampler
  }

  /**
   * Set the {@link GPUBindGroupEntry#resource | bind group resource}
   * @param value - new bind group resource
   */
  set resource(value: SamplerBindingResource) {
    // resource changed, update bind group!
    if (value && this.sampler) this.shouldResetBindGroup = true
    this.sampler = value
  }

  /**
   * Set the correct WGSL code snippet.
   */
  setWGSLFragment() {
    this.wgslGroupFragment = [`var ${this.name}: ${this.bindingType};`]
  }
}
