import { Box3 } from '../../math/Box3';
import { Mat4 } from '../../math/Mat4';
import { DOMElementBoundingRect, RectCoords } from './DOMElement';
/**
 * An object defining all possible {@link DOMFrustum} class instancing parameters
 */
export interface DOMFrustumParams {
    /** our 3D Object bounding box, i.e. size in world space before any transform. Usually defined by a {@link Geometry} */
    boundingBox?: Box3;
    /** [model view projection matrix]{@link ProjectedObject3D#modelViewProjectionMatrix} to use for frustum calculations */
    modelViewProjectionMatrix?: Mat4;
    /** the [bounding rectangle]{@link DOMElementBoundingRect} to check against */
    containerBoundingRect?: DOMElementBoundingRect;
    /** additional margins to add to [containerBoundingRect]{@link DOMFrustumParams#containerBoundingRect} */
    DOMFrustumMargins?: RectCoords;
    /** callback to run when the [projectedBoundingRect]{@link DOMFrustumParams#projectedBoundingRect} reenters the view frustum */
    onReEnterView?: () => void;
    /** callback to run when the [projectedBoundingRect]{@link DOMFrustumParams#projectedBoundingRect} leaves the view frustum */
    onLeaveView?: () => void;
}
/**
 * DOMFrustum class:
 * Used to check if a {@link ProjectedObject3D} is currently contained inside a DOM bounding rectangle.
 * Uses a modelViewProjectionMatrix that contains both 3D Object and Camera useful transformation and projection informations.
 * The DOM bounding rectangle to check against usually is the {@link GPURenderer}'s {@link DOMElement} bounding rectangle, unless frustum margins are specified.
 */
export declare class DOMFrustum {
    /** Our 3D Object bounding box, i.e. size in world space before any transform. Usually defined by a {@link Geometry} */
    boundingBox: Box3;
    /** A model view projection matrix defining transformations, usually from a {@link ProjectedObject3D}, to use for frustum calculations */
    modelViewProjectionMatrix: Mat4;
    /** The DOM bounding rectangle to check against, usually the renderer DOM Element bounding rectangle */
    containerBoundingRect: DOMElementBoundingRect;
    /** Additional margins to add to {@link containerBoundingRect} */
    DOMFrustumMargins: RectCoords;
    /** A DOM Element bounding rectangle representing the result of our {@link boundingBox} with the {@link modelViewProjectionMatrix} applied */
    projectedBoundingRect: DOMElementBoundingRect;
    /** Callback to run when the {@link projectedBoundingRect} reenters the view frustum */
    onReEnterView: () => void;
    /** Callback to run when the {@link projectedBoundingRect} leaves the view frustum */
    onLeaveView: () => void;
    /** Flag to indicate whether the given {@link projectedBoundingRect} is intersecting our view frustum */
    isIntersecting: boolean;
    /** Flag to indicate whether we should update our {@link projectedBoundingRect} */
    shouldUpdate: boolean;
    /**
     * DOMFrustum constructor
     * @param {DOMFrustumParams} parameters - [parameters]{@link DOMFrustumParams} used to create our {@link DOMFrustum}
     */
    constructor({ boundingBox, modelViewProjectionMatrix, containerBoundingRect, DOMFrustumMargins, onReEnterView, onLeaveView, }: DOMFrustumParams);
    /**
     * Set our {@link containerBoundingRect} (called on resize)
     * @param boundingRect - new bounding rectangle
     */
    setContainerBoundingRect(boundingRect: DOMElementBoundingRect): void;
    /**
     * Get our DOM frustum bounding rectangle, i.e. our {@link containerBoundingRect} with the {@link DOMFrustumMargins} applied
     * @readonly
     */
    get DOMFrustumBoundingRect(): RectCoords;
    /**
     * Applies all {@link modelViewProjectionMatrix} transformations to our {@link boundingBox} and then check against intersections
     */
    computeProjectedToDocumentCoords(): void;
    /**
     * Check whether our {@link projectedBoundingRect} intersects with our {@link DOMFrustumBoundingRect}
     */
    intersectsContainer(): void;
}
