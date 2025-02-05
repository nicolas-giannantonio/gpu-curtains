export class TestRenderTargets {
  constructor({ gpuCurtains }) {
    this.gpuCurtains = gpuCurtains

    // const renderer = new GPURenderer({
    //   deviceManager: this.gpuCurtains.deviceManager,
    // })
    console.log(this.gpuCurtains.renderer.options)

    this.lerp = (start = 0, end = 1, amount = 0.1) => {
      return (1 - amount) * start + amount * end
    }

    this.scrollEffect = 0

    this.gpuCurtains
      .onRender(() => {
        // update our scroll effect
        // increase/decrease the effect
        this.scrollEffect = this.lerp(this.scrollEffect, 0, 0.075)
      })
      .onScroll(() => {
        // get scroll deltas to apply the effect on scroll
        const delta = gpuCurtains.scrollDelta

        // invert value for the effect
        delta.y = -delta.y

        // clamp values
        delta.y = Math.min(100, Math.max(-100, delta.y))

        if (Math.abs(delta.y) > Math.abs(this.scrollEffect)) {
          this.scrollEffect = this.lerp(this.scrollEffect, delta.y, 0.5)
        }
      })

    this.init()
  }

  async init() {
    const path = location.hostname === 'localhost' ? '../../src/index' : '../../dist/gpu-curtains.mjs'
    const { Plane, RenderTarget, Sampler, ShaderPass } = await import(path)

    // We don't want to see our pass texture top/bottom edges
    // so we're going to use a custom sampler with mirror repeat
    const mirrorSampler = new Sampler(this.gpuCurtains, {
      label: 'Mirror sampler',
      name: 'mirrorSampler',
      addressModeU: 'mirror-repeat',
      addressModeV: 'mirror-repeat',
    })

    const planeVs = /* wgsl */ `
    struct VSOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };
  
    @vertex fn main(
      attributes: Attributes,
    ) -> VSOutput {
      var vsOutput: VSOutput;
  
      vsOutput.position = getOutputPosition(attributes.position);
      vsOutput.uv = getUVCover(attributes.uv, planeTextureMatrix);
  
      return vsOutput;
    }
  `

    const planeFs = /* wgsl */ `
    struct VSOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };
  
    @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {
      return textureSample(planeTexture, defaultSampler, fsInput.uv);
    }
  `

    // first we're going to render large planes into a grayscale pass
    this.grayscaleTarget = new RenderTarget(this.gpuCurtains, {
      label: 'Large planes distortion render target',
      //sampleCount: 1,
    })
    this.largePlanes = []

    const largePlaneEls = document.querySelectorAll('.large-plane')
    largePlaneEls.forEach((largePlaneEl, index) => {
      const largePlane = new Plane(this.gpuCurtains, largePlaneEl, {
        label: `Large plane ${index}`,
        //renderTarget: grayscaleTarget, // we could do that directly
        shaders: {
          vertex: {
            code: planeVs,
          },
          fragment: {
            code: planeFs,
          },
        },
      })

      largePlane.setRenderTarget(this.grayscaleTarget)
      this.largePlanes.push(largePlane)
    })

    const grayscaleFs = /* wgsl */ `
    struct VSOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };
  
    @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {
      var color: vec4f = textureSample(renderTexture, mirrorSampler, fsInput.uv);
      var grayscale: vec3f = vec3(color.r * 0.3 + color.g * 0.59 + color.b * 0.11);
      var grayscaleColor: vec4f = vec4(grayscale, color.a);
    
      return mix(color, grayscaleColor, min(1.0, abs(scrollEffect.strength / 15.0)));
    }
  `

    this.grayscalePass = new ShaderPass(this.gpuCurtains, {
      label: 'Large plane shader pass',
      //renderTarget: grayscaleTarget, // we could do that directly
      //renderOrder: 1, // uncomment to draw large planes above small planes
      shaders: {
        fragment: {
          code: grayscaleFs,
          entryPoint: 'main',
        },
      },
      uniforms: {
        scrollEffect: {
          label: 'ScrollEffect',
          struct: {
            strength: {
              type: 'f32',
              value: 0,
            },
          },
        },
      },

      samplers: [mirrorSampler],
    })

    this.grayscalePass.setRenderTarget(this.grayscaleTarget)

    this.grayscalePass.onRender(() => {
      // update the uniform
      this.grayscalePass.uniforms.scrollEffect.strength.value = this.scrollEffect
    })

    // setTimeout(() => {
    //   grayscalePass.remove()
    //   console.log(gpuCurtains.renderer.scene)
    // }, 5000)

    // now render the small planes into a RGB shift pass
    this.rgbShiftTarget = new RenderTarget(this.gpuCurtains, {
      label: 'Small planes RGB render target',
      //sampleCount: 1,
    })

    this.smallPlanes = []

    const smallPlaneEls = document.querySelectorAll('.small-plane')
    smallPlaneEls.forEach((smallPlaneEl, index) => {
      const smallPlane = new Plane(this.gpuCurtains, smallPlaneEl, {
        label: `Small plane ${index}`,
        renderTarget: this.rgbShiftTarget,
        shaders: {
          vertex: {
            code: planeVs,
            entryPoint: 'main',
          },
          fragment: {
            code: planeFs,
            entryPoint: 'main',
          },
        },
      })

      this.smallPlanes.push(smallPlane)
    })

    const rgbShiftFs = /* wgsl */ `
    struct VSOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };

    @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {
      var uv: vec2f = fsInput.uv;
    
      var red: vec4f = textureSample(renderTexture, mirrorSampler, vec2(uv.x, uv.y - scrollEffect.strength / 500.0));
      var green: vec4f = textureSample(renderTexture, mirrorSampler, vec2(uv.x, uv.y - scrollEffect.strength / 1000.0));
      var blue: vec4f = textureSample(renderTexture, mirrorSampler, vec2(uv.x, uv.y - scrollEffect.strength / 1500.0));
    
      var color = vec4(red.r, green.g, blue.b, min(1.0, red.a + blue.a + green.a));
      return color;
    }
  `

    this.rgbShiftPass = new ShaderPass(this.gpuCurtains, {
      label: 'Small plane shader pass',
      renderTarget: this.rgbShiftTarget,
      shaders: {
        fragment: {
          code: rgbShiftFs,
          entryPoint: 'main',
        },
      },
      uniforms: {
        scrollEffect: {
          label: 'ScrollEffect',
          struct: {
            strength: {
              type: 'f32',
              value: 0,
            },
          },
        },
      },
      samplers: [mirrorSampler],
    })

    this.rgbShiftPass.onRender(() => {
      // update the uniform
      this.rgbShiftPass.uniforms.scrollEffect.strength.value = this.scrollEffect
    })

    // add a final pass that distort the whole scene on scroll
    const finalShaderPassFs = /* wgsl */ `
    struct VSOutput {
      @builtin(position) position: vec4f,
      @location(0) uv: vec2f,
    };

    @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {
      var uv: vec2f = fsInput.uv;
      
      // uv = uv * 2 - 1;
      // uv = uv * (1 - abs(scrollEffect.strength) / 200.0);
      // uv = uv * 0.5 + 0.5;
      
      var horizontalStretch: f32 = 0.0;
      var scrollDeformation: f32 = scrollEffect.strength / 5.0;
      var effectStrength: f32 = 2.5;

      // branching on an uniform is ok
      if(scrollDeformation >= 0.0) {
        uv.y = uv.y * (1.0 + -scrollDeformation * 0.00625 * effectStrength);
        horizontalStretch = sin(uv.y);
      }
      else if(scrollDeformation < 0.0) {
        uv.y = uv.y + (uv.y - 1.0) * scrollDeformation * 0.00625 * effectStrength;
        horizontalStretch = sin(-1.0 * (1.0 - uv.y));
      }

      uv.x = uv.x * 2.0 - 1.0;
      uv.x = uv.x * (1.0 + scrollDeformation * 0.0035 * horizontalStretch * effectStrength);
      uv.x = (uv.x + 1.0) * 0.5;

      var color: vec4f = textureSample(renderTexture, defaultSampler, uv);      

      return color;
    }
  `

    this.finalShaderPass = new ShaderPass(this.gpuCurtains, {
      label: 'Final shader pass',
      shaders: {
        fragment: {
          code: finalShaderPassFs,
          entryPoint: 'main',
        },
      },
      uniforms: {
        scrollEffect: {
          label: 'ScrollEffect',
          struct: {
            strength: {
              type: 'f32',
              value: 0,
            },
          },
        },
      },
    })

    this.finalShaderPass.onRender(() => {
      this.finalShaderPass.uniforms.scrollEffect.strength.value = this.scrollEffect
    })

    const postProShader = /* wgsl */ `
    struct VSOutput {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      };

      @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {
        var texture: vec4f = textureSample(renderTexture, defaultSampler, fsInput.uv);

        return mix( vec4(texture.rgb, texture.a), vec4(1.0 - texture.rgb, texture.a), round(fsInput.uv.y * 3.0) / 3.0 );
      }
  `

    this.additionalPostProPass = new ShaderPass(this.gpuCurtains, {
      shaders: {
        fragment: {
          code: postProShader,
        },
      },
    })

    console.log('TEST RT init', this.gpuCurtains.renderer)
  }

  destroy() {
    this.largePlanes.forEach((largePlane) => largePlane.remove())
    this.smallPlanes.forEach((smallPlane) => smallPlane.remove())

    // TODO check for render targets!

    this.grayscalePass.remove()
    this.rgbShiftPass.remove()

    this.finalShaderPass.remove()
    this.additionalPostProPass.remove()

    console.log('TEST RT destroy', this.gpuCurtains.renderer)
  }
}
