/// <reference types="dist" />
import { Bindings, BindingsParams } from './Bindings';
/** Defines a {@link SamplerBindings} [resource]{@link SamplerBindings#resource} */
export type SamplerBindingResource = GPUSampler | null;
/**
 * An object defining all possible {@link SamplerBindings} class instancing parameters
 */
export interface SamplerBindingsParams extends BindingsParams {
    /** {@link SamplerBindings} [bind group]{@link GPUBindGroup} resource */
    resource: SamplerBindingResource;
}
/**
 * SamplerBindings class:
 * Used to handle GPUSampler bindings
 * @extends Bindings
 */
export declare class SamplerBindings extends Bindings {
    /** Our {@link SamplerBindings} resource, i.e. a {@link GPUSampler} */
    resource: SamplerBindingResource;
    /** An array of strings to append to our shaders code declaring all the WGSL variables representing this {@link SamplerBindings} */
    wgslGroupFragment: string[];
    /**
     * SamplerBindings constructor
     * @param {SamplerBindingsParams} parameters - parameters used to create our SamplerBindings
     * @param {string=} parameters.label - binding label
     * @param {string=} parameters.name - binding name
     * @param {BindingType="uniform"} parameters.bindingType - binding type
     * @param {number=} parameters.bindIndex - bind index inside the bind group
     * @param {MaterialShadersType=} parameters.visibility - shader visibility
     * @param {SamplerBindingResource=} parameters.resource - a GPUSampler
     */
    constructor({ label, name, bindingType, bindIndex, visibility, resource, }: SamplerBindingsParams);
    /**
     * Set the correct WGSL code snippet.
     */
    setWGSLFragment(): void;
}
