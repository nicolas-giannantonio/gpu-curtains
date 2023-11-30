window.addEventListener('DOMContentLoaded', async () => {
  const systemSize = 10

  // here is an example of how we can use a simple GPUCameraRenderer instead of GPUCurtains
  // this shows us how to use gpu-curtains as a basic genuine 3D engine, not related to DOM
  // so, let's start by creating a camera renderer
  const gpuCameraRenderer = new GPUCurtains.GPUCameraRenderer({
    container: document.querySelector('#canvas'),
    pixelRatio: Math.min(1.5, window.devicePixelRatio), // limit pixel ratio for performance
    camera: {
      far: systemSize * 10,
    },
  })

  // set the renderer context
  await gpuCameraRenderer.setContext()

  // get the camera
  const { camera } = gpuCameraRenderer

  console.log(camera)

  // each time we'll change the camera position, we'll update its transform origin as well
  // that way it will act as an orbit camera
  const cameraPosition = new GPUCurtains.Vec3().onChange(() => {
    camera.position.copy(cameraPosition)
    camera.transformOrigin.set(-1 * cameraPosition.x, -1 * cameraPosition.y, -1 * cameraPosition.z)
  })

  // set the camera initial position
  cameraPosition.z = systemSize * 4

  // render our scene manually
  const animate = () => {
    //camera.rotation.y += 0.01
    gpuCameraRenderer.render()

    requestAnimationFrame(animate)
  }

  animate()

  // now the orbit controls
  const mouse = {
    current: new GPUCurtains.Vec2(Infinity),
    last: new GPUCurtains.Vec2(Infinity),
    delta: new GPUCurtains.Vec2(),
    isDown: false,
  }

  window.addEventListener('touchstart', () => {
    mouse.isDown = true
  })
  window.addEventListener('mousedown', () => {
    mouse.isDown = true
  })

  window.addEventListener('touchend', () => {
    mouse.isDown = false
    mouse.last.set(Infinity)
  })
  window.addEventListener('mouseup', () => {
    mouse.isDown = false
    mouse.last.set(Infinity)
  })

  window.addEventListener('pointermove', (e) => {
    if (!mouse.isDown) return

    mouse.current.set(e.clientX, e.clientY)

    if (mouse.last.x === Infinity) {
      mouse.last.copy(mouse.current)
    }

    mouse.delta.set(mouse.current.x - mouse.last.x, mouse.current.y - mouse.last.y)

    camera.rotation.y -= mouse.delta.x * 0.01
    camera.rotation.x -= mouse.delta.y * 0.01 * Math.sign(Math.cos(camera.rotation.y))

    mouse.last.copy(mouse.current)
  })

  window.addEventListener('wheel', (e) => {
    const newPosition = cameraPosition.clone().multiplyScalar(1 + Math.sign(e.deltaY) * 0.1)

    // max zoom
    if (newPosition.length() <= systemSize * 6) {
      cameraPosition.copy(newPosition)
    }
  })

  // now add objects to our scene
  const cubeGeometry = new GPUCurtains.BoxGeometry()
  const sphereGeometry = new GPUCurtains.SphereGeometry()

  for (let i = 0; i < 50; i++) {
    const mesh = new GPUCurtains.Mesh(gpuCameraRenderer, {
      geometry: Math.random() > 0.5 ? cubeGeometry : sphereGeometry,
    })

    mesh.position.x = Math.random() * systemSize * 2 - systemSize
    mesh.position.y = Math.random() * systemSize * 2 - systemSize
    mesh.position.z = Math.random() * systemSize * 2 - systemSize

    const rotationSpeed = Math.random() * 0.025

    mesh.onRender(() => {
      mesh.rotation.y += rotationSpeed
      mesh.rotation.z += rotationSpeed
    })
  }
})
