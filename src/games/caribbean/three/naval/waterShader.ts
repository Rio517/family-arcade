import * as THREE from 'three';

import { NAVAL_WATER_PRESENTATION } from './waterPresentation';

export const NAVAL_WATER_VERTEX_SHADER = `
  uniform float uTime;
  varying float vWave;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  const float waveAAmplitude = ${NAVAL_WATER_PRESENTATION.waveAAmplitude};
  const float waveBAmplitude = ${NAVAL_WATER_PRESENTATION.waveBAmplitude};
  const float waveASpeed = ${NAVAL_WATER_PRESENTATION.waveASpeed};
  const float waveBSpeed = ${NAVAL_WATER_PRESENTATION.waveBSpeed};

  void main() {
    vec3 displaced = position;
    float phaseA = displaced.x * .075 + uTime * waveASpeed;
    float phaseB = displaced.y * .11 - uTime * waveBSpeed + displaced.x * .025;
    float waveA = sin(phaseA) * waveAAmplitude;
    float waveB = sin(phaseB) * waveBAmplitude;

    // Fine directional facets affect the normal only. The two slow primary
    // waves remain the sole displacement so the ships retain their mass.
    vec2 microSlope = vec2(
      cos(displaced.x * .42 + displaced.y * .17 + uTime * .18) * .018,
      cos(displaced.y * .36 - displaced.x * .13 - uTime * .14) * .015
    );
    float dHeightDx = cos(phaseA) * .075 * waveAAmplitude
      + cos(phaseB) * .025 * waveBAmplitude + microSlope.x;
    float dHeightDy = cos(phaseB) * .11 * waveBAmplitude + microSlope.y;

    displaced.z += waveA + waveB;
    vWave = waveA + waveB;
    vec3 localNormal = normalize(vec3(-dHeightDx, -dHeightDy, 1.0));
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const NAVAL_WATER_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uDeepColor;
  uniform vec3 uScatterColor;
  uniform vec3 uAbsorption;
  uniform float uIndexOfRefraction;
  uniform float uRoughness;
  varying float vWave;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  float schlickFresnel(float cosine, float f0) {
    return f0 + (1.0 - f0) * pow(1.0 - cosine, 5.0);
  }

  float distributionGgx(float noH, float roughness) {
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;
    float denominator = noH * noH * (alpha2 - 1.0) + 1.0;
    return alpha2 / max(3.14159265 * denominator * denominator, .001);
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec2 detailSlope = vec2(
      cos(vWorldPosition.x * .72 + vWorldPosition.z * .29 + uTime * .32) * .038,
      cos(vWorldPosition.z * .61 - vWorldPosition.x * .23 - uTime * .27) * .032
    );
    normal = normalize(normal + vec3(-detailSlope.x, 0.0, -detailSlope.y));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 lightDirection = normalize(uSunDirection);
    vec3 halfDirection = normalize(viewDirection + lightDirection);
    float noV = max(dot(normal, viewDirection), .02);
    float noL = max(dot(normal, lightDirection), 0.0);
    float noH = max(dot(normal, halfDirection), 0.0);
    float facetLight = .82 + pow(noL, 3.0) * .18;

    float eta = (1.0 - uIndexOfRefraction) / (1.0 + uIndexOfRefraction);
    float f0 = eta * eta;
    float fresnel = schlickFresnel(noV, f0);
    float sunGlitter = distributionGgx(noH, uRoughness) * noL * .014;

    float opticalPath = 1.0 / max(noV, .24);
    vec3 transmitted = uDeepColor * exp(-uAbsorption * opticalPath);
    float crestLight = smoothstep(-.09, .1, vWave) * noL;
    vec3 scattering = uScatterColor * (.22 + crestLight * .26);

    vec3 reflectionDirection = reflect(-viewDirection, normal);
    vec3 skyHorizon = vec3(.73, .72, .55);
    vec3 skyZenith = vec3(.09, .38, .49);
    float reflectedHeight = smoothstep(-.08, .7, reflectionDirection.y);
    vec3 reflectedSky = mix(skyHorizon, skyZenith, reflectedHeight);

    vec3 water = (transmitted * 1.08 + scattering) * facetLight;
    vec3 color = mix(water, reflectedSky, clamp(fresnel * 1.35, 0.0, 1.0));
    color += uSunColor * min(sunGlitter, .48);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createNavalWaterUniforms() {
  return {
    uTime: { value: 0 },
    uSunDirection: { value: new THREE.Vector3(-0.43, 0.82, 0.37).normalize() },
    uSunColor: { value: new THREE.Color('#ffe4ad') },
    uDeepColor: { value: new THREE.Color('#075064') },
    uScatterColor: { value: new THREE.Color('#1f9a98') },
    uAbsorption: { value: new THREE.Color(0.22, 0.085, 0.04) },
    uIndexOfRefraction: { value: 1.333 },
    uRoughness: { value: 0.24 },
  };
}

export type NavalWaterUniforms = ReturnType<typeof createNavalWaterUniforms>;
