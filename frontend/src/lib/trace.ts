import { MousePoint } from '../types/ipc';

export function decodeTraceData(base64: string): MousePoint[] {
  if (!base64) return [];

  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const view = new DataView(bytes.buffer);
    let offset = 0;

    // Read count (uint32)
    if (len < 4) return [];
    const count = view.getUint32(offset, true);
    offset += 4;

    const points: MousePoint[] = [];
    // Try to detect format: v3 has 25 bytes per point, v2 has 21, v1 has 20
    let pointSize = 20
    if ((len - 4) >= count * 25) {
      pointSize = 25
    } else if ((len - 4) >= count * 21) {
      pointSize = 21
    }

    for (let i = 0; i < count; i++) {
      if (offset + pointSize > len) break;

      const tsNano = view.getBigInt64(offset, true);
      const x = view.getInt32(offset + 8, true);
      const y = view.getInt32(offset + 12, true);
      const buttons = view.getUint32(offset + 16, true);
      const hit = pointSize >= 21 ? (view.getUint8(offset + 20) === 1) : false;

      // Convert nano to milliseconds
      const ms = Number(tsNano / BigInt(1000000));

      points.push({
        ts: ms,
        x,
        y,
        buttons,
        hit,
      });

      offset += pointSize;
    }
    return points;
  } catch (e) {
    console.error("Failed to decode trace data", e);
    return [];
  }
}
