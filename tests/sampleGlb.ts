export function sampleGlb(overrides: Record<string, unknown> = {}) {
  const points = new Float32Array([-1, -1, 0, 1, -1, 0, -0.4, 1, 0]);
  const data = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.45, 0.15, 0.8, 1] } }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, -1, 0], max: [1, 1, 0] },
      ],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      buffers: [{ byteLength: 36 }],
      ...overrides,
    }),
  );
  const length = Math.ceil(data.length / 4) * 4;
  const bytes = new Uint8Array(28 + length + points.byteLength);
  const v = new DataView(bytes.buffer);
  [
    [0, 0x46546c67],
    [4, 2],
    [8, bytes.length],
    [12, length],
    [16, 0x4e4f534a],
    [20 + length, points.byteLength],
    [24 + length, 0x004e4942],
  ].forEach(([i, n]) => v.setUint32(i, n, true));
  bytes.fill(32, 20, 20 + length);
  bytes.set(data, 20);
  bytes.set(new Uint8Array(points.buffer), 28 + length);
  return bytes;
}
