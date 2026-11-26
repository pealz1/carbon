const e=/swiftshader|llvmpipe|lavapipe|softpipe|microsoft basic render|microsoft basic display/i;function t(t){if((t.isFallbackAdapter??t.info.isFallbackAdapter)===!0)return!0;let n=t.info,r=[n.vendor,n.architecture,n.device,n.description].filter(Boolean).join(` `);return e.test(r)}let n=null,r=null;const i=new Set;function a(e){for(let t of i)try{t(e)}catch(e){console.warn(`[WebGPU] device-lost listener threw:`,e)}}async function o(){return n===null?r===null?(r=s(),n=await r,r=null,n):r:n}async function s(){if(typeof navigator>`u`||!navigator.gpu)return{supported:!1,reason:`WebGPU API not available in this browser`};try{let e=await navigator.gpu.requestAdapter({powerPreference:`low-power`});if(e||=await navigator.gpu.requestAdapter({powerPreference:`high-performance`}),!e)return{supported:!1,reason:`No WebGPU adapter available on this system`};if(t(e)){let t=e.info;return console.warn(`[WebGPU] Software rendering detected (no hardware acceleration) — WebGPU effects disabled`,{vendor:t.vendor,architecture:t.architecture,device:t.device,description:t.description}),{supported:!1,reason:`WebGPU adapter is a software renderer (no hardware acceleration)`}}let n=await c(e);if(!n)return{supported:!1,reason:`Failed to create WebGPU device from adapter`};let r=e.info;return console.log(`[WebGPU] Initialized successfully`,{vendor:r.vendor,architecture:r.architecture,device:r.device,description:r.description}),{adapter:e,device:n,supported:!0}}catch(e){let t=e instanceof Error?e.message:`Unknown error`;return console.warn(`[WebGPU] Initialization failed:`,t),{supported:!1,reason:`WebGPU initialization error: ${t}`}}}async function c(e){try{let t=await e.requestDevice({requiredFeatures:[],requiredLimits:{maxTextureDimension2D:2048,maxBindGroups:4,maxUniformBufferBindingSize:65536}});return t.lost.then(e=>{console.error(`[WebGPU] Device lost:`,e.message,e.reason),n=null,a({reason:String(e.reason??``),message:e.message})}),t.addEventListener(`uncapturederror`,e=>{console.error(`[WebGPU] Uncaptured error:`,e.error)}),t}catch(e){return console.warn(`[WebGPU] Failed to request device:`,e),null}}function l(){return typeof navigator<`u`&&navigator.gpu?navigator.gpu.getPreferredCanvasFormat():`bgra8unorm`}var u=`// @ciderapp/frontend 4.0.32 — © 2026 Cider Collective.
// All rights reserved. This shader source is proprietary; unauthorized copying,
// modification, or redistribution, in whole or in part, is prohibited.
struct Uniforms {
time: f32,
deltaTime: f32,
rotation: f32,
breathingScale: f32,
transitionProgress: f32,
colorShiftHue: f32,
gradientRotation: f32,
pulseValue: f32,
blur: f32,
saturate: f32,
contrast: f32,
brightness: f32,
oscSpeed: f32,
oscFreq: f32,
oscScale: f32,
effectiveSpeed: f32,
resolution: f32,
artworkSize: f32,
imgScale: f32,
_padding1: f32,
gradientShiftEnabled: f32,
colorShiftEnabled: f32,
breathingEffectEnabled: f32,
bloomPassEnabled: f32,
parallaxLayers: f32,
floatSpeed: f32,
scaleVariation: f32,
rotationVariation: f32,
hdrEnabled: f32,
hdrHeadroom: f32,
_padding2: f32,
_padding3: f32,
};
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var mainTexture: texture_2d<f32>;
@group(0) @binding(2) var bloomTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;
fn hash(p: vec2f) -> f32 {
let p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
let p3_shifted = p3 + dot(p3, vec3f(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
return fract((p3_shifted.x + p3_shifted.y) * p3_shifted.z);
}
fn triangularDither(uv: vec2f, time: f32) -> f32 {
let seed = uv * uniforms.resolution + vec2f(time * 100.0, time * 57.0);
let r1 = hash(seed);
let r2 = hash(seed + vec2f(1.337, 7.331));
return (r1 + r2 - 1.0) / 255.0;
}
fn rgb2hsl(rgb: vec3f) -> vec3f {
let maxC = max(max(rgb.r, rgb.g), rgb.b);
let minC = min(min(rgb.r, rgb.g), rgb.b);
let l = (maxC + minC) / 2.0;
if (maxC == minC) {
return vec3f(0.0, 0.0, l * 100.0);
}
let d = maxC - minC;
var s: f32;
if (l > 0.5) {
s = d / (2.0 - maxC - minC);
} else {
s = d / (maxC + minC);
}
var h: f32;
if (maxC == rgb.r) {
h = (rgb.g - rgb.b) / d;
if (rgb.g < rgb.b) {
h += 6.0;
}
} else if (maxC == rgb.g) {
h = (rgb.b - rgb.r) / d + 2.0;
} else {
h = (rgb.r - rgb.g) / d + 4.0;
}
h /= 6.0;
return vec3f(h * 360.0, s * 100.0, l * 100.0);
}
fn hue2rgb(p: f32, q: f32, t_in: f32) -> f32 {
var t = t_in;
if (t < 0.0) { t += 1.0; }
if (t > 1.0) { t -= 1.0; }
if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
if (t < 1.0 / 2.0) { return q; }
if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
return p;
}
fn hsl2rgb(hsl: vec3f) -> vec3f {
let h = hsl.x / 360.0;
let s = hsl.y / 100.0;
let l = hsl.z / 100.0;
if (s == 0.0) {
return vec3f(l, l, l);
}
var q: f32;
if (l < 0.5) {
q = l * (1.0 + s);
} else {
q = l + s - l * s;
}
let p = 2.0 * l - q;
let r = hue2rgb(p, q, h + 1.0 / 3.0);
let g = hue2rgb(p, q, h);
let b = hue2rgb(p, q, h - 1.0 / 3.0);
return vec3f(r, g, b);
}
fn rotateHue(color: vec3f, hueShift: f32) -> vec3f {
let hsl = rgb2hsl(color);
let newHue = fract((hsl.x + hueShift) / 360.0) * 360.0;
return hsl2rgb(vec3f(newHue, hsl.y, hsl.z));
}
fn rotateUV(uv: vec2f, angle: f32, center: vec2f) -> vec2f {
let s = sin(angle);
let c = cos(angle);
let uvCentered = uv - center;
let rotated = vec2f(
uvCentered.x * c - uvCentered.y * s,
uvCentered.x * s + uvCentered.y * c
);
return rotated + center;
}
fn scaleUV(uv: vec2f, scale: f32, center: vec2f) -> vec2f {
return (uv - center) / scale + center;
}
@fragment
fn fragmentFinal(@location(0) uv: vec2f) -> @location(0) vec4f {
let center = vec2f(0.5, 0.5);
let mainScale = 2.0 * select(1.0, uniforms.breathingScale, uniforms.breathingEffectEnabled > 0.5);
let gradientRotationAngle = uniforms.gradientRotation * 0.01;
var mainUV = scaleUV(uv, mainScale, center);
mainUV = rotateUV(mainUV, gradientRotationAngle, center);
mainUV = fract(mainUV);
var result = textureSample(bloomTexture, texSampler, mainUV);
let hdrBoost = max(0.0, uniforms.hdrHeadroom - 1.0);
let brightnessBoost = 1.5 + hdrBoost * 0.8;
result = vec4f(result.rgb * brightnessBoost, 1.0);
if (uniforms.bloomPassEnabled > 0.5) {
let bloomUV1 = scaleUV(uv, mainScale * 1.1, center);
let bloomUV1Rot = rotateUV(bloomUV1, gradientRotationAngle * 2.0, center);
let bloom1 = textureSample(bloomTexture, texSampler, fract(bloomUV1Rot));
let bloomColor1 = bloom1.rgb * 2.5;
result = vec4f(result.rgb + bloomColor1 * 0.4, result.a);
let bloomUV2 = scaleUV(uv, mainScale * 1.2, center);
let bloomUV2Rot = rotateUV(bloomUV2, -gradientRotationAngle * 1.5, center);
let bloom2 = textureSample(bloomTexture, texSampler, fract(bloomUV2Rot));
let bloomColor2 = bloom2.rgb * 2.0;
let saturatedBloom2 = mix(vec3f(dot(bloomColor2, vec3f(0.299, 0.587, 0.114))), bloomColor2, 1.5);
result = vec4f(result.rgb + saturatedBloom2 * 0.2, result.a);
if (uniforms.colorShiftEnabled > 0.5) {
let bloomUV3 = scaleUV(uv, mainScale, center);
let bloomUV3Rot = rotateUV(bloomUV3, gradientRotationAngle, center);
let bloom3 = textureSample(bloomTexture, texSampler, fract(bloomUV3Rot));
let hueShiftedBloom = rotateHue(bloom3.rgb * 1.8, uniforms.colorShiftHue * 0.5);
result = vec4f(result.rgb + hueShiftedBloom * 0.15, result.a);
}
}
let dither = triangularDither(uv, uniforms.time);
result = vec4f(result.rgb + vec3f(dither), result.a);
if (uniforms.hdrHeadroom > 1.0) {
let boost = uniforms.hdrHeadroom - 1.0;
let baseLuma = dot(result.rgb, vec3f(0.2126, 0.7152, 0.0722));
let highlightMask = smoothstep(0.52, 0.94, baseLuma);
let midMask = smoothstep(0.18, 0.58, baseLuma) * (1.0 - highlightMask);
let highlightGain = 1.0 + boost * (0.35 + 1.45 * highlightMask + 0.30 * midMask);
var boosted = result.rgb * highlightGain;
let boostedLuma = dot(boosted, vec3f(0.2126, 0.7152, 0.0722));
let maxC = max(max(boosted.r, boosted.g), boosted.b);
let minC = min(min(boosted.r, boosted.g), boosted.b);
let chroma = maxC - minC;
let vibrance = 1.0 + boost * (0.35 + 0.90 * highlightMask);
boosted = mix(vec3f(boostedLuma), boosted, vibrance);
let neutralMask = 1.0 - smoothstep(0.04, 0.18, chroma);
let whiteMask = smoothstep(0.78, 0.98, boostedLuma);
let neutralCompression = 1.0 + boost * 0.45 * neutralMask * whiteMask;
boosted = boosted / (1.0 + boosted * (neutralCompression - 1.0));
let brightness = 1.0 + boost * (0.20 + 0.40 * highlightMask);
result = vec4f(boosted * brightness, result.a);
}
let maxOutput = max(1.0, uniforms.hdrHeadroom);
result = vec4f(clamp(result.rgb, vec3f(0.0), vec3f(maxOutput)), 1.0);
return result;
}`,d=`// @ciderapp/frontend 4.0.32 — © 2026 Cider Collective.
// All rights reserved. This shader source is proprietary; unauthorized copying,
// modification, or redistribution, in whole or in part, is prohibited.
struct Uniforms {
time: f32,
deltaTime: f32,
rotation: f32,
breathingScale: f32,
transitionProgress: f32,
colorShiftHue: f32,
gradientRotation: f32,
pulseValue: f32,
blur: f32,
saturate: f32,
contrast: f32,
brightness: f32,
oscSpeed: f32,
oscFreq: f32,
oscScale: f32,
effectiveSpeed: f32,
resolution: f32,
artworkSize: f32,
imgScale: f32,
_padding1: f32,
gradientShiftEnabled: f32,
colorShiftEnabled: f32,
breathingEffectEnabled: f32,
bloomPassEnabled: f32,
parallaxLayers: f32,
floatSpeed: f32,
scaleVariation: f32,
rotationVariation: f32,
};
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
const BLUR_WEIGHTS: array<f32, 9> = array<f32, 9>(
0.1027,
0.0984,
0.0867,
0.0702,
0.0523,
0.0358,
0.0225,
0.0130,
0.0069
);
@fragment
fn fragmentMainH(@location(0) uv: vec2f) -> @location(0) vec4f {
let offset = (1.0 / uniforms.resolution) * uniforms.blur * 0.03;
var result = textureSample(inputTexture, texSampler, uv) * BLUR_WEIGHTS[0];
result += textureSample(inputTexture, texSampler, uv + vec2f(offset * 1.0, 0.0)) * BLUR_WEIGHTS[1];
result += textureSample(inputTexture, texSampler, uv - vec2f(offset * 1.0, 0.0)) * BLUR_WEIGHTS[1];
result += textureSample(inputTexture, texSampler, uv + vec2f(offset * 2.0, 0.0)) * BLUR_WEIGHTS[2];
result += textureSample(inputTexture, texSampler, uv - vec2f(offset * 2.0, 0.0)) * BLUR_WEIGHTS[2];
result += textureSample(inputTexture, texSampler, uv + vec2f(offset * 3.0, 0.0)) * BLUR_WEIGHTS[3];
result += textureSample(inputTexture, texSampler, uv - vec2f(offset * 3.0, 0.0)) * BLUR_WEIGHTS[3];
result += textureSample(inputTexture, texSampler, uv + vec2f(offset * 4.0, 0.0)) * BLUR_WEIGHTS[4];
result += textureSample(inputTexture, texSampler, uv - vec2f(offset * 4.0, 0.0)) * BLUR_WEIGHTS[4];
result += textureSample(inputTexture, texSampler, uv + vec2f(offset * 5.0, 0.0)) * BLUR_WEIGHTS[5];
result += textureSample(inputTexture, texSampler, uv - vec2f(offset * 5.0, 0.0)) * BLUR_WEIGHTS[5];
result += textureSample(inputTexture, texSampler, uv + vec2f(offset * 6.0, 0.0)) * BLUR_WEIGHTS[6];
result += textureSample(inputTexture, texSampler, uv - vec2f(offset * 6.0, 0.0)) * BLUR_WEIGHTS[6];
result += textureSample(inputTexture, texSampler, uv + vec2f(offset * 7.0, 0.0)) * BLUR_WEIGHTS[7];
result += textureSample(inputTexture, texSampler, uv - vec2f(offset * 7.0, 0.0)) * BLUR_WEIGHTS[7];
result += textureSample(inputTexture, texSampler, uv + vec2f(offset * 8.0, 0.0)) * BLUR_WEIGHTS[8];
result += textureSample(inputTexture, texSampler, uv - vec2f(offset * 8.0, 0.0)) * BLUR_WEIGHTS[8];
return result;
}
@fragment
fn fragmentMainV(@location(0) uv: vec2f) -> @location(0) vec4f {
let offset = (1.0 / uniforms.resolution) * uniforms.blur * 0.04;
var result = textureSample(inputTexture, texSampler, uv) * BLUR_WEIGHTS[0];
result += textureSample(inputTexture, texSampler, uv + vec2f(0.0, offset * 1.0)) * BLUR_WEIGHTS[1];
result += textureSample(inputTexture, texSampler, uv - vec2f(0.0, offset * 1.0)) * BLUR_WEIGHTS[1];
result += textureSample(inputTexture, texSampler, uv + vec2f(0.0, offset * 2.0)) * BLUR_WEIGHTS[2];
result += textureSample(inputTexture, texSampler, uv - vec2f(0.0, offset * 2.0)) * BLUR_WEIGHTS[2];
result += textureSample(inputTexture, texSampler, uv + vec2f(0.0, offset * 3.0)) * BLUR_WEIGHTS[3];
result += textureSample(inputTexture, texSampler, uv - vec2f(0.0, offset * 3.0)) * BLUR_WEIGHTS[3];
result += textureSample(inputTexture, texSampler, uv + vec2f(0.0, offset * 4.0)) * BLUR_WEIGHTS[4];
result += textureSample(inputTexture, texSampler, uv - vec2f(0.0, offset * 4.0)) * BLUR_WEIGHTS[4];
result += textureSample(inputTexture, texSampler, uv + vec2f(0.0, offset * 5.0)) * BLUR_WEIGHTS[5];
result += textureSample(inputTexture, texSampler, uv - vec2f(0.0, offset * 5.0)) * BLUR_WEIGHTS[5];
result += textureSample(inputTexture, texSampler, uv + vec2f(0.0, offset * 6.0)) * BLUR_WEIGHTS[6];
result += textureSample(inputTexture, texSampler, uv - vec2f(0.0, offset * 6.0)) * BLUR_WEIGHTS[6];
result += textureSample(inputTexture, texSampler, uv + vec2f(0.0, offset * 7.0)) * BLUR_WEIGHTS[7];
result += textureSample(inputTexture, texSampler, uv - vec2f(0.0, offset * 7.0)) * BLUR_WEIGHTS[7];
result += textureSample(inputTexture, texSampler, uv + vec2f(0.0, offset * 8.0)) * BLUR_WEIGHTS[8];
result += textureSample(inputTexture, texSampler, uv - vec2f(0.0, offset * 8.0)) * BLUR_WEIGHTS[8];
return result;
}`,f=`// @ciderapp/frontend 4.0.32 — © 2026 Cider Collective.
// All rights reserved. This shader source is proprietary; unauthorized copying,
// modification, or redistribution, in whole or in part, is prohibited.
struct Uniforms {
time: f32,
deltaTime: f32,
rotation: f32,
breathingScale: f32,
transitionProgress: f32,
colorShiftHue: f32,
gradientRotation: f32,
pulseValue: f32,
blur: f32,
saturate: f32,
contrast: f32,
brightness: f32,
oscSpeed: f32,
oscFreq: f32,
oscScale: f32,
effectiveSpeed: f32,
resolution: f32,
artworkSize: f32,
imgScale: f32,
_padding1: f32,
gradientShiftEnabled: f32,
colorShiftEnabled: f32,
breathingEffectEnabled: f32,
bloomPassEnabled: f32,
parallaxLayers: f32,
floatSpeed: f32,
scaleVariation: f32,
rotationVariation: f32,
};
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var currentTexture: texture_2d<f32>;
@group(0) @binding(2) var previousTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;
const PI: f32 = 3.14159265359;
fn hsl2rgb(hsl: vec3f) -> vec3f {
let h = hsl.x / 360.0;
let s = hsl.y / 100.0;
let l = hsl.z / 100.0;
if (s == 0.0) {
return vec3f(l, l, l);
}
var q: f32;
if (l < 0.5) {
q = l * (1.0 + s);
} else {
q = l + s - l * s;
}
let p = 2.0 * l - q;
let r = hue2rgb(p, q, h + 1.0 / 3.0);
let g = hue2rgb(p, q, h);
let b = hue2rgb(p, q, h - 1.0 / 3.0);
return vec3f(r, g, b);
}
fn hue2rgb(p: f32, q: f32, t_in: f32) -> f32 {
var t = t_in;
if (t < 0.0) { t += 1.0; }
if (t > 1.0) { t -= 1.0; }
if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
if (t < 1.0 / 2.0) { return q; }
if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
return p;
}
fn createRadialGradient(uv: vec2f, hueShift: f32) -> vec3f {
let center = vec2f(0.5, 0.5);
let dist = distance(uv, center) * 2.0;
let hue1 = hueShift;
let hue2 = fract((hueShift + 30.0) / 360.0) * 360.0;
let hue3 = fract((hueShift + 60.0) / 360.0) * 360.0;
let color1 = hsl2rgb(vec3f(hue1, 20.0, 5.0));
let color2 = hsl2rgb(vec3f(hue2, 15.0, 3.0));
let color3 = hsl2rgb(vec3f(hue3, 10.0, 1.0));
var color: vec3f;
if (dist < 0.5) {
color = mix(color1, color2, dist * 2.0);
} else {
color = mix(color2, color3, (dist - 0.5) * 2.0);
}
return color;
}
fn rotateUV(uv: vec2f, angle: f32, center: vec2f) -> vec2f {
let s = sin(angle);
let c = cos(angle);
let uvCentered = uv - center;
let rotated = vec2f(
uvCentered.x * c - uvCentered.y * s,
uvCentered.x * s + uvCentered.y * c
);
return rotated + center;
}
fn scaleUV(uv: vec2f, scale: f32, center: vec2f) -> vec2f {
return (uv - center) / scale + center;
}
fn sampleWithTransform(
tex: texture_2d<f32>,
samp: sampler,
uv: vec2f,
offset: vec2f,
scale: f32,
rotation: f32
) -> vec4f {
let center = vec2f(0.5, 0.5);
var transformedUV = uv;
transformedUV = transformedUV - offset;
transformedUV = scaleUV(transformedUV, scale, center);
transformedUV = rotateUV(transformedUV, rotation, center);
let wrappedUV = fract(transformedUV);
return textureSample(tex, samp, wrappedUV);
}
fn blendWithAlpha(base: vec4f, overlay: vec4f, alpha: f32) -> vec4f {
let blendedAlpha = alpha * overlay.a;
let rgb = mix(base.rgb, overlay.rgb, blendedAlpha);
let a = base.a + blendedAlpha * (1.0 - base.a);
return vec4f(rgb, a);
}
@fragment
fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
var result = vec4f(0.0, 0.0, 0.0, 1.0);
let numLayers = i32(uniforms.parallaxLayers);
let imgScale = uniforms.imgScale;
let breathingScale = uniforms.breathingScale;
let time = uniforms.time;
let floatSpeed = uniforms.floatSpeed;
let rotationVariation = uniforms.rotationVariation;
let rotation = uniforms.rotation;
{
let baseColor = sampleWithTransform(
currentTexture, texSampler, uv,
vec2f(0.0, 0.0),
imgScale * 1.5,
0.0
);
let basePrev = sampleWithTransform(
previousTexture, texSampler, uv,
vec2f(0.0, 0.0),
imgScale * 1.5,
0.0
);
let baseTransitioned = mix(basePrev, baseColor, uniforms.transitionProgress);
result = vec4f(baseTransitioned.rgb, 1.0);
}
for (var i = 0; i < numLayers; i++) {
let layerIdx = f32(i);
let layerScale = imgScale * (1.5 + layerIdx * 0.4);
let layerAlpha = 0.6 / (layerIdx + 1.0);
let parallaxPhase = layerIdx * 2.39996;
let offsetX = 0.1 + layerIdx * 0.15 + sin(time * floatSpeed * 0.5 + parallaxPhase) * 0.08;
let offsetY = 0.1 + layerIdx * 0.15 + cos(time * floatSpeed * 0.5 + parallaxPhase) * 0.06;
let layerRotation = rotation * 0.5 + layerIdx * 0.15;
let currentColor = sampleWithTransform(
currentTexture, texSampler, uv,
vec2f(offsetX, offsetY),
layerScale * breathingScale,
layerRotation
);
let previousColor = sampleWithTransform(
previousTexture, texSampler, uv,
vec2f(offsetX, offsetY),
layerScale * breathingScale,
layerRotation
);
let transitionedColor = mix(previousColor, currentColor, uniforms.transitionProgress);
result = blendWithAlpha(result, transitionedColor, layerAlpha);
}
{
let primaryOffset = vec2f(
0.0 + sin(time * floatSpeed) * 0.05,
0.0 + cos(time * floatSpeed) * 0.04
);
let primaryRotationVar = sin(time * 0.5) * rotationVariation;
let primaryScale = imgScale * breathingScale * 1.2;
let currentColor = sampleWithTransform(
currentTexture, texSampler, uv,
primaryOffset,
primaryScale,
rotation + primaryRotationVar
);
let previousColor = sampleWithTransform(
previousTexture, texSampler, uv,
primaryOffset,
primaryScale,
rotation + primaryRotationVar
);
let transitionedColor = mix(previousColor, currentColor, uniforms.transitionProgress);
result = blendWithAlpha(result, transitionedColor, 0.85);
}
{
let secondaryOffset = vec2f(
0.3 + sin(time * floatSpeed + 1.0) * 0.06,
0.3 + cos(time * floatSpeed + 1.0) * 0.05
);
let secondaryRotationVar = sin(time * 0.7 + 1.0) * rotationVariation;
let secondaryScale = imgScale * breathingScale;
let currentColor = sampleWithTransform(
currentTexture, texSampler, uv,
secondaryOffset,
secondaryScale,
-rotation * 0.5 + secondaryRotationVar
);
let previousColor = sampleWithTransform(
previousTexture, texSampler, uv,
secondaryOffset,
secondaryScale,
-rotation * 0.5 + secondaryRotationVar
);
let transitionedColor = mix(previousColor, currentColor, uniforms.transitionProgress);
result = blendWithAlpha(result, transitionedColor, 0.7);
}
{
let tertiaryOffset = vec2f(
-0.2 + sin(time * 0.4) * 0.07,
0.4 + cos(time * 0.3) * 0.05
);
let tertiaryRotationVar = sin(time * 0.8 + 2.0) * rotationVariation;
let tertiaryScale = imgScale * 0.9 * breathingScale;
let currentColor = sampleWithTransform(
currentTexture, texSampler, uv,
tertiaryOffset,
tertiaryScale,
rotation * 0.8 + tertiaryRotationVar
);
let previousColor = sampleWithTransform(
previousTexture, texSampler, uv,
tertiaryOffset,
tertiaryScale,
rotation * 0.8 + tertiaryRotationVar
);
let transitionedColor = mix(previousColor, currentColor, uniforms.transitionProgress);
result = blendWithAlpha(result, transitionedColor, 0.55);
}
{
let fourthOffset = vec2f(
0.4 + sin(time * 0.35 + 3.0) * 0.08,
-0.1 + cos(time * 0.25 + 3.0) * 0.06
);
let fourthRotationVar = sin(time * 0.6 + 3.0) * rotationVariation;
let fourthScale = imgScale * 1.1 * breathingScale;
let currentColor = sampleWithTransform(
currentTexture, texSampler, uv,
fourthOffset,
fourthScale,
rotation * 1.5 + fourthRotationVar
);
let previousColor = sampleWithTransform(
previousTexture, texSampler, uv,
fourthOffset,
fourthScale,
rotation * 1.5 + fourthRotationVar
);
let transitionedColor = mix(previousColor, currentColor, uniforms.transitionProgress);
result = blendWithAlpha(result, transitionedColor, 0.4);
}
return result;
}`,p=`// @ciderapp/frontend 4.0.32 — © 2026 Cider Collective.
// All rights reserved. This shader source is proprietary; unauthorized copying,
// modification, or redistribution, in whole or in part, is prohibited.
struct VertexOutput {
@builtin(position) position: vec4f,
@location(0) uv: vec2f,
};
const POSITIONS = array<vec2f, 6>(
vec2f(-1.0, -1.0),
vec2f( 1.0, -1.0),
vec2f(-1.0, 1.0),
vec2f(-1.0, 1.0),
vec2f( 1.0, -1.0),
vec2f( 1.0, 1.0)
);
const UVS = array<vec2f, 6>(
vec2f(0.0, 1.0),
vec2f(1.0, 1.0),
vec2f(0.0, 0.0),
vec2f(0.0, 0.0),
vec2f(1.0, 1.0),
vec2f(1.0, 0.0)
);
@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
var output: VertexOutput;
output.position = vec4f(POSITIONS[vertexIndex], 0.0, 1.0);
output.uv = UVS[vertexIndex];
return output;
}`,m=`// @ciderapp/frontend 4.0.32 — © 2026 Cider Collective.
// All rights reserved. This shader source is proprietary; unauthorized copying,
// modification, or redistribution, in whole or in part, is prohibited.
struct Uniforms {
time: f32,
deltaTime: f32,
rotation: f32,
breathingScale: f32,
transitionProgress: f32,
colorShiftHue: f32,
gradientRotation: f32,
pulseValue: f32,
blur: f32,
saturate: f32,
contrast: f32,
brightness: f32,
oscSpeed: f32,
oscFreq: f32,
oscScale: f32,
effectiveSpeed: f32,
resolution: f32,
artworkSize: f32,
imgScale: f32,
oscPhase: f32,
gradientShiftEnabled: f32,
colorShiftEnabled: f32,
breathingEffectEnabled: f32,
bloomPassEnabled: f32,
parallaxLayers: f32,
floatSpeed: f32,
scaleVariation: f32,
rotationVariation: f32,
};
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var inputTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
fn oscCurrent(frame: f32, speed: f32, x: f32) -> f32 {
return sin(frame + x * speed * 10.0);
}
@fragment
fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
let resolution = uniforms.resolution;
let oscSpeedBase = 0.35 * clamp(1.0, uniforms.oscSpeed, 2.0);
let speed1 = 0.05 * oscSpeedBase;
let speed2 = 0.03 * oscSpeedBase;
let speed3 = 0.06 * oscSpeedBase;
let x0 = 0.0;
let x1 = 0.25;
let x2 = 0.5;
let x3 = 0.75;
let x4 = 1.0;
let pixelX = uv.x;
let pixelY = uv.y;
let oscFreq = uniforms.oscFreq * uniforms.rotation;
let oscScale = uniforms.oscScale / resolution * 1.5;
let frame1 = uniforms.oscPhase * 0.005 * 0.05 * 0.35;
let frame2 = uniforms.oscPhase * 0.005 * 0.03 * 0.35;
let frame3 = uniforms.oscPhase * 0.005 * 0.06 * 0.35;
let y = pixelY * resolution;
let lx1 = x1 + oscCurrent(frame1, speed1, y * oscFreq) * oscScale;
let lx2 = x2 + oscCurrent(frame2, speed2, y * oscFreq) * oscScale;
let lx3 = x3 + oscCurrent(frame3, speed3, y * oscFreq) * oscScale;
let minWidth = 0.01;
let w0 = max(lx1, minWidth);
let w1 = max(lx2 - lx1, minWidth);
let w2 = max(lx3 - lx2, minWidth);
let w3 = max(x4 - lx3, minWidth);
var srcX: f32;
if (pixelX < lx1) {
let t = clamp(pixelX / w0, 0.0, 1.0);
srcX = t * x1;
} else if (pixelX < lx2) {
let t = clamp((pixelX - lx1) / w1, 0.0, 1.0);
srcX = x1 + t * (x2 - x1);
} else if (pixelX < lx3) {
let t = clamp((pixelX - lx2) / w2, 0.0, 1.0);
srcX = x2 + t * (x3 - x2);
} else {
let t = clamp((pixelX - lx3) / w3, 0.0, 1.0);
srcX = x3 + t * (x4 - x3);
}
srcX = clamp(srcX, 0.0, 1.0);
let srcUV = vec2f(srcX, pixelY);
let color = textureSample(inputTexture, texSampler, srcUV);
return color;
}`,h=`// @ciderapp/frontend 4.0.32 — © 2026 Cider Collective.
// All rights reserved. This shader source is proprietary; unauthorized copying,
// modification, or redistribution, in whole or in part, is prohibited.
struct Uniforms {
time: f32,
deltaTime: f32,
rotation: f32,
breathingScale: f32,
transitionProgress: f32,
colorShiftHue: f32,
gradientRotation: f32,
pulseValue: f32,
blur: f32,
saturate: f32,
contrast: f32,
brightness: f32,
oscSpeed: f32,
oscFreq: f32,
oscScale: f32,
effectiveSpeed: f32,
resolution: f32,
artworkSize: f32,
imgScale: f32,
_padding1: f32,
gradientShiftEnabled: f32,
colorShiftEnabled: f32,
breathingEffectEnabled: f32,
bloomPassEnabled: f32,
parallaxLayers: f32,
floatSpeed: f32,
scaleVariation: f32,
rotationVariation: f32,
};
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
fn applyContrast(color: vec3f, contrast: f32) -> vec3f {
return (color - 0.5) * contrast + 0.5;
}
fn applySaturation(color: vec3f, saturate: f32) -> vec3f {
let saturateFactor = saturate / 100.0;
let gray = dot(color, vec3f(0.299, 0.587, 0.114));
return mix(vec3f(gray), color, saturateFactor);
}
fn applyBrightnessClamp(color: vec3f, maxBrightness: f32) -> vec3f {
let maxBright = (maxBrightness / 100.0) * 255.0;
let brightness = (color.r + color.g + color.b) / 3.0;
let diff = brightness - maxBright;
if (diff > 0.0) {
let dimFactor = diff / maxBright;
return vec3f(
color.r - dimFactor * color.r,
color.g - dimFactor * color.g,
color.b - dimFactor * color.b
);
}
return color;
}
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
let dims = textureDimensions(inputTexture);
if (globalId.x >= dims.x || globalId.y >= dims.y) {
return;
}
let coords = vec2i(globalId.xy);
var color = textureLoad(inputTexture, coords, 0);
var rgb = color.rgb;
rgb = applyContrast(rgb, uniforms.contrast);
rgb = applySaturation(rgb, uniforms.saturate);
rgb = applyBrightnessClamp(rgb * 255.0, uniforms.brightness) / 255.0;
rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
textureStore(outputTexture, coords, vec4f(rgb, color.a));
}`;const g=new WeakMap;function _(e,t){return g.get(e)?.get(t)}function v(e,t,n){let r=g.get(e);r||(r=new Map,g.set(e,r)),r.set(t,n)}const y={filters:{blur:18,saturate:180,contrast:1.3,brightness:110},osc:{speed:1,freq:.16,scale:64},movement:{parallaxLayers:3,floatSpeed:.5,scaleVariation:.1,rotationVariation:.02},effects:{gradientShift:!0,particles:!1,colorShift:!0,breathingEffect:!0},bloomPass:!1,debug:!1};var b=class{device=null;context=null;canvas=null;canvasFormat=null;preprocessPipeline=null;compositePipeline=null;oscillationPipeline=null;blurHPipeline=null;blurVPipeline=null;finalCompositePipeline=null;sourceTexture=null;previousTexture=null;preprocessedTexture=null;compositeTexture=null;oscillationTexture=null;blurTempTexture=null;bloomTexture=null;sourceTextureView=null;previousTextureView=null;preprocessedTextureView=null;compositeTextureView=null;oscillationTextureView=null;blurTempTextureView=null;bloomTextureView=null;linearSampler=null;nearestSampler=null;uniformBuffer=null;uniformData;preprocessBindGroup=null;compositeBindGroup=null;oscillationBindGroup=null;blurHBindGroup=null;blurVBindGroup=null;blurH2BindGroup=null;blurV2BindGroup=null;finalBindGroup=null;animationFrame=null;sleepTimer=null;lastFrameTime=0;frameInterval=25;visibilityTier=`active`;currentEffectiveInterval=25;targetEffectiveInterval=25;intervalTransitionRate=.08;rotation=1;rotationDirection=1;pulseValue=0;timeOffset=0;breathingScale=1;colorShiftHue=0;parallaxOffsets=[];gradientRotation=0;oscPhase=0;breathingPhase=0;transitionProgress=1;transitionStartTime=0;transitionDuration=500;hasValidPreviousImage=!1;hasLoadedImage=!1;firstFrameCallback=null;hasRenderedFirstFrame=!1;lastImageChangeTime=0;rapidSkipDuration=300;options;initialized=!1;paused=!1;preprocessDirty=!0;constructor(){this.uniformData=new Float32Array(36),this.options={resolution:512,artworkSize:380,imgScale:2,maxFramerate:40,bpm:60,transitionDuration:800,maxBrightness:100,presets:{...y},backgroundFramerate:10,hdrEnabled:!1,hdrHeadroom:1.2,preferDisplayP3:!1}}configureCanvasContext(){if(!this.context||!this.device||!this.canvasFormat)return;let e={device:this.device,format:this.canvasFormat,alphaMode:`premultiplied`,colorSpace:this.options.preferDisplayP3?`display-p3`:`srgb`};try{if(this.options.hdrEnabled){let t={...e,toneMapping:{mode:`extended`}};this.context.configure(t);return}this.context.configure(e)}catch(e){console.warn(`[ArtworkBlurMapRenderer] HDR canvas configuration failed, falling back to SDR:`,e),this.context.configure({device:this.device,format:this.canvasFormat,alphaMode:`premultiplied`})}}async initialize(e){let t=await o();if(!t.supported)return console.warn(`[ArtworkBlurMapRenderer] WebGPU not supported:`,t.reason),!1;if(this.device=t.device,this.canvas=e,this.context=e.getContext(`webgpu`),!this.context)return console.error(`[ArtworkBlurMapRenderer] Failed to get WebGPU context`),!1;this.canvasFormat=l(),this.configureCanvasContext(),this.createSamplers(),this.createUniformBuffer(),await this.createPipelines(this.canvasFormat),this.createTextures(),this.createBindGroups();for(let e=0;e<this.options.presets.movement.parallaxLayers;e++)this.parallaxOffsets.push(Math.random()*Math.PI*2);return this.initialized=!0,console.log(`[ArtworkBlurMapRenderer] Initialized successfully`),!0}createSamplers(){this.device&&(this.linearSampler=this.device.createSampler({magFilter:`linear`,minFilter:`linear`,mipmapFilter:`linear`,addressModeU:`repeat`,addressModeV:`repeat`}),this.nearestSampler=this.device.createSampler({magFilter:`nearest`,minFilter:`nearest`,addressModeU:`clamp-to-edge`,addressModeV:`clamp-to-edge`}))}createUniformBuffer(){this.device&&(this.uniformBuffer=this.device.createBuffer({size:this.uniformData.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}))}async createPipelines(e){if(!this.device)return;let t=_(this.device,e);if(t){this.preprocessPipeline=t.preprocessPipeline,this.compositePipeline=t.compositePipeline,this.oscillationPipeline=t.oscillationPipeline,this.blurHPipeline=t.blurHPipeline,this.blurVPipeline=t.blurVPipeline,this.finalCompositePipeline=t.finalCompositePipeline;return}let n=this.device.createShaderModule({label:`Preprocess Shader`,code:h}),r=this.device.createShaderModule({label:`Fullscreen Quad Shader`,code:p}),i=this.device.createShaderModule({label:`Composite Shader`,code:f}),a=this.device.createShaderModule({label:`Oscillation Shader`,code:m}),o=this.device.createShaderModule({label:`Blur Shader`,code:d}),s=this.device.createShaderModule({label:`Final Composite Shader`,code:u}),[c,l,g,y,b,x]=await Promise.all([this.device.createComputePipelineAsync({label:`Preprocess Pipeline`,layout:`auto`,compute:{module:n,entryPoint:`main`}}),this.device.createRenderPipelineAsync({label:`Composite Pipeline`,layout:`auto`,vertex:{module:r,entryPoint:`vertexMain`},fragment:{module:i,entryPoint:`fragmentMain`,targets:[{format:`rgba16float`}]},primitive:{topology:`triangle-list`}}),this.device.createRenderPipelineAsync({label:`Oscillation Pipeline`,layout:`auto`,vertex:{module:r,entryPoint:`vertexMain`},fragment:{module:a,entryPoint:`fragmentMain`,targets:[{format:`rgba16float`}]},primitive:{topology:`triangle-list`}}),this.device.createRenderPipelineAsync({label:`Blur Horizontal Pipeline`,layout:`auto`,vertex:{module:r,entryPoint:`vertexMain`},fragment:{module:o,entryPoint:`fragmentMainH`,targets:[{format:`rgba16float`}]},primitive:{topology:`triangle-list`}}),this.device.createRenderPipelineAsync({label:`Blur Vertical Pipeline`,layout:`auto`,vertex:{module:r,entryPoint:`vertexMain`},fragment:{module:o,entryPoint:`fragmentMainV`,targets:[{format:`rgba16float`}]},primitive:{topology:`triangle-list`}}),this.device.createRenderPipelineAsync({label:`Final Composite Pipeline`,layout:`auto`,vertex:{module:r,entryPoint:`vertexMain`},fragment:{module:s,entryPoint:`fragmentFinal`,targets:[{format:e}]},primitive:{topology:`triangle-list`}})]);this.preprocessPipeline=c,this.compositePipeline=l,this.oscillationPipeline=g,this.blurHPipeline=y,this.blurVPipeline=b,this.finalCompositePipeline=x,v(this.device,e,{preprocessPipeline:c,compositePipeline:l,oscillationPipeline:g,blurHPipeline:y,blurVPipeline:b,finalCompositePipeline:x})}createTextures(){if(!this.device)return;let e=this.options.resolution,t=Math.max(64,e>>1),n={size:{width:e,height:e},format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST},r={size:{width:t,height:t},format:`rgba16float`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC},i={size:{width:e,height:e},format:`rgba8unorm`,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC};this.sourceTexture=this.device.createTexture({...n,label:`Source Texture`}),this.previousTexture=this.device.createTexture({...n,label:`Previous Texture`}),this.preprocessedTexture=this.device.createTexture({...i,label:`Preprocessed Texture`}),this.compositeTexture=this.device.createTexture({...r,label:`Composite Texture`}),this.oscillationTexture=this.device.createTexture({...r,label:`Oscillation Texture`}),this.blurTempTexture=this.device.createTexture({...r,label:`Blur Temp Texture`}),this.bloomTexture=this.device.createTexture({...r,label:`Bloom Texture`}),this.sourceTextureView=this.sourceTexture.createView(),this.previousTextureView=this.previousTexture.createView(),this.preprocessedTextureView=this.preprocessedTexture.createView(),this.compositeTextureView=this.compositeTexture.createView(),this.oscillationTextureView=this.oscillationTexture.createView(),this.blurTempTextureView=this.blurTempTexture.createView(),this.bloomTextureView=this.bloomTexture.createView()}createBindGroups(){!this.device||!this.uniformBuffer||!this.linearSampler||this.updateBindGroups()}updateBindGroups(){!this.device||!this.uniformBuffer||!this.linearSampler||!this.sourceTextureView||!this.preprocessedTextureView||!this.previousTextureView||!this.compositeTextureView||!this.oscillationTextureView||!this.blurTempTextureView||!this.bloomTextureView||!this.preprocessPipeline||!this.compositePipeline||!this.oscillationPipeline||!this.blurHPipeline||!this.blurVPipeline||this.finalCompositePipeline&&(this.preprocessBindGroup=this.device.createBindGroup({label:`Preprocess Bind Group`,layout:this.preprocessPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.sourceTextureView},{binding:1,resource:this.preprocessedTextureView},{binding:2,resource:{buffer:this.uniformBuffer}}]}),this.compositeBindGroup=this.device.createBindGroup({label:`Composite Bind Group`,layout:this.compositePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.linearSampler},{binding:1,resource:this.preprocessedTextureView},{binding:2,resource:this.previousTextureView},{binding:3,resource:{buffer:this.uniformBuffer}}]}),this.oscillationBindGroup=this.device.createBindGroup({label:`Oscillation Bind Group`,layout:this.oscillationPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.linearSampler},{binding:1,resource:this.compositeTextureView},{binding:2,resource:{buffer:this.uniformBuffer}}]}),this.blurHBindGroup=this.device.createBindGroup({label:`Blur H Bind Group`,layout:this.blurHPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.linearSampler},{binding:1,resource:this.oscillationTextureView},{binding:2,resource:{buffer:this.uniformBuffer}}]}),this.blurVBindGroup=this.device.createBindGroup({label:`Blur V Bind Group`,layout:this.blurVPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.linearSampler},{binding:1,resource:this.blurTempTextureView},{binding:2,resource:{buffer:this.uniformBuffer}}]}),this.blurH2BindGroup=this.device.createBindGroup({label:`Blur H2 Bind Group`,layout:this.blurHPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.linearSampler},{binding:1,resource:this.bloomTextureView},{binding:2,resource:{buffer:this.uniformBuffer}}]}),this.blurV2BindGroup=this.device.createBindGroup({label:`Blur V2 Bind Group`,layout:this.blurVPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.linearSampler},{binding:1,resource:this.blurTempTextureView},{binding:2,resource:{buffer:this.uniformBuffer}}]}),this.finalBindGroup=this.device.createBindGroup({label:`Final Bind Group`,layout:this.finalCompositePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.linearSampler},{binding:2,resource:this.bloomTextureView},{binding:3,resource:{buffer:this.uniformBuffer}}]}))}async setImage(e){if(!this.device||!this.sourceTexture)return;let t=this.options.resolution,n=this.device.createCommandEncoder();this.hasLoadedImage&&(this.preprocessedTexture&&this.previousTexture&&n.copyTextureToTexture({texture:this.preprocessedTexture},{texture:this.previousTexture},{width:t,height:t}),this.hasValidPreviousImage=!0),this.device.queue.submit([n.finish()]);let r,i=!1;if(e instanceof ImageBitmap&&e.width===t&&e.height===t?r=e:(r=await createImageBitmap(e,{resizeWidth:t,resizeHeight:t,resizeQuality:`high`}),i=!0),this.device.queue.copyExternalImageToTexture({source:r},{texture:this.sourceTexture},{width:r.width,height:r.height}),this.hasValidPreviousImage){let e=performance.now(),t=e-this.lastImageChangeTime<1500&&this.lastImageChangeTime>0;this.transitionProgress=0,this.transitionStartTime=e,this.lastImageChangeTime=e,this.transitionDuration=t?this.rapidSkipDuration:this.options.transitionDuration}else this.transitionProgress=1,this.lastImageChangeTime=performance.now(),console.log(`[ArtworkBlurMapRenderer] First image loaded, showing immediately`);this.hasLoadedImage=!0,this.preprocessDirty=!0,i&&r.close()}setOptions(e){let t=this.options.hdrEnabled,n=this.options.preferDisplayP3,r=this.options.presets.filters.contrast,i=this.options.presets.filters.saturate,a=this.options.maxBrightness;this.options={...this.options,...e},e.presets&&(this.options.presets={...y,...e.presets}),(this.options.presets.filters.contrast!==r||this.options.presets.filters.saturate!==i||this.options.maxBrightness!==a)&&(this.preprocessDirty=!0),(e.maxFramerate||e.backgroundFramerate)&&this.recalcTargetInterval(),e.transitionDuration&&(this.transitionDuration=e.transitionDuration),this.initialized&&(t!==this.options.hdrEnabled||n!==this.options.preferDisplayP3)&&this.configureCanvasContext()}setPaused(e){this.paused=e,!e&&this.initialized&&this.startRenderLoop()}setVisibilityTier(e){if(this.visibilityTier===e)return;let t=this.visibilityTier;if(this.visibilityTier=e,e===`hidden`){this.stopRenderLoop();return}this.recalcTargetInterval(),t===`hidden`&&this.initialized&&!this.paused&&this.startRenderLoop()}recalcTargetInterval(){let e=this.visibilityTier===`active`?this.options.maxFramerate:this.options.backgroundFramerate;this.targetEffectiveInterval=1e3/Math.max(e,1),this.frameInterval=1e3/this.options.maxFramerate}pulse(){this.pulseValue+=2}startTransition(){this.hasValidPreviousImage&&(this.transitionProgress=0,this.transitionStartTime=performance.now())}updateAnimation(e){let t=this.options.presets,n=60/this.options.maxFramerate,r=this.options.bpm/120*n;if(this.transitionProgress<1){let e=performance.now()-this.transitionStartTime,t=Math.min(e/this.transitionDuration,1);this.transitionProgress=this.easeInOutCubic(t)}let i=.016*r;this.timeOffset+=i;let a=Math.min(Math.max(this.options.bpm/120,t.osc.speed),2);if(this.oscPhase+=i*a,t.effects.breathingEffect&&r>0){let e=r/60*.5;this.breathingPhase+=i*e,this.breathingScale=1+Math.sin(this.breathingPhase)*t.movement.scaleVariation}else this.breathingScale=1;t.effects.colorShift&&r>0&&(this.colorShiftHue+=.5*r,this.colorShiftHue>360&&(this.colorShiftHue=0)),t.effects.gradientShift&&r>0&&(this.gradientRotation+=.2*r),Math.abs(this.rotation)>Math.PI*2&&(this.rotationDirection*=-1);let o=.001*Math.min(Math.max(this.pulseValue*2,1),10)*this.rotationDirection*r;this.rotation+=o*n*(t.effects.breathingEffect?this.breathingScale:1),this.pulseValue>0&&(this.pulseValue=Math.max(0,this.pulseValue-e*.001))}easeInOutCubic(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}updateUniforms(){if(!this.device||!this.uniformBuffer)return;let e=this.options.presets,t=this.options.bpm/120,n=0;this.uniformData[n++]=this.timeOffset,this.uniformData[n++]=1/this.options.maxFramerate,this.uniformData[n++]=this.rotation,this.uniformData[n++]=this.breathingScale,this.uniformData[n++]=this.transitionProgress,this.uniformData[n++]=this.colorShiftHue,this.uniformData[n++]=this.gradientRotation,this.uniformData[n++]=this.pulseValue,this.uniformData[n++]=e.filters.blur,this.uniformData[n++]=e.filters.saturate,this.uniformData[n++]=e.filters.contrast,this.uniformData[n++]=this.options.maxBrightness,this.uniformData[n++]=e.osc.speed,this.uniformData[n++]=e.osc.freq,this.uniformData[n++]=e.osc.scale,this.uniformData[n++]=t,this.uniformData[n++]=this.options.resolution,this.uniformData[n++]=this.options.artworkSize,this.uniformData[n++]=this.options.imgScale,this.uniformData[n++]=this.oscPhase,this.uniformData[n++]=+!!e.effects.gradientShift,this.uniformData[n++]=+!!e.effects.colorShift,this.uniformData[n++]=+!!e.effects.breathingEffect,this.uniformData[n++]=+!!e.bloomPass,this.uniformData[n++]=e.movement.parallaxLayers,this.uniformData[n++]=e.movement.floatSpeed,this.uniformData[n++]=e.movement.scaleVariation,this.uniformData[n++]=e.movement.rotationVariation,this.uniformData[n++]=+!!this.options.hdrEnabled,this.uniformData[n++]=Math.max(1,this.options.hdrHeadroom),this.uniformData[n++]=0,this.uniformData[n++]=0,this.device.queue.writeBuffer(this.uniformBuffer,0,this.uniformData)}render(){if(!this.device||!this.context||!this.initialized||!this.preprocessPipeline||!this.compositePipeline||!this.oscillationPipeline||!this.blurHPipeline||!this.blurVPipeline||!this.finalCompositePipeline)return;this.updateUniforms();let e=this.device.createCommandEncoder(),t=this.options.resolution;if(this.preprocessBindGroup&&this.preprocessDirty){this.preprocessDirty=!1;let n=e.beginComputePass();n.setPipeline(this.preprocessPipeline),n.setBindGroup(0,this.preprocessBindGroup),n.dispatchWorkgroups(Math.ceil(t/16),Math.ceil(t/16)),n.end()}if(this.compositeBindGroup&&this.compositeTexture){let t=e.beginRenderPass({colorAttachments:[{view:this.compositeTextureView,loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:1}}]});t.setPipeline(this.compositePipeline),t.setBindGroup(0,this.compositeBindGroup),t.draw(6),t.end()}if(this.oscillationBindGroup&&this.oscillationTexture){let t=e.beginRenderPass({colorAttachments:[{view:this.oscillationTextureView,loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:1}}]});t.setPipeline(this.oscillationPipeline),t.setBindGroup(0,this.oscillationBindGroup),t.draw(6),t.end()}if(this.blurHBindGroup&&this.blurTempTexture){let t=e.beginRenderPass({colorAttachments:[{view:this.blurTempTextureView,loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:1}}]});t.setPipeline(this.blurHPipeline),t.setBindGroup(0,this.blurHBindGroup),t.draw(6),t.end()}if(this.blurVBindGroup&&this.bloomTexture){let t=e.beginRenderPass({colorAttachments:[{view:this.bloomTextureView,loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:1}}]});t.setPipeline(this.blurVPipeline),t.setBindGroup(0,this.blurVBindGroup),t.draw(6),t.end()}if(this.blurH2BindGroup&&this.blurTempTexture){let t=e.beginRenderPass({colorAttachments:[{view:this.blurTempTextureView,loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:1}}]});t.setPipeline(this.blurHPipeline),t.setBindGroup(0,this.blurH2BindGroup),t.draw(6),t.end()}if(this.blurV2BindGroup&&this.bloomTexture){let t=e.beginRenderPass({colorAttachments:[{view:this.bloomTextureView,loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:1}}]});t.setPipeline(this.blurVPipeline),t.setBindGroup(0,this.blurV2BindGroup),t.draw(6),t.end()}let n=this.context.getCurrentTexture();if(this.finalBindGroup&&this.finalCompositePipeline){let t=e.beginRenderPass({colorAttachments:[{view:n.createView(),loadOp:`clear`,storeOp:`store`,clearValue:{r:0,g:0,b:0,a:1}}]});t.setPipeline(this.finalCompositePipeline),t.setBindGroup(0,this.finalBindGroup),t.draw(6),t.end()}this.device.queue.submit([e.finish()])}renderLoop=e=>{if(this.paused||!this.initialized){this.animationFrame=null;return}let t=this.targetEffectiveInterval-this.currentEffectiveInterval;Math.abs(t)>.5?this.currentEffectiveInterval+=t*this.intervalTransitionRate:this.currentEffectiveInterval=this.targetEffectiveInterval;let n=e-this.lastFrameTime;if(n>=this.currentEffectiveInterval){if(this.lastFrameTime=e-n%this.currentEffectiveInterval,this.updateAnimation(n),this.render(),!this.hasRenderedFirstFrame&&this.hasLoadedImage){this.hasRenderedFirstFrame=!0;let e=this.firstFrameCallback;this.firstFrameCallback=null,e?.()}this.animationFrame=requestAnimationFrame(this.renderLoop)}else{let e=this.currentEffectiveInterval-n;this.sleepTimer=setTimeout(()=>{this.sleepTimer=null,this.animationFrame=requestAnimationFrame(this.renderLoop)},Math.max(0,e-4))}};startRenderLoop(){this.animationFrame===null&&(this.lastFrameTime=performance.now(),this.animationFrame=requestAnimationFrame(this.renderLoop))}onFirstFrame(e){if(this.hasRenderedFirstFrame){Promise.resolve().then(e);return}this.firstFrameCallback=e}stopRenderLoop(){this.sleepTimer!==null&&(clearTimeout(this.sleepTimer),this.sleepTimer=null),this.animationFrame!==null&&(cancelAnimationFrame(this.animationFrame),this.animationFrame=null)}destroy(){this.stopRenderLoop(),this.sourceTexture?.destroy(),this.previousTexture?.destroy(),this.preprocessedTexture?.destroy(),this.compositeTexture?.destroy(),this.oscillationTexture?.destroy(),this.blurTempTexture?.destroy(),this.bloomTexture?.destroy(),this.uniformBuffer?.destroy(),this.sourceTextureView=null,this.previousTextureView=null,this.preprocessedTextureView=null,this.compositeTextureView=null,this.oscillationTextureView=null,this.blurTempTextureView=null,this.bloomTextureView=null,this.device=null,this.context=null,this.canvas=null,this.canvasFormat=null,this.initialized=!1,this.hasLoadedImage=!1,this.hasValidPreviousImage=!1,console.log(`[ArtworkBlurMapRenderer] Destroyed`)}};const x=self;let S=null,C=0;function w(e){x.postMessage(e)}x.addEventListener(`message`,async e=>{let t=e.data;switch(t.type){case`init`:try{if(S=new b,!await S.initialize(t.canvas)){S=null,w({type:`initialized`,success:!1,reason:`WebGPU initialization failed in worker`});return}S.onFirstFrame(()=>{w({type:`firstFrame`})}),S.startRenderLoop(),w({type:`initialized`,success:!0})}catch(e){S=null,w({type:`initialized`,success:!1,reason:e instanceof Error?e.message:String(e)})}break;case`setImage`:if(!S)break;if(`url`in t){C=t.requestId;let e=null;try{let n=await fetch(t.url);if(!n.ok)throw Error(`HTTP ${n.status}`);let r=await n.blob();e=await createImageBitmap(r,{resizeWidth:512,resizeHeight:512,resizeQuality:`high`}),t.requestId===C&&await S.setImage(e)}catch(e){let n=e instanceof Error?e.message:String(e);w({type:`error`,message:`setImage(${t.url}) failed: ${n}`,requestId:t.requestId})}finally{e?.close()}break}t.requestId>=C&&(C=t.requestId);try{t.requestId===C&&await S.setImage(t.bitmap)}catch(e){w({type:`error`,message:`setImage failed: ${e instanceof Error?e.message:String(e)}`})}finally{t.bitmap.close()}break;case`setOptions`:S?.setOptions(t.options);break;case`setVisibility`:S?.setVisibilityTier(t.tier);break;case`setPaused`:S?.setPaused(t.paused);break;case`pulse`:S?.pulse();break;case`startTransition`:S?.startTransition();break;case`destroy`:S?.destroy(),S=null}});
// SIG // Begin signature block
// SIG // MII2oAYJKoZIhvcNAQcCoII2kTCCNo0CAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // Lyk4jxDG0gwIUU+x/fup7QBXRk6m0/XuWAPEj32XchWg
// SIG // ghtAMIIFzDCCA7SgAwIBAgIQVJjS0dRbGZVIE3nIEcCH
// SIG // mTANBgkqhkiG9w0BAQwFADB3MQswCQYDVQQGEwJVUzEe
// SIG // MBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMUgw
// SIG // RgYDVQQDEz9NaWNyb3NvZnQgSWRlbnRpdHkgVmVyaWZp
// SIG // Y2F0aW9uIFJvb3QgQ2VydGlmaWNhdGUgQXV0aG9yaXR5
// SIG // IDIwMjAwHhcNMjAwNDE2MTgzNjE2WhcNNDUwNDE2MTg0
// SIG // NDQwWjB3MQswCQYDVQQGEwJVUzEeMBwGA1UEChMVTWlj
// SIG // cm9zb2Z0IENvcnBvcmF0aW9uMUgwRgYDVQQDEz9NaWNy
// SIG // b3NvZnQgSWRlbnRpdHkgVmVyaWZpY2F0aW9uIFJvb3Qg
// SIG // Q2VydGlmaWNhdGUgQXV0aG9yaXR5IDIwMjAwggIiMA0G
// SIG // CSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQCzkSoHgwZn
// SIG // /Z6d4MfAt6TmQgR/D6bbX/vVWtdFoPt3C/CA86ZtWk15
// SIG // U9ighoRXRSDHolT7x6K/isduNfOiFcQvTuNKhZZJDf++
// SIG // mdgU9rwnB+5Cmyv1C5IG5P1pE2WokXLymITrgz0O5Ndx
// SIG // Ekghyw3t9kdJt5v5yccXtoRP/7ismtdzZ0mF44a9N0DQ
// SIG // JYbU3rXCbWJq1al4vC1vSfnlbBQU/RTH02UWN97Lbrxe
// SIG // KY39YpsVLNYF5rmJMjOjYsfX1lJnCMQu9FYrnguHzOyn
// SIG // tKaq6wXNGVelOgsEJxyRZ54tYi0vHr7awCDLBBnKM/uJ
// SIG // vpjicqByNb554ZyDb+RtF2+Q8z0AhnU4jtDgSZq729P4
// SIG // MMrVV4hoTXLTv21/cdj9vQ2ukmRIt1tveSa1zZuVIYTR
// SIG // 7w8yPXtXjPNFB0x84F4YDjV2i22eyzZ0qwX44HNdMlaU
// SIG // Z5clCsY1PZSX58FEi4D9wfj0dBnlMPYG+yFXPgYci2sV
// SIG // hidJe4KTylnodUfoPzj0x1N5oLa04lxR771fOMET5ngM
// SIG // lVouxUBZKMwPJMDsugl3I5k4prYc2se6ILbXN9h/N68I
// SIG // 4ztx225zG32ZcrDkhjNZdLUWAHtQbcaGE9r9xDmCPSQA
// SIG // mmDaupTABVEsNKxQmROHu7MFgLJNMAJcuCaDXbRjc++u
// SIG // I5VPYCi+N9VbpQIDAQABo1QwUjAOBgNVHQ8BAf8EBAMC
// SIG // AYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUyH7S
// SIG // aoUqG8oZmAQHJ89QEE9oqKIwEAYJKwYBBAGCNxUBBAMC
// SIG // AQAwDQYJKoZIhvcNAQEMBQADggIBAK9q3eYZ5y2UQxlO
// SIG // y+lQlWSlA5ECi+I2gDsVolLCFhm2alpddEMw9Jv/YHQJ
// SIG // sSEekBZtxSSPXGaIY/RPzH3yEkxAEIsBn9qpyK7ylRvP
// SIG // nQXrST50oGhb5VYsZRyCflPaVtlGF3mSRcQQNghSKRfL
// SIG // L6byftRpJIoej7BzDcwcSquyqu2nkWMBZCKoMrh+Miiz
// SIG // Z3MtkbTcMQEL90cKpvHXSu1WYMQsCKN7QLC8dCdSh9a+
// SIG // iN03ioluZ4gd9cldoP62qzqA1xqXPBc2IkEerE3Vg+Y8
// SIG // OL1PMOlUqdO2BMMydmG7sBjFKxizwIDVt5WwXlFNIvzs
// SIG // WKro2JS0pS7tkt7nGHwhV91VY/e/bc0f0qZ3KHDH4ls6
// SIG // WwjSW07IAJaz4YM2r4YKZVx09ursemp0oPBL7u+Uo6xQ
// SIG // 8oft1zowg8n7fVe+5eP4QcrlZK6zo+xY7IWazO+56vNW
// SIG // GLlcc5qvxXcXg1nbNxoYclSlQdK2I3WjQ5rld3yWebdB
// SIG // jb/s3ICgn9F3dVhfNRPgJRpnC33OJfoHCuRhIdjUHOUH
// SIG // xjaZ9JbQxhX+Ts3Xroud2xb9BMaSvdSI5qmjqrv3ZDg7
// SIG // X8wM0DW+dBkDpsWqTKJhNoI+HfMrvJdd20t4Oy31O+9g
// SIG // I+j17AsjNpWvmGa/U9N7uGlKKpZmacSUxvRfbqyYeIiA
// SIG // Blyisu2iMIIGnjCCBIagAwIBAgITMwAI9lYJxuQqZQdb
// SIG // 6wAAAAj2VjANBgkqhkiG9w0BAQwFADBaMQswCQYDVQQG
// SIG // EwJVUzEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBvcmF0
// SIG // aW9uMSswKQYDVQQDEyJNaWNyb3NvZnQgSUQgVmVyaWZp
// SIG // ZWQgQ1MgQU9DIENBIDAzMB4XDTI2MTAxOTE1MjM0MFoX
// SIG // DTI2MTAyMjE1MjM0MFowXzELMAkGA1UEBhMCVVMxCzAJ
// SIG // BgNVBAgTAnR4MQ8wDQYDVQQHEwZMb3JlbmExGDAWBgNV
// SIG // BAoTD0VsaWphaCBLbGF1bWFubjEYMBYGA1UEAxMPRWxp
// SIG // amFoIEtsYXVtYW5uMIIBojANBgkqhkiG9w0BAQEFAAOC
// SIG // AY8AMIIBigKCAYEAxRMkqRtFhouxOWJZhoJ/QsjgBC5Y
// SIG // l/BTtcULUDlv+RIRUz15ckEdPWCQUBBndD+bu2DRUFO0
// SIG // kaUWMhwF3hm7u9GTp0CSuyxabUemqYsz8sokGYaTWmuZ
// SIG // aizNa7ZqvZI/znqtES7wbial4l9YhC1wbeuSseWo498l
// SIG // z5/LDL6s2VbaRTo1gh0V/EtSpeJRr/UmBj7NEE9Ti4Sr
// SIG // CVJEYjNxaJdiA8vwecBFxA2Wr6NAsbXwhocdLT6d5a+/
// SIG // 6n1uCW3GfJMjKArTMVhLcvfVYg/TvLyMN2tKGTpQt9VS
// SIG // ATxw5ZBcnySvTjR99ysr25SPHTlWQ6i4C3CMFSUKSn1v
// SIG // HJr7vu237MWwCoA12Uri1p941NLrpZXQ3DP7SJd8JEiz
// SIG // AMMDjrZdcoO8okgByTUrP612JQZ4LHAEyRZCZh3v1Mx2
// SIG // 0EPYtn8jNfn9dQRbHicJLzD/pPFDmqh0O6GKFKxlrlPh
// SIG // 6/v1jzcflH/rTq8omG4bht5KJ6aHTZWO6jtH49+bfh5P
// SIG // AgMBAAGjggHWMIIB0jAMBgNVHRMBAf8EAjAAMA4GA1Ud
// SIG // DwEB/wQEAwIHgDA9BgNVHSUENjA0BgorBgEEAYI3YQEA
// SIG // BggrBgEFBQcDAwYcKwYBBAGCN2GBtJKtS4Hz9toUguiY
// SIG // +QaDsY3AOjAdBgNVHQ4EFgQUw8iXx+J+w1YQs6OtAVhu
// SIG // QXo2pNEwHwYDVR0jBBgwFoAUpEMMf3ZapYXnPo0oDwwX
// SIG // okVpcMYwZwYDVR0fBGAwXjBcoFqgWIZWaHR0cDovL3d3
// SIG // dy5taWNyb3NvZnQuY29tL3BraW9wcy9jcmwvTWljcm9z
// SIG // b2Z0JTIwSUQlMjBWZXJpZmllZCUyMENTJTIwQU9DJTIw
// SIG // Q0ElMjAwMy5jcmwwdAYIKwYBBQUHAQEEaDBmMGQGCCsG
// SIG // AQUFBzAChlhodHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20v
// SIG // cGtpb3BzL2NlcnRzL01pY3Jvc29mdCUyMElEJTIwVmVy
// SIG // aWZpZWQlMjBDUyUyMEFPQyUyMENBJTIwMDMuY3J0MFQG
// SIG // A1UdIARNMEswSQYEVR0gADBBMD8GCCsGAQUFBwIBFjNo
// SIG // dHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3BzL0Rv
// SIG // Y3MvUmVwb3NpdG9yeS5odG0wDQYJKoZIhvcNAQEMBQAD
// SIG // ggIBAEJCv1QV8dC9im3EbyG354uUjj2xtJLiAdFPV0FU
// SIG // N1eU+g8Sf+otpEPESiNTyz6g5MOkAaYCv4y8hgjJKEhf
// SIG // Z1DA3UACECjtgnaTdKkQcflqVkPRZHFIj6CPODhPSE9Q
// SIG // /R0UC05pCQTP4pgiXiJq2l8LwwTDAANbavC4m4kuKFk2
// SIG // b3H9elj4SO4oxjR3ayqhHowad0ZEV9Cn8eE1XrIVra+E
// SIG // dJUYxM65VAWlRJ3iue3EysgDR3tot88u9qCIxW/z+od3
// SIG // wwcZ1pu0Zhv4/iKLDbi6vEfTGEpTGwMI+cYwasO6AOv0
// SIG // lUA4mV+uc96HmWKJoN14WAs6FaqztO0Pvll7QY8+N12s
// SIG // cfg13eUVbWGQ5rpnlQ0BJkE4OfM3Ot/RMyU2qwTPJLyW
// SIG // tKDzc3+A1Rgg7j+xDo6Ea7SpsJinY5WbL9US1TiVJO0I
// SIG // 0FWx3CJ1SJhs3zwWu2omMS/ucLrSLw/G2kI8CDSukc9y
// SIG // ydUsITOWhrr1saG5bJD044qlMqOng1cEp5Ou9RBaWZuY
// SIG // xd/hD/vrpc9bWdwLjqeW96wVVcKxeTEstQ8zlDcHzU1C
// SIG // 9UqlGiFxPqKJ0CA9hGomzI2JGfa9lyu4YQ4LfntOkhwo
// SIG // Q2hnWMnGAArAfzJ+Ku6tTS2FXofhEfQH/MxSnbKGav/Z
// SIG // PMsaQPpemb3AzkWJ3sXNx6ttCBnPMIIHKDCCBRCgAwIB
// SIG // AgITMwAAABgN65FVqYoAmAAAAAAAGDANBgkqhkiG9w0B
// SIG // AQwFADBjMQswCQYDVQQGEwJVUzEeMBwGA1UEChMVTWlj
// SIG // cm9zb2Z0IENvcnBvcmF0aW9uMTQwMgYDVQQDEytNaWNy
// SIG // b3NvZnQgSUQgVmVyaWZpZWQgQ29kZSBTaWduaW5nIFBD
// SIG // QSAyMDIxMB4XDTI2MDMyNjE4MTEzMloXDTMxMDMyNjE4
// SIG // MTEzMlowWjELMAkGA1UEBhMCVVMxHjAcBgNVBAoTFU1p
// SIG // Y3Jvc29mdCBDb3Jwb3JhdGlvbjErMCkGA1UEAxMiTWlj
// SIG // cm9zb2Z0IElEIFZlcmlmaWVkIENTIEFPQyBDQSAwMzCC
// SIG // AiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMiA
// SIG // 2mA0VqKJ/ZVZ5Y/kjo+cVfEn+UHft8lHnkYK9HsYtkEy
// SIG // QGKNuIpXCCkEjfEzmd/jzjOcf+qdwn44KrrLeOCdBb5H
// SIG // xl3tT7suOWuZyyRqXNJDSCEzESmcFbz8cezZXxknNCTo
// SIG // c/5IOxu+wvst2Uf947aXiaSeEMHCvRn9D3rpO8S2Hlvy
// SIG // QLGPW+qJXhg22EsZGplH27Z8r/IExa7zeno7i6jYR2D7
// SIG // 6AR7Dkgvu+eecoWqZKH9H288nLdYXVhxl7ABTHyxdk1S
// SIG // fHdmFWDn2XYumK0+LDMToUyoiypoS9V7czO4V3Zr+5YN
// SIG // kfpVsPJSJErvyYiDUNBgD3MMTLIEVw0j6fFVLOCW8vq7
// SIG // s9G42qBxXex/oQvHDz3KxAz9nhHWFEVZdGnI5YooAq18
// SIG // EdOTRSc2I9zGYswxizyN5SM6J19U+NMivL9RXCfDF2WQ
// SIG // rzlxl8EQxhn8ME07B2iY/jn1jWfyLMqRuGxr6niXD5xB
// SIG // XEBMEXH2CBHv0eGvJPscOak8u+Qm8FnjBbgJbfZRPZIz
// SIG // IN7bycg5Teb6F8eVV4pwsFBzKblWhEOMhwJUju6qAZbY
// SIG // 80wTRx96LzMLALLocKyywlYVLt6D9hsWGcBMlzJZ8yuQ
// SIG // 24Bsx8w3w2mDxytLqNVWjDIPQYbnN2CL65BVxIr/rfyY
// SIG // DXERgremcihCA7T264MHAgMBAAGjggHcMIIB2DAOBgNV
// SIG // HQ8BAf8EBAMCAYYwEAYJKwYBBAGCNxUBBAMCAQAwHQYD
// SIG // VR0OBBYEFKRDDH92WqWF5z6NKA8MF6JFaXDGMFQGA1Ud
// SIG // IARNMEswSQYEVR0gADBBMD8GCCsGAQUFBwIBFjNodHRw
// SIG // Oi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3BzL0RvY3Mv
// SIG // UmVwb3NpdG9yeS5odG0wGQYJKwYBBAGCNxQCBAweCgBT
// SIG // AHUAYgBDAEEwEgYDVR0TAQH/BAgwBgEB/wIBADAfBgNV
// SIG // HSMEGDAWgBTZQSmwDw9jbO9p1/XNKZ6kSGow5jBwBgNV
// SIG // HR8EaTBnMGWgY6Bhhl9odHRwOi8vd3d3Lm1pY3Jvc29m
// SIG // dC5jb20vcGtpb3BzL2NybC9NaWNyb3NvZnQlMjBJRCUy
// SIG // MFZlcmlmaWVkJTIwQ29kZSUyMFNpZ25pbmclMjBQQ0El
// SIG // MjAyMDIxLmNybDB9BggrBgEFBQcBAQRxMG8wbQYIKwYB
// SIG // BQUHMAKGYWh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9w
// SIG // a2lvcHMvY2VydHMvTWljcm9zb2Z0JTIwSUQlMjBWZXJp
// SIG // ZmllZCUyMENvZGUlMjBTaWduaW5nJTIwUENBJTIwMjAy
// SIG // MS5jcnQwDQYJKoZIhvcNAQEMBQADggIBAHHHIFb5fqaF
// SIG // 1GJLAP08wxZwZQCfHn9BTCc29l0UYRf7gNEMiv1YKHgL
// SIG // zvAe3D6WDUPe7MrXQOy09fQsUsEUALe9YxhfgiZfCguG
// SIG // hHTGU3yZR2isnduCekIla4jXnfVnWsLA+5StKQHF84gY
// SIG // OTenYQJvcej/EeLk9FJH85Sta5AfBeJpcxO5e7chEt7P
// SIG // BWRmkWY3BhEPntH03HYX/Izu3M5jQeHSEYJpgQrfz/oW
// SIG // tLRJdp1dbINQJ+flc4YAJGNQKcfH4lBQbR/hIcP6JuWk
// SIG // AjSCX5kedWZ1dfEdNl5NrQJgIiEXEo/b3bazSDrMuZ6J
// SIG // XXctZSa239QXtOtZekyLb/RQ2eJoOgfuuc8ZFXnFVfy5
// SIG // fLixmKLhqzDOo8ztjv6bNytqepnwSNmTmCMuFDcDaxlq
// SIG // muU67wJpGbJ9wiJUfvNV+AC+bzUxZcXOIB/ubLtA6+fI
// SIG // QU8Z12rwxJ8+19HLD9Sre4foqmhok0h89gfp9x5lKLnd
// SIG // Fq3UD2CsTGrdE6OGFKlNxyG4Ei0Aw1U/Ggo1tSb6JH9f
// SIG // deQv71ZCCKePId76FctyVjy8AZcUPWnjQ+owikBiyYQk
// SIG // EUpb11/j//U3mhAOv8Vj0gEmX+hJL3v2Lmu1Ps1nP0q9
// SIG // itoI9EEazRALL6xa+BBrRygzvRAlUt5XCZLFQ7/Sh3TD
// SIG // 1CvLttIuvEagMIIHnjCCBYagAwIBAgITMwAAAAeHozSj
// SIG // e6WOHAAAAAAABzANBgkqhkiG9w0BAQwFADB3MQswCQYD
// SIG // VQQGEwJVUzEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBv
// SIG // cmF0aW9uMUgwRgYDVQQDEz9NaWNyb3NvZnQgSWRlbnRp
// SIG // dHkgVmVyaWZpY2F0aW9uIFJvb3QgQ2VydGlmaWNhdGUg
// SIG // QXV0aG9yaXR5IDIwMjAwHhcNMjEwNDAxMjAwNTIwWhcN
// SIG // MzYwNDAxMjAxNTIwWjBjMQswCQYDVQQGEwJVUzEeMBwG
// SIG // A1UEChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMTQwMgYD
// SIG // VQQDEytNaWNyb3NvZnQgSUQgVmVyaWZpZWQgQ29kZSBT
// SIG // aWduaW5nIFBDQSAyMDIxMIICIjANBgkqhkiG9w0BAQEF
// SIG // AAOCAg8AMIICCgKCAgEAsvDArxmIKOLdVHpMSWxpCFUJ
// SIG // tFL/ekr4weslKPdnF3cpTeuV8veqtmKVgok2rO0D05Bp
// SIG // yvUDCg1wdsoEtuxACEGcgHfjPF/nZsOkg7c0mV8hpMT/
// SIG // GvB4uhDvWXMIeQPsDgCzUGzTvoi76YDpxDOxhgf8JuXW
// SIG // JzBDoLrmtThX01CE1TCCvH2sZD/+Hz3RDwl2MsvDSdX5
// SIG // rJDYVuR3bjaj2QfzZFmwfccTKqMAHlrz4B7ac8g9zyxl
// SIG // TpkTuJGtFnLBGasoOnn5NyYlf0xF9/bjVRo4Gzg2Yc7K
// SIG // R7yhTVNiuTGH5h4eB9ajm1OCShIyhrKqgOkc4smz6obx
// SIG // O+HxKeJ9bYmPf6KLXVNLz8UaeARo0BatvJ82sLr2gqlF
// SIG // Bdj1sYfqOf00Qm/3B4XGFPDK/H04kteZEZsBRc3VT2d/
// SIG // iVd7OTLpSH9yCORV3oIZQB/Qr4nD4YT/lWkhVtw2v2s0
// SIG // TnRJubL/hFMIQa86rcaGMhNsJrhysLNNMeBhiMezU1s5
// SIG // zpusf54qlYu2v5sZ5zL0KvBDLHtL8F9gn6jOy3v7Jm0b
// SIG // bBHjrW5yQW7S36ALAt03QDpwW1JG1Hxu/FUXJbBO2Aww
// SIG // VG4Fre+ZQ5Od8ouwt59FpBxVOBGfN4vN2m3fZx1gqn52
// SIG // GvaiBz6ozorgIEjn+PhUXILhAV5Q/ZgCJ0u2+ldFGjcC
// SIG // AwEAAaOCAjUwggIxMA4GA1UdDwEB/wQEAwIBhjAQBgkr
// SIG // BgEEAYI3FQEEAwIBADAdBgNVHQ4EFgQU2UEpsA8PY2zv
// SIG // adf1zSmepEhqMOYwVAYDVR0gBE0wSzBJBgRVHSAAMEEw
// SIG // PwYIKwYBBQUHAgEWM2h0dHA6Ly93d3cubWljcm9zb2Z0
// SIG // LmNvbS9wa2lvcHMvRG9jcy9SZXBvc2l0b3J5Lmh0bTAZ
// SIG // BgkrBgEEAYI3FAIEDB4KAFMAdQBiAEMAQTAPBgNVHRMB
// SIG // Af8EBTADAQH/MB8GA1UdIwQYMBaAFMh+0mqFKhvKGZgE
// SIG // ByfPUBBPaKiiMIGEBgNVHR8EfTB7MHmgd6B1hnNodHRw
// SIG // Oi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3BzL2NybC9N
// SIG // aWNyb3NvZnQlMjBJZGVudGl0eSUyMFZlcmlmaWNhdGlv
// SIG // biUyMFJvb3QlMjBDZXJ0aWZpY2F0ZSUyMEF1dGhvcml0
// SIG // eSUyMDIwMjAuY3JsMIHDBggrBgEFBQcBAQSBtjCBszCB
// SIG // gQYIKwYBBQUHMAKGdWh0dHA6Ly93d3cubWljcm9zb2Z0
// SIG // LmNvbS9wa2lvcHMvY2VydHMvTWljcm9zb2Z0JTIwSWRl
// SIG // bnRpdHklMjBWZXJpZmljYXRpb24lMjBSb290JTIwQ2Vy
// SIG // dGlmaWNhdGUlMjBBdXRob3JpdHklMjAyMDIwLmNydDAt
// SIG // BggrBgEFBQcwAYYhaHR0cDovL29uZW9jc3AubWljcm9z
// SIG // b2Z0LmNvbS9vY3NwMA0GCSqGSIb3DQEBDAUAA4ICAQB/
// SIG // JSqe/tSr6t1mCttXI0y6XmyQ41uGWzl9xw+WYhvOL47B
// SIG // V09Dgfnm/tU4ieeZ7NAR5bguorTCNr58HOcA1tcsHQqt
// SIG // 0wJsdClsu8bpQD9e/al+lUgTUJEV80Xhco7xdgRrehby
// SIG // hUf4pkeAhBEjABvIUpD2LKPho5Z4DPCT5/0TlK02nlPw
// SIG // Ubv9URREhVYCtsDM+31OFU3fDV8BmQXv5hT2RurVsJHZ
// SIG // gP4y26dJDVF+3pcbtvh7R6NEDuYHYihfmE2HdQRq5jRv
// SIG // LE1Eb59PYwISFCX2DaLZ+zpU4bX0I16ntKq4poGOFaaK
// SIG // tjIA1vRElItaOKcwtc04CBrXSfyL2Op6mvNIxTk4Oasw
// SIG // IkTXbFL81ZKGD+24uMCwo/pLNhn7VHLfnxlMVzHQVL+b
// SIG // Ha9KhTyzwdG/L6uderJQn0cGpLQMStUuNDArxW2wF16Q
// SIG // GZ1NtBWgKA8Kqv48M8HfFqNifN6+zt6J0GwzvU8g0rYG
// SIG // gTZR8zDEIJfeZxwWDHpSxB5FJ1VVU1LIAtB7o9PXbjXz
// SIG // GifaIMYTzU4YKt4vMNwwBmetQDHhdAtTPplOXrnI9SI6
// SIG // HeTtjDD3iUN/7ygbahmYOHk7VB7fwT4ze+ErCbMh6gHV
// SIG // 1UuXPiLciloNxH6K4aMfZN1oLVk6YFeIJEokuPgNPa6E
// SIG // nTiOL60cPqfny+Fq8UiuZzGCGrgwghq0AgEBMHEwWjEL
// SIG // MAkGA1UEBhMCVVMxHjAcBgNVBAoTFU1pY3Jvc29mdCBD
// SIG // b3Jwb3JhdGlvbjErMCkGA1UEAxMiTWljcm9zb2Z0IElE
// SIG // IFZlcmlmaWVkIENTIEFPQyBDQSAwMwITMwAI9lYJxuQq
// SIG // ZQdb6wAAAAj2VjANBglghkgBZQMEAgEFAKCBhDAYBgor
// SIG // BgEEAYI3AgEMMQowCKACgAChAoAAMBkGCSqGSIb3DQEJ
// SIG // AzEMBgorBgEEAYI3AgEEMBwGCisGAQQBgjcCAQsxDjAM
// SIG // BgorBgEEAYI3AgEVMC8GCSqGSIb3DQEJBDEiBCD8E7zI
// SIG // m8VABx+vjqX9XTt4Y+N0iMtAw7WQjX1toI70+jANBgkq
// SIG // hkiG9w0BAQEFAASCAYAqXDVzoP3OPSNatxV3Cuza70xE
// SIG // 5IseumF8I2ypAz0RmGybtXUgFSqHb2auzmjpEWrhh6pC
// SIG // QC6O0ESr/j8GSxq3nRsX8D9OyGctZr2vDQPElGXOnTMU
// SIG // x+/AAv2OKFEJDqxn1oQyxFVo0TZbfWxfDQ3aaNPH477o
// SIG // huqu053PBKvTYHF0rN3ETLnA1qg1bAZ9/zruyd7zkaIj
// SIG // nASbeIJwa5gxD9BhFkLf9rzIT1T0oZVupLxV0ILr/C8w
// SIG // tY7Sde1QZICvQsOAFxjNpchluPuvbcisAdwtpAL9Re1u
// SIG // g9QNyjxK3xnkQNgAYqW9YAglWoysmV2FE2TirPX5CAEi
// SIG // B5SOjzJtWUe9JmUeu2jmJCxsfEqW2pFNEhqqAoQZyCux
// SIG // t/QNla+s1revMf0ZRGT3LEsvHZ1J0dT2yuE8xtlfOWWB
// SIG // cCkVCbzzArgOAMTKvGDSSLfCjf9y/jPW6mQwWdrfnRqf
// SIG // Z3UGJYlt1pKoH6eyl01iYvkjxJJ3rBv0YiV6MeylUhOX
// SIG // R4GhghgRMIIYDQYKKwYBBAGCNwMDATGCF/0wghf5Bgkq
// SIG // hkiG9w0BBwKgghfqMIIX5gIBAzEPMA0GCWCGSAFlAwQC
// SIG // AQUAMIIBYgYLKoZIhvcNAQkQAQSgggFRBIIBTTCCAUkC
// SIG // AQEGCisGAQQBhFkKAwEwMTANBglghkgBZQMEAgEFAAQg
// SIG // uft5LjOHWgExwM00apKjt7SGwOUUWEIXxUx9CipuRyUC
// SIG // BmrXqFk0HBgTMjAyNjEwMjEwNzI1NDAuNDg5WjAEgAIB
// SIG // 9KCB4aSB3jCB2zELMAkGA1UEBhMCVVMxEzARBgNVBAgT
// SIG // Cldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAc
// SIG // BgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjElMCMG
// SIG // A1UECxMcTWljcm9zb2Z0IEFtZXJpY2EgT3BlcmF0aW9u
// SIG // czEnMCUGA1UECxMeblNoaWVsZCBUU1MgRVNOOjdBMDAt
// SIG // MDVFMC1EOTQ3MTUwMwYDVQQDEyxNaWNyb3NvZnQgUHVi
// SIG // bGljIFJTQSBUaW1lIFN0YW1waW5nIEF1dGhvcml0eaCC
// SIG // DyEwggeCMIIFaqADAgECAhMzAAAABeXPD/9mLsmHAAAA
// SIG // AAAFMA0GCSqGSIb3DQEBDAUAMHcxCzAJBgNVBAYTAlVT
// SIG // MR4wHAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24x
// SIG // SDBGBgNVBAMTP01pY3Jvc29mdCBJZGVudGl0eSBWZXJp
// SIG // ZmljYXRpb24gUm9vdCBDZXJ0aWZpY2F0ZSBBdXRob3Jp
// SIG // dHkgMjAyMDAeFw0yMDExMTkyMDMyMzFaFw0zNTExMTky
// SIG // MDQyMzFaMGExCzAJBgNVBAYTAlVTMR4wHAYDVQQKExVN
// SIG // aWNyb3NvZnQgQ29ycG9yYXRpb24xMjAwBgNVBAMTKU1p
// SIG // Y3Jvc29mdCBQdWJsaWMgUlNBIFRpbWVzdGFtcGluZyBD
// SIG // QSAyMDIwMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIIC
// SIG // CgKCAgEAnnznUmP94MWfBX1jtQYioxwe1+eXM9ETBb1l
// SIG // Rkd3kcFdcG9/sqtDlwxKoVIcaqDb+omFio5DHC4RBcby
// SIG // QHjXCwMk/l3TOYtgoBjxnG/eViS4sOx8y4gSq8Zg49RE
// SIG // Af5huXhIkQRKe3Qxs8Sgp02KHAznEa/Ssah8nWo5hJM1
// SIG // xznkRsFPu6rfDHeZeG1Wa1wISvlkpOQooTULFm809Z0Z
// SIG // YlQ8Lp7i5F9YciFlyAKwn6yjN/kR4fkquUWfGmMopNq/
// SIG // B8U/pdoZkZZQbxNlqJOiBGgCWpx69uKqKhTPVi3gVErn
// SIG // c/qi+dR8A2MiAz0kN0nh7SqINGbmw5OIRC0EsZ31WF3U
// SIG // xp3GgZwetEKxLms73KG/Z+MkeuaVDQQheangOEMGJ4pQ
// SIG // ZH55ngI0Tdy1bi69INBV5Kn2HVJo9XxRYR/JPGAaM6xG
// SIG // l57Ei95HUw9NV/uC3yFjrhc087qLJQawSC3xzY/EXzsT
// SIG // 4I7sDbxOmM2rl4uKK6eEpurRduOQ2hTkmG1hSuWYBunF
// SIG // GNv21Kt4N20AKmbeuSnGnsBCd2cjRKG79+TX+sTehawO
// SIG // oxfeOO/jR7wo3liwkGdzPJYHgnJ54UxbckF914AqHOiE
// SIG // V7xTnD1a69w/UTxwjEugpIPMIIE67SFZ2PMo27xjlLAH
// SIG // WW3l1CEAFjLNHd3EQ79PUr8FUXetXr0CAwEAAaOCAhsw
// SIG // ggIXMA4GA1UdDwEB/wQEAwIBhjAQBgkrBgEEAYI3FQEE
// SIG // AwIBADAdBgNVHQ4EFgQUa2koOjUvSGNAz3vYr0npPtk9
// SIG // 2yEwVAYDVR0gBE0wSzBJBgRVHSAAMEEwPwYIKwYBBQUH
// SIG // AgEWM2h0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lv
// SIG // cHMvRG9jcy9SZXBvc2l0b3J5Lmh0bTATBgNVHSUEDDAK
// SIG // BggrBgEFBQcDCDAZBgkrBgEEAYI3FAIEDB4KAFMAdQBi
// SIG // AEMAQTAPBgNVHRMBAf8EBTADAQH/MB8GA1UdIwQYMBaA
// SIG // FMh+0mqFKhvKGZgEByfPUBBPaKiiMIGEBgNVHR8EfTB7
// SIG // MHmgd6B1hnNodHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20v
// SIG // cGtpb3BzL2NybC9NaWNyb3NvZnQlMjBJZGVudGl0eSUy
// SIG // MFZlcmlmaWNhdGlvbiUyMFJvb3QlMjBDZXJ0aWZpY2F0
// SIG // ZSUyMEF1dGhvcml0eSUyMDIwMjAuY3JsMIGUBggrBgEF
// SIG // BQcBAQSBhzCBhDCBgQYIKwYBBQUHMAKGdWh0dHA6Ly93
// SIG // d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMvY2VydHMvTWlj
// SIG // cm9zb2Z0JTIwSWRlbnRpdHklMjBWZXJpZmljYXRpb24l
// SIG // MjBSb290JTIwQ2VydGlmaWNhdGUlMjBBdXRob3JpdHkl
// SIG // MjAyMDIwLmNydDANBgkqhkiG9w0BAQwFAAOCAgEAX4h2
// SIG // x35ttVoVdedMeGj6TuHYRJklFaW4sTQ5r+k77iB79cSL
// SIG // Ne+GzRjv4pVjJviceW6AF6ycWoEYR0LYhaa0ozJLU5Yi
// SIG // +LCmcrdovkl53DNt4EXs87KDogYb9eGEndSpZ5ZM74LN
// SIG // vVzY0/nPISHz0Xva71QjD4h+8z2XMOZzY7YQ0Psw+ety
// SIG // NZ1CesufU211rLslLKsO8F2aBs2cIo1k+aHOhrw9xw6J
// SIG // CWONNboZ497mwYW5EfN0W3zL5s3ad4Xtm7yFM7Ujrhc0
// SIG // aqy3xL7D5FR2J7x9cLWMq7eb0oYioXhqV2tgFqbKHeDi
// SIG // ck+P8tHYIFovIP7YG4ZkJWag1H91KlELGWi3SLv10o4K
// SIG // Gag42pswjybTi4toQcC/irAodDW8HNtX+cbz0sMptFJK
// SIG // +KObAnDFHEsukxD+7jFfEV9Hh/+CSxKRsmnuiovCWIOb
// SIG // +H7DRon9TlxydiFhvu88o0w35JkNbJxTk4MhF/KgaXn0
// SIG // GxdH8elEa2Imq45gaa8D+mTm8LWVydt4ytxYP/bqjN49
// SIG // D9NZ81coE6aQWm88TwIf4R4YZbOpMKN0CyejaPNN41LG
// SIG // XHeCUMYmBx3PkP8ADHD1J2Cr/6tjuOOCztfp+o9Nc+Zo
// SIG // IAkpUcA/X2gSMkgHAPUvIdtoSAHEUKiBhI6JQivRepyv
// SIG // Wcl+JYbYbBh7pmgAXVswggeXMIIFf6ADAgECAhMzAAAA
// SIG // XcY5eE9AfTP9AAAAAABdMA0GCSqGSIb3DQEBDAUAMGEx
// SIG // CzAJBgNVBAYTAlVTMR4wHAYDVQQKExVNaWNyb3NvZnQg
// SIG // Q29ycG9yYXRpb24xMjAwBgNVBAMTKU1pY3Jvc29mdCBQ
// SIG // dWJsaWMgUlNBIFRpbWVzdGFtcGluZyBDQSAyMDIwMB4X
// SIG // DTI2MDkxNzE4NTcyMVoXDTI3MDkxNDE4NTcyMVowgdsx
// SIG // CzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9u
// SIG // MRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNy
// SIG // b3NvZnQgQ29ycG9yYXRpb24xJTAjBgNVBAsTHE1pY3Jv
// SIG // c29mdCBBbWVyaWNhIE9wZXJhdGlvbnMxJzAlBgNVBAsT
// SIG // Hm5TaGllbGQgVFNTIEVTTjo3QTAwLTA1RTAtRDk0NzE1
// SIG // MDMGA1UEAxMsTWljcm9zb2Z0IFB1YmxpYyBSU0EgVGlt
// SIG // ZSBTdGFtcGluZyBBdXRob3JpdHkwggIiMA0GCSqGSIb3
// SIG // DQEBAQUAA4ICDwAwggIKAoICAQCd96jc8RQPiazqg7HG
// SIG // evnT7FexggLz24QaPYwyNeHCyaTfUhE3u7t2JFbFSvU9
// SIG // 9WplRBLCknQ2UHg2nkialDbCKjsxsAS7sZP1/DZWUYkF
// SIG // 1qcbzuA0opGv3WKlTpH4dLa+yYZICRfW4qD8sC5S21n0
// SIG // cyTghk+3aPI/9SxTE0HwwSwNv7WNU4NKSwMZnK03YiYX
// SIG // zlRtnziwAbOQjBqkeNWMsg5wjTud+6en/ymxgP6XgbpN
// SIG // NX5Aj0rIEqkcaD3jnEXkGO7yOjtq48+ce8xKPaHMZ+dk
// SIG // rDwWU+qYB6m5cKVlG+m+2oc8vN7puAwtEjL1H9IbJv9P
// SIG // vvbeL0Jq8XlXEzXVEQG8Fw1C1fVC9nfNaow+mT27iwqC
// SIG // dpxVWsHpXb7PWCXk+JoRtDqT/uyKL3Sbtu7KnWeE/G1V
// SIG // q6ne6nbm+zSQA5o4k86fMbi5kKwHQ0fz4QQ0BYIM/o/P
// SIG // EudWZsonB3J0JFbRDyov5LIh0lcysrHzlzgxM2vSGaeO
// SIG // Zq1FY/yUyKPp50hhY8vEhbHl0k5ifhpUSYXkZ4UChlEr
// SIG // HM9DDWN9RCcQDvEnT6iWkds99BvGLyTYE4tKVDMdHm8B
// SIG // rarhf5fso+BdX89Eg5gmdS4pKqaTRLLYsSR8Gt9n2/fm
// SIG // qm/lBgUfwNYa9KEaCVmwG4kwhdUsjJPWyIQnz19iYCww
// SIG // zf2MzQIDAQABo4IByzCCAccwHQYDVR0OBBYEFEPbCl2Z
// SIG // TvB+Hlbt/eWoaMh/Wue5MB8GA1UdIwQYMBaAFGtpKDo1
// SIG // L0hjQM972K9J6T7ZPdshMGwGA1UdHwRlMGMwYaBfoF2G
// SIG // W2h0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMv
// SIG // Y3JsL01pY3Jvc29mdCUyMFB1YmxpYyUyMFJTQSUyMFRp
// SIG // bWVzdGFtcGluZyUyMENBJTIwMjAyMC5jcmwweQYIKwYB
// SIG // BQUHAQEEbTBrMGkGCCsGAQUFBzAChl1odHRwOi8vd3d3
// SIG // Lm1pY3Jvc29mdC5jb20vcGtpb3BzL2NlcnRzL01pY3Jv
// SIG // c29mdCUyMFB1YmxpYyUyMFJTQSUyMFRpbWVzdGFtcGlu
// SIG // ZyUyMENBJTIwMjAyMC5jcnQwDAYDVR0TAQH/BAIwADAW
// SIG // BgNVHSUBAf8EDDAKBggrBgEFBQcDCDAOBgNVHQ8BAf8E
// SIG // BAMCB4AwZgYDVR0gBF8wXTBRBgwrBgEEAYI3TIN9AQEw
// SIG // QTA/BggrBgEFBQcCARYzaHR0cDovL3d3dy5taWNyb3Nv
// SIG // ZnQuY29tL3BraW9wcy9Eb2NzL1JlcG9zaXRvcnkuaHRt
// SIG // MAgGBmeBDAEEAjANBgkqhkiG9w0BAQwFAAOCAgEAQshE
// SIG // 8CnDLtduJOHhaG1DqAp8l4oLX+kclQ1f4Iy+92BXwV6D
// SIG // ujiloDib+kKzT683EH8tJAutLONmAmuGlFoBNOLaKHaN
// SIG // pRyfXYprF9r4GNUczKx8hiMZj0aEiVplHWb6w9qS2J6m
// SIG // l/ysjP+Vfz5bHujOBoURidTTvpHq0JsXdXE7n8HJtStc
// SIG // cwgyhw21Bnt5C0dzATbCCi2gbObPS5TaAmIvuda+Xh9q
// SIG // 0JRy05YEJg4f3StO91Q43T5W0AGlqz+aFe6tDKkFVZsh
// SIG // M+Kt1weISoB7YpxQcwJ5rMGxS+Ed8ixDQrEd4g8AOlgm
// SIG // RVE0zEEKKCEOiK2wctBfvj/hwiTzEo+joJDl5jUBQi5Z
// SIG // joOJdDgWaNU6D6AgQyJ4PI5CK6SYxN0xzpgreRgf9dvL
// SIG // GRJQrOzoavweSQFmJTezIuR7cJp168p2j+EVdI9m4tZa
// SIG // 9XmGOjdp3zHg+Dehai4f28/7CausPNUpr+mcdFhGQKJz
// SIG // 6UkoIxz7ggVzzD2DlIKShT6ficLGDAI7ryo/JpyzU4bG
// SIG // VWrfjB/DB0IgsxHty0zm+gJ8/qvsbrtfg9R9dbkMnCjp
// SIG // kd53XOuhGPiMhrFnkv0g2e5L1xVqV3Cv41gibmeTmxAA
// SIG // nMGnu7pRu/IZu1Zdg823HYm+/xE1hNPM+poVonZjOZpg
// SIG // 62zkBsO/JEfa82HJk0oxggdDMIIHPwIBATB4MGExCzAJ
// SIG // BgNVBAYTAlVTMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29y
// SIG // cG9yYXRpb24xMjAwBgNVBAMTKU1pY3Jvc29mdCBQdWJs
// SIG // aWMgUlNBIFRpbWVzdGFtcGluZyBDQSAyMDIwAhMzAAAA
// SIG // XcY5eE9AfTP9AAAAAABdMA0GCWCGSAFlAwQCAQUAoIIE
// SIG // nDARBgsqhkiG9w0BCRACDzECBQAwGgYJKoZIhvcNAQkD
// SIG // MQ0GCyqGSIb3DQEJEAEEMBwGCSqGSIb3DQEJBTEPFw0y
// SIG // NjEwMjEwNzI1NDBaMC8GCSqGSIb3DQEJBDEiBCD9Y+oX
// SIG // 5D/ZG3mBGqqhhacmHrmIR99q5HzQXjXlbzALaTCBuQYL
// SIG // KoZIhvcNAQkQAi8xgakwgaYwgaMwgaAEIC01ZEtv6fPu
// SIG // QmKhZadGormGhQBDXm/cy+sXvdzEAkpdMHwwZaRjMGEx
// SIG // CzAJBgNVBAYTAlVTMR4wHAYDVQQKExVNaWNyb3NvZnQg
// SIG // Q29ycG9yYXRpb24xMjAwBgNVBAMTKU1pY3Jvc29mdCBQ
// SIG // dWJsaWMgUlNBIFRpbWVzdGFtcGluZyBDQSAyMDIwAhMz
// SIG // AAAAXcY5eE9AfTP9AAAAAABdMIIDXgYLKoZIhvcNAQkQ
// SIG // AhIxggNNMIIDSaGCA0UwggNBMIICKQIBATCCAQmhgeGk
// SIG // gd4wgdsxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNo
// SIG // aW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQK
// SIG // ExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJTAjBgNVBAsT
// SIG // HE1pY3Jvc29mdCBBbWVyaWNhIE9wZXJhdGlvbnMxJzAl
// SIG // BgNVBAsTHm5TaGllbGQgVFNTIEVTTjo3QTAwLTA1RTAt
// SIG // RDk0NzE1MDMGA1UEAxMsTWljcm9zb2Z0IFB1YmxpYyBS
// SIG // U0EgVGltZSBTdGFtcGluZyBBdXRob3JpdHmiIwoBATAH
// SIG // BgUrDgMCGgMVAL2nurW1sYDPB2jAbA8RxJrMlpD1oGcw
// SIG // ZaRjMGExCzAJBgNVBAYTAlVTMR4wHAYDVQQKExVNaWNy
// SIG // b3NvZnQgQ29ycG9yYXRpb24xMjAwBgNVBAMTKU1pY3Jv
// SIG // c29mdCBQdWJsaWMgUlNBIFRpbWVzdGFtcGluZyBDQSAy
// SIG // MDIwMA0GCSqGSIb3DQEBCwUAAgUA7oLPnTAiGA8yMDI2
// SIG // MTAyMTA1NDM1N1oYDzIwMjYxMDIyMDU0MzU3WjB0MDoG
// SIG // CisGAQQBhFkKBAExLDAqMAoCBQDugs+dAgEAMAcCAQAC
// SIG // Ag1aMAcCAQACAhJkMAoCBQDuhCEdAgEAMDYGCisGAQQB
// SIG // hFkKBAIxKDAmMAwGCisGAQQBhFkKAwKgCjAIAgEAAgMH
// SIG // oSChCjAIAgEAAgMBhqAwDQYJKoZIhvcNAQELBQADggEB
// SIG // AILgUlam68p/2Zd2My4IReOGdwHAvcZ34QqFqmKGMDfe
// SIG // Out0Aozu3++DFCgbtrtbEWkVbj33/hRhVBQTCn3blfHs
// SIG // I0YTABgLz2CawjFsYd6qX0dmfklhvSuZPoJDVS98WsGC
// SIG // 1XQh0GKC96ZF/RntrW/y5+Gr9NnehBbms74/Q+FtZbc2
// SIG // +Rlsd5GMluhwbSKLfYJ2hQs0W2QNNRrNCU22HH+keWJf
// SIG // 3F3Atz3SOWXnjDyuTjcPqJek+K/hxxatuS7LTq0NuPyp
// SIG // RAnEkwQewFqVxF1KWZ0I3oqgZR33erhoVSfT8A12sHdX
// SIG // 36x5T1TI9luDQFLKXQPWD5uRnVTmX02DczgwDQYJKoZI
// SIG // hvcNAQEBBQAEggIAnCiFz/wh/TxpqQDekbcDtJDta4vW
// SIG // FcF2UmscwWPWqUC0E/nwa3zO/EsOqLpgSAPA4BXiVYBL
// SIG // mOgNPFDjlOUILU/T12MIFwQuRQpqDYA09TPjdd3eJOZf
// SIG // wodX3oEx4aF1RIdz+770CRonoyaPyct6MgvsMvq/AVMr
// SIG // QNZWJU3tKCmkeJ6c3NuQmFx0vHUYVcmMGg8fXpLKJdAP
// SIG // Q9UJbwi8aPJTjPBcPsocbLK70cQP0tkqsZaTWC0/oQaW
// SIG // 6PWPjhmhd4u8opJSnD1pv7EHLVgFf+n4IfvfR4j9vxEb
// SIG // gmfClvJth37Rh8nl6wYlQAbINk0ASrtYiSUyE0rnHC0w
// SIG // VC9k1BrEe7QCt+4Rk+3y7vAO0C4hMUvpWF0B80TUP9By
// SIG // V9V0pcPHDO4DM0akKVrko05a0f9KPNOz4jFX7ykiL+IP
// SIG // PGKeWWNWx4nhzUXsKQ06qPmPg+33pLBgxmp9hykPnM/h
// SIG // Qenmrx6CD4WDkp6V1tNxiKVWRMMghp9d7kWAT+e8OU1P
// SIG // 2IdMs91BLG2XCp1KaOX7ICnRBfMR9rGDtK2aaZcVwdbM
// SIG // urdQ08Ekm+NQuROWAFMIgh01oRELcxf1J+z8MCEZuadf
// SIG // jyjoCsL3ZPUYiKBJmgEDQkM7Jd3bt3+A1UoJm2yixd6J
// SIG // M8pDzX678V6aWI+1pOsXIAhRY15puM7Rp4kRMY0=
// SIG // End signature block
