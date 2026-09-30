// Contact-hardening soft shadows (PCSS-style) for high / ultra quality and the cinematic renders.
// three r186 filters shadows with 5 hardware-compared taps of a fixed radius. Real penumbrae
// grow with the distance between the occluder and the receiver: sharp where a column meets the
// floor, soft at the far end of its shadow. The shadow map is a comparison sampler (no raw depth
// reads), so the blocker search compares each tap at three depth offsets and integrates the
// fraction of blockers further than each: the mean blocker distance, hence the penumbra, follows.
// Fully lit and fully shadowed pixels exit after the search (8 taps); only penumbrae pay for the
// 16-tap filter. Per light, `shadow.radius` carries two numbers (set by encodeShadow): its
// integer part is the widest penumbra in texels, its fraction the (log-encoded) texels of
// penumbra per unit of normalised depth. A radius without a fraction (spot lights) keeps a fixed,
// wide 16-tap Poisson filter.
import * as THREE from 'three';

const PCSS = /* glsl */ `
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texel = vec2( 1.0 ) / shadowMapSize;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				float maxT = max( floor( shadowRadius ), 1.0 );
				float enc = fract( shadowRadius );
				float pen;
				if ( enc > 0.0005 ) {
					float kt = exp2( enc * 16.0 - 8.0 );          // penumbra texels per unit of normalised depth
					float T1 = min( 2.5, maxT ), T2 = min( 8.0, maxT ), T3 = maxT;
					float b0 = 0.0, b1 = 0.0, b2 = 0.0;
					for ( int i = 0; i < 8; i ++ ) {
						vec2 uv = shadowCoord.xy + vogelDiskSample( i, 8, phi ) * T3 * texel;
						b0 += 1.0 - texture( shadowMap, vec3( uv, shadowCoord.z ) );
						b1 += 1.0 - texture( shadowMap, vec3( uv, shadowCoord.z - T1 / kt ) );
						b2 += 1.0 - texture( shadowMap, vec3( uv, shadowCoord.z - T2 / kt ) );
					}
					if ( b0 < 0.01 ) return 1.0;                               // no blocker anywhere near: lit
					float p1 = b1 / b0, p2 = b2 / b0;                         // P(blocker further than T1 / T2)
					if ( b0 > 7.99 && p1 > 0.99 && p2 > 0.99 ) return mix( 1.0, 0.0, shadowIntensity );   // deep umbra
					pen = T1 * ( 1.0 + p1 ) * 0.5 + ( T2 - T1 ) * ( p1 + p2 ) * 0.5 + ( T3 - T2 ) * p2 * 0.5;
					pen = clamp( pen, 1.25, T3 );
				} else {
					pen = maxT;
				}
				float acc = 0.0;
				for ( int i = 0; i < 16; i ++ ) {
					acc += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 16, phi ) * pen * texel, shadowCoord.z ) );
				}
				shadow = acc / 16.0;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
`;

let installed = false;
export function installSoftShadows() {
  if (installed) return true;
  const src = THREE.ShaderChunk.shadowmap_pars_fragment;
  const a = src.indexOf('float interleavedGradientNoise');
  const b0 = src.indexOf('float getShadow( sampler2DShadow shadowMap');
  const b = src.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )', b0);
  if (a < 0 || b0 < 0 || b < 0) { console.warn('[shadows] unexpected shadow chunk: soft shadows off'); return false; }
  // [interleavedGradientNoise … #endif][#if PCF] getShadow … → one block of ours
  const endHelpers = src.indexOf('#endif', a);
  const startPCF = src.lastIndexOf('#if defined( SHADOWMAP_TYPE_PCF )', b0);
  if (endHelpers < 0 || startPCF < 0 || startPCF < endHelpers) { console.warn('[shadows] unexpected shadow chunk: soft shadows off'); return false; }
  THREE.ShaderChunk.shadowmap_pars_fragment = src.slice(0, a) + src.slice(endHelpers, startPCF) + '#if defined( SHADOWMAP_TYPE_PCF )\n' + PCSS + '\t\t' + src.slice(b);
  installed = true;
  return true;
}

/**
 * Encode a light's contact-hardening parameters into shadow.radius (see above).
 * Directional lights: penumbra from the light's angular radius (userData.angularRadius, degrees;
 * default 0.6°, a slightly hazy sun) and the shadow camera's extent. Others: a fixed radius.
 */
export function encodeShadow(light, { maxTexels = 24 } = {}) {
  const sh = light.shadow, sz = sh.mapSize.x;
  if (light.isDirectionalLight) {
    const c = sh.camera, w = Math.abs(c.right - c.left), depth = Math.abs(c.far - c.near);
    const tanA = Math.tan(THREE.MathUtils.degToRad(light.userData?.angularRadius ?? 0.6));
    const kt = depth * tanA / Math.max(1e-6, w) * sz;
    const enc = Math.min(0.999, Math.max(0.001, (Math.log2(Math.max(kt, 1e-6)) + 8) / 16));
    sh.radius = Math.round(maxTexels) + enc;
  } else {
    sh.radius = Math.max(2, Math.round((sh.radius ?? 1) * 3));
  }
}
