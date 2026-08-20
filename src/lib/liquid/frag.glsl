precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_canvas_size;
uniform vec2 u_root_size;
uniform vec4 u_lens;
uniform vec2 u_pointer;
uniform vec2 u_velocity;
uniform vec3 u_accent;
uniform float u_dpr;
uniform float u_overscan;
uniform float u_phase;
uniform float u_corner_radius;
uniform vec2 u_press_expansion;
uniform vec2 u_held_expansion;
uniform vec2 u_drag_expansion;

float sdRoundBox(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - radius;
}

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 345.45));
  point += dot(point, point + 34.345);
  return fract(point.x * point.y);
}

void main() {
  vec2 canvasPoint = vec2(
    gl_FragCoord.x / u_dpr,
    (u_canvas_size.y - gl_FragCoord.y) / u_dpr
  );
  vec2 rootPoint = canvasPoint - vec2(u_overscan);
  vec2 center = u_lens.xy;
  vec2 baseHalf = max(u_lens.zw, vec2(1.0));

  float visibility = smoothstep(0.025, 0.24, u_phase);
  float held = smoothstep(0.34, 0.72, u_phase);
  float dragging = smoothstep(0.72, 1.0, u_phase);
  vec2 expansion = vec2(1.0)
    + visibility * u_press_expansion
    + held * u_held_expansion
    + dragging * u_drag_expansion;
  vec2 halfSize = baseHalf * expansion;
  vec2 local = rootPoint - center;

  // Droplet deformation. A rounded rectangle that only translates reads as a
  // pane of glass sliding; surface tension makes a travelling blob stretch
  // along its path, thin out across it, and drag a tapered tail behind. The
  // rail is horizontal, so the deformation is solved on x only — a rotated
  // solve would fight the axis-aligned corner radii for no visible gain.
  float travel = clamp(u_velocity.x, -1.6, 1.6);
  // Saturating response: an ordinary drag should already look liquid, and a
  // hard flick should not run away into a needle.
  float drip = dragging * (1.0 - exp(-abs(travel) * 1.7));
  float lead = travel >= 0.0 ? 1.0 : -1.0;
  vec2 dropletScale = vec2(1.0 + drip * 0.22, 1.0 - drip * 0.10);
  vec2 shapePoint = local / (expansion * dropletScale);
  // Narrow the trailing half so the blob has a tail instead of two round ends.
  float tail = smoothstep(0.1, 1.0, -shapePoint.x * lead / baseHalf.x);
  float tailPinch = 1.0 - drip * 0.20 * tail;
  shapePoint.y /= max(tailPinch, 0.5);
  vec2 shapeScale = expansion * dropletScale * vec2(1.0, max(tailPinch, 0.5));

  float radius = min(u_corner_radius, min(baseHalf.x, baseHalf.y));
  float distanceToEdge = sdRoundBox(shapePoint, baseHalf, radius) * min(shapeScale.x, shapeScale.y);
  float mask = 1.0 - smoothstep(-2.1, 2.1, distanceToEdge);
  // A cast shadow just outside the silhouette. Without it the material has no
  // height: it reads as a bright decal rather than a lens lying on the rail.
  float castShadow = (1.0 - smoothstep(0.0, 11.0, distanceToEdge))
    * smoothstep(-1.0, 2.5, distanceToEdge)
    * visibility * (0.16 + held * 0.16 + dragging * 0.09);
  if (mask <= 0.001) {
    if (castShadow <= 0.002) {
      gl_FragColor = vec4(0.0);
      return;
    }
    gl_FragColor = vec4(0.0, 0.0, 0.0, castShadow);
    return;
  }

  vec2 normalized = local / max(halfSize, vec2(1.0));
  float radial = clamp(length(normalized), 0.0, 1.45);
  vec2 q = abs(shapePoint) - baseHalf + radius;
  vec2 outside = max(q, 0.0);
  vec2 shapeSign = sign(shapePoint + vec2(0.00001));
  vec2 baseNormal;
  if (dot(outside, outside) > 0.00001) {
    baseNormal = normalize(outside) * shapeSign;
  } else {
    baseNormal = q.x > q.y ? vec2(shapeSign.x, 0.0) : vec2(0.0, shapeSign.y);
  }
  vec2 normal = normalize(baseNormal / shapeScale);
  float insideDepth = max(-distanceToEdge, 0.0);
  float edgeWidth = max(min(halfSize.x, halfSize.y) * 0.34, 1.0);
  float edgeWeight = 1.0 - smoothstep(0.0, edgeWidth, insideDepth);

  // Bevel profile. A linear ramp from the rim bends the whole border band by
  // roughly the same amount, which reads as frosting rather than glass. Model
  // the edge as a quarter-round instead: the surface gradient (and therefore
  // the refraction) climbs sharply in the last few pixels and falls away fast.
  float rimT = clamp(1.0 - insideDepth / edgeWidth, 0.0, 1.0);
  float bend = min(rimT / sqrt(max(1.0 - rimT * rimT, 0.062)), 3.2) / 3.2;
  bend = smoothstep(0.0, 1.0, bend);
  float displaceWeight = mix(edgeWeight, bend, 0.55);

  float speed = min(length(u_velocity), 1.6);
  vec2 velocityDirection = speed > 0.01 ? normalize(u_velocity) : vec2(1.0, -0.16);
  float magnification = 1.0 + 0.028 * visibility + 0.088 * held + 0.070 * dragging + drip * 0.065;
  vec2 magnifiedPoint = center + local / magnification;
  float refractPixels = mix(4.6, 17.6, held) + dragging * 10.2 + speed * 3.6;

  // Only the rim facing away from the travel direction should smear. Applying
  // the shear evenly made a fast drag look uniformly blurred instead of
  // trailing, so weight it by how much each normal opposes the motion.
  float trailing = max(-dot(normal, velocityDirection), 0.0);
  vec2 motionShear = velocityDirection * speed * dragging * (0.9 + trailing * 2.9) * displaceWeight;

  vec2 displacement = normal * refractPixels * displaceWeight + motionShear;
  vec2 samplePoint = magnifiedPoint - displacement;
  vec2 sampleUV = clamp(samplePoint / u_root_size, vec2(0.001), vec2(0.999));

  // Disperse along the refraction direction rather than the raw normal so the
  // fringe follows the bend instead of ringing around the corners.
  vec2 dispersionAxis = displacement / max(length(displacement), 0.001);
  // Dispersion is the headline of the expanded state, so it is keyed almost
  // entirely off held/dragging rather than sitting at a constant level.
  float chromaAmount = (0.2 + held * 1.55 + dragging * 1.35 + speed * 0.42) * (0.16 + displaceWeight * 0.84);
  vec2 chromaOffset = dispersionAxis * chromaAmount / u_root_size;

  // Five spectral taps instead of a three-way RGB split. The extra two samples
  // fill the gap between the primaries, so the fringe grades through the
  // spectrum instead of banding into three hard colour edges.
  vec3 tapA = texture2D(u_texture, clamp(sampleUV + chromaOffset * 2.0, vec2(0.001), vec2(0.999))).rgb;
  vec3 tapB = texture2D(u_texture, clamp(sampleUV + chromaOffset, vec2(0.001), vec2(0.999))).rgb;
  vec3 tapC = texture2D(u_texture, sampleUV).rgb;
  vec3 tapD = texture2D(u_texture, clamp(sampleUV - chromaOffset, vec2(0.001), vec2(0.999))).rgb;
  vec3 tapE = texture2D(u_texture, clamp(sampleUV - chromaOffset * 2.0, vec2(0.001), vec2(0.999))).rgb;
  vec3 refracted = vec3(
    tapA.r * 0.42 + tapB.r * 0.34 + tapC.r * 0.16 + tapD.r * 0.06 + tapE.r * 0.02,
    tapB.g * 0.22 + tapC.g * 0.56 + tapD.g * 0.22,
    tapA.b * 0.02 + tapB.b * 0.06 + tapC.b * 0.16 + tapD.b * 0.34 + tapE.b * 0.42
  );

  // The bevel is a curved surface, so what it reflects depends on which way it
  // faces. A bright overhead band and a dark floor is the cheapest environment
  // that still reads as three-dimensional.
  float upFacing = clamp(-normal.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyTone = mix(vec3(0.62, 0.78, 0.94), u_accent, 0.22);
  vec3 groundTone = vec3(0.04, 0.07, 0.11);
  vec3 environment = mix(groundTone, skyTone, smoothstep(0.12, 0.92, upFacing));
  float environmentWeight = displaceWeight * (0.082 + held * 0.155 + dragging * 0.095);

  float rim = 1.0 - smoothstep(0.0, 3.2 + held * 1.8, abs(distanceToEdge));
  // A tighter inner line just behind the rim is what separates a glass edge
  // from a soft glow. It rides the lit side only.
  float innerLine = (1.0 - smoothstep(0.6, 4.6 + held * 1.8, insideDepth)) * smoothstep(0.4, 0.8, mask);

  vec2 pointerDelta = (u_pointer - rootPoint) / max(min(halfSize.x, halfSize.y), 1.0);
  float pointerDistance = length(pointerDelta);
  float contactLight = 1.0 - smoothstep(0.0, 1.75, pointerDistance);
  // An explicit lobe under the finger. The old contact term only modulated the
  // specular, so the highlight was pinned to the geometry and the light never
  // visibly travelled with the pointer.
  float pointerLobe = pow(1.0 - smoothstep(0.0, 1.35, pointerDistance), 2.3);
  vec2 pointerDirection = normalize(pointerDelta + vec2(0.0001));
  vec2 environmentLight = normalize(vec2(-0.58, -0.82));
  vec2 lightDirection = normalize(
    environmentLight
    + pointerDirection * (0.3 + contactLight * 0.42)
    - velocityDirection * speed * 0.14
  );
  float facing = max(dot(normal, -lightDirection), 0.0);
  float tightSpecular = pow(facing, 15.0);
  float softSpecular = pow(facing, 4.2);
  float strip = (1.0 - smoothstep(0.0, 0.46, abs(normalized.y + 0.52)))
    * (1.0 - smoothstep(0.72, 1.02, abs(normalized.x)))
    * (0.038 + held * 0.105 + dragging * 0.06);
  float spatialSheen = 0.96 + clamp((normalized.x - normalized.y) * 0.025, -0.035, 0.035);
  float specular = (tightSpecular * 0.86 + softSpecular * 0.2) * spatialSheen;
  specular *= (0.19 + held * 0.38 + dragging * 0.26) * (0.24 + edgeWeight * 0.76) * (0.7 + contactLight * 0.46);
  float fresnel = pow(clamp(radial, 0.0, 1.0), 3.1) * (0.10 + held * 0.20 + dragging * 0.12);
  float causticBand = displaceWeight * (0.04 + held * 0.095 + dragging * 0.05);
  // A thick glass edge does not split into two tinted sides, it sweeps the
  // whole spectrum across the bevel. Walk a hue ramp with the bevel depth and
  // let the facing direction rotate where the sweep starts.
  float spectralPhase = rimT * 1.15 - normal.x * 0.18 - normal.y * 0.1 + 0.06;
  vec3 spectrum = clamp(
    abs(fract(spectralPhase + vec3(0.0, -0.3333, -0.6667)) * 6.0 - 3.0) - 1.0,
    0.0,
    1.0
  );
  // Band it so the arc reads as a rainbow sitting in the edge rather than a
  // wash over the whole rim.
  float spectralBand = (1.0 - smoothstep(0.18, 1.0, rimT)) * smoothstep(0.0, 0.3, rimT);
  float rainbow = (rim * 0.5 + spectralBand) * (0.06 + held * 0.62 + dragging * 0.44);
  vec3 rimColor = mix(vec3(0.73, 0.91, 1.0), u_accent, 0.34);
  rimColor += spectrum * rainbow;

  // The removed inner sample used to supply the lens body. Reproduce it as a
  // tinted veil so the interior still reads as material, minus the ghosting
  // (and minus a fourth texture fetch per fragment).
  float body = 1.0 - edgeWeight;
  vec3 veil = mix(vec3(0.78, 0.9, 1.0), u_accent, 0.42);
  vec3 color = mix(refracted, refracted + u_accent * 0.085, 0.22 + held * 0.12);
  color += veil * body * (0.013 + held * 0.024 + dragging * 0.013);
  color += environment * environmentWeight;
  color += rimColor * (rim * (0.20 + held * 0.30) + fresnel);
  color += vec3(strip);
  color += vec3(innerLine * facing * (0.04 + held * 0.09 + dragging * 0.06));
  color += vec3(specular) + mix(u_accent, vec3(1.0), 0.58) * causticBand;
  color += mix(vec3(1.0), u_accent, 0.3) * pointerLobe * (0.035 + held * 0.085 + dragging * 0.06);
  color += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;

  // Thinner sheet overall. The rim, specular and caustic terms below are
  // left alone so the glass keeps its edge definition while the body of it
  // stops veiling what sits underneath.
  float alpha = mask * visibility * (0.132 + held * 0.055 + dragging * 0.032);
  alpha = clamp(
    alpha
      + rim * visibility * 0.22
      + causticBand * visibility
      + pointerLobe * visibility * (0.03 + dragging * 0.035)
      + body * visibility * (0.032 + held * 0.036)
      + environmentWeight * visibility * 0.34
      + strip * visibility * 1.05
      + rainbow * visibility * 0.16,
    0.0,
    0.80
  );
  // Composite the cast shadow underneath: it darkens without adding light.
  float shadowOutside = castShadow * (1.0 - mask);
  gl_FragColor = vec4(color * alpha, alpha + shadowOutside * (1.0 - alpha));
}
