import { CameraRenderer, isCameraRenderer } from '../renderers/utils'
import { ProjectedObject3D } from '../objects3D/ProjectedObject3D'
import MeshTransformedMixin from './MeshTransformedMixin'
import MeshBaseMixin, { MeshBaseParams } from './MeshBaseMixin'
import { GPUCurtains } from '../../curtains/GPUCurtains'

/**
 * @typedef {object} MeshBaseMixin
 * @extends ProjectedObject3D
 */

/**
 * Mesh class:
 * Create a Mesh, with model and projection matrices.
 * TODO!
 * @extends MeshTransformedMixin
 * @mixes {MeshBaseMixin}
 */
export class Mesh extends MeshTransformedMixin(ProjectedObject3D) {
  constructor(renderer: CameraRenderer | GPUCurtains, parameters = {} as MeshBaseParams) {
    // we could pass our curtains object OR our curtains renderer object
    renderer = (renderer && (renderer as GPUCurtains).renderer) || (renderer as CameraRenderer)

    isCameraRenderer(renderer, parameters.label ? parameters.label + ' Mesh' : 'Mesh')

    // @ts-ignore
    super(renderer, null, parameters)

    this.type = 'Mesh'
  }
}
