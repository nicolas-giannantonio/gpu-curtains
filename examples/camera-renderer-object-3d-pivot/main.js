import {
  GPUCameraRenderer,
  GPUDeviceManager,
  Object3D,
  Mesh,
  BoxGeometry,
  SphereGeometry,
  Vec3,
} from '../../dist/gpu-curtains.mjs'

window.addEventListener('load', async () => {
  // here is an example of how we can use a GPUDeviceManager and a simple GPUCameraRenderer instead of the whole GPUCurtains package
  // this shows us how to use gpu-curtains as a basic genuine 3D engine, not specifically related to DOM objects

  // first, we need a WebGPU device, that's what GPUDeviceManager is for
  const gpuDeviceManager = new GPUDeviceManager({
    label: 'Custom device manager',
    onError: () => {
      // handle device creation error here
      console.log('there has been an error!')
    },
  })

  // we need to wait for the device to be created
  await gpuDeviceManager.init()

  // then we can create a camera renderers
  const gpuCameraRenderer = new GPUCameraRenderer({
    deviceManager: gpuDeviceManager, // the renderer is going to use our WebGPU device to create its context
    container: document.querySelector('#canvas'),
    pixelRatio: Math.min(1.5, window.devicePixelRatio), // limit pixel ratio for performance
    camera: {
      near: 0,
      far: 20,
    },
  })

  // render it
  const animate = () => {
    gpuDeviceManager.render()
    requestAnimationFrame(animate)
  }

  animate()

  // very basic light shading
  const meshVs = /* wgsl */ `
    struct VertexOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
      @location(1) normal: vec3f,
    };
    
    @vertex fn main(
      attributes: Attributes,
    ) -> VertexOutput {
      var vsOutput: VertexOutput;
    
      vsOutput.position = getOutputPosition(attributes.position);
      vsOutput.uv = attributes.uv;
      // since the object scale has not changed this should work
      vsOutput.normal = normalize((matrices.world * vec4(attributes.normal, 0.0)).xyz);
      
      return vsOutput;
    }
  `

  const meshFs = /* wgsl */ `
    struct VSOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
      @location(1) normal: vec3f,
    };
    
    fn applyLightning(color: vec3f, normal: vec3f) -> vec3f {
      var lightPos: vec3f = normalize(shading.lightPosition);
      var light: f32 = smoothstep(0.15, 1.0, dot(normal, lightPos));
    
      var ambientLight: f32 = 1.0 - shading.lightStrength;
      return color.rgb * light * shading.lightStrength + color.rgb * shading.ambientLightStrength;
    }
    
    @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {      
      var color: vec4f;
        
      var shadedColor: vec3f = applyLightning(shading.color, fsInput.normal);
      color = vec4(shadedColor, 1.0);
    
      return color;
    }
  `

  const blue = new Vec3(0, 1, 1)
  const pink = new Vec3(1, 0, 1)
  const lightPosition = new Vec3(0, 10, 10)
  const lightStrength = 0.6
  const ambientLightStrength = 0.5

  const nbElements = 10
  for (let i = 0; i < nbElements; i++) {
    const pivot = new Object3D()

    // shrink everything
    pivot.scale.set(0.2)

    const pivotRotationSpeed = (Math.random() * 0.015 + 0.01) * Math.sign(Math.random() - 0.5)

    pivot.quaternion.setAxisOrder('ZYX')
    pivot.rotation.z = (Math.random() * Math.PI * 0.75 + Math.PI * 0.25) * Math.sign(Math.random() - 0.5)

    // lerp colors from blue to pink
    const lerpValue = i / (nbElements - 1)
    const meshColor = blue.clone().lerp(pink, lerpValue)

    // now add a small sphere that will act as our pivot center helper
    // note we could have directly used the mesh as a parent!
    const pivotSphere = new Mesh(gpuCameraRenderer, {
      label: 'Pivot center ' + i,
      geometry: new SphereGeometry(),
      shaders: {
        vertex: {
          code: meshVs,
        },
        fragment: {
          code: meshFs,
        },
      },
      uniforms: {
        shading: {
          struct: {
            color: {
              type: 'vec3f',
              value: meshColor,
            },
            lightPosition: {
              type: 'vec3f',
              value: lightPosition,
            },
            lightStrength: {
              type: 'f32',
              value: lightStrength,
            },
            ambientLightStrength: {
              type: 'f32',
              value: ambientLightStrength,
            },
          },
        },
      },
    })

    pivotSphere.scale.set(0.2)
    // add pivot as parent
    pivotSphere.parent = pivot

    // create a cube mesh
    const cube = new Mesh(gpuCameraRenderer, {
      label: 'Cube ' + i,
      geometry: new BoxGeometry(),
      shaders: {
        vertex: {
          code: meshVs,
        },
        fragment: {
          code: meshFs,
        },
      },
      uniforms: {
        shading: {
          struct: {
            color: {
              type: 'vec3f',
              value: meshColor,
            },
            lightPosition: {
              type: 'vec3f',
              value: lightPosition,
            },
            lightStrength: {
              type: 'f32',
              value: lightStrength,
            },
            ambientLightStrength: {
              type: 'f32',
              value: ambientLightStrength,
            },
          },
        },
      },
    })

    // random position along X axis
    cube.position.x = (7.5 * Math.random() + 7.5) * Math.sign(Math.random() - 0.5)

    // add pivot as parent
    cube.parent = pivot
    // look at pivot center
    cube.lookAt(pivot.position)

    let time = i * -30

    cube.onRender(() => {
      time++

      // move pivot along x axis
      pivot.position.x = Math.cos(time * 0.01) * 4

      // rotate the pivot
      pivot.rotation.y += pivotRotationSpeed
    })
  }
})
