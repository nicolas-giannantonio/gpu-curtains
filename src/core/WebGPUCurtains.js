import { CurtainsGPURenderer } from './renderer/CurtainsGPURenderer'
import { ScrollManager } from '../utils/ScrollManager'
import ResizeManager from '../utils/ResizeManager'
import { Vec3 } from '../math/Vec3'

export class WebGPUCurtains {
  constructor({ container, pixelRatio, fov }) {
    this.type = 'CurtainsGPU'
    this.container = container
    this.pixelRatio = pixelRatio

    this.options = {
      container,
      pixelRatio,
      fov,
    }

    if (container) {
      this.setContainer(container)
    }
  }

  /**
   * Set container
   *
   * @param container
   */
  setContainer(container) {
    if (!container) {
      let container = document.createElement('div')
      container.setAttribute('id', 'curtains-gpu-canvas')
      document.body.appendChild(container)
      this.container = container
    } else {
      if (typeof container === 'string') {
        container = document.getElementById(container)

        if (!container) {
          let container = document.createElement('div')
          container.setAttribute('id', 'curtains-gpu-canvas')
          document.body.appendChild(container)
          this.container = container
        } else {
          this.container = container
        }
      } else if (container instanceof Element) {
        this.container = container
      }
    }

    this.setCurtains()
  }

  /**
   * Set renderer
   */
  setRenderer() {
    this.renderer = new CurtainsGPURenderer({
      container: this.container,
      pixelRatio: this.pixelRatio,
      fov: this.options.fov,
    })

    this.canvas = this.renderer.canvas
  }

  /**
   * Set Curtains
   */
  setCurtains() {
    this.initEvents()

    this.setRenderer()

    // we are ready to go
    this.container.appendChild(this.canvas)

    // only if auto render
    this.animate()
  }

  initEvents() {
    ResizeManager.useObserver(true)

    this.initScroll()
  }

  // called only if autoResize is set to false
  resize() {
    this.renderer?.resize()
  }

  setPerspective(fov, near, far) {
    this.renderer?.setPerspective(fov, near, far)
  }

  setCameraPosition(position = new Vec3(0, 0, 1)) {
    this.renderer?.setCameraPosition(position)
  }

  /**
   * SCROLL
   */

  initScroll() {
    this.scrollManager = new ScrollManager({
      // init values
      xOffset: window.pageXOffset,
      yOffset: window.pageYOffset,
      lastXDelta: 0,
      lastYDelta: 0,
      shouldWatch: true,

      onScroll: (lastXDelta, lastYDelta) => this.updateScroll(lastXDelta, lastYDelta),
    })
  }

  updateScroll(lastXDelta, lastYDelta) {
    for (let i = 0; i < this.renderer.planes.length; i++) {
      this.renderer.planes[i].updateScrollPosition(lastXDelta, lastYDelta)
    }
  }

  /***
   This just handles our drawing animation frame
   ***/
  animate() {
    this.render()
    this.animationFrameID = window.requestAnimationFrame(this.animate.bind(this))
  }

  render() {
    this.renderer?.render()
  }

  destroy() {
    this.renderer?.destroy()
  }
}
