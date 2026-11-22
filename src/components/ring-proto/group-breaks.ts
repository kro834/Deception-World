// PROTOTYPE: where a region's real groups change (人物: riders, 六詠, related,
// unmanaged), so a concept can leave a gap there instead of adding a label.
import type { ProtoItem } from "./data";

export function withGroupBreaks(items: ProtoItem[]) {
  return items.map((item, index) => ({
    item,
    breakBefore: index > 0 && item.group !== items[index - 1].group,
  }));
}
