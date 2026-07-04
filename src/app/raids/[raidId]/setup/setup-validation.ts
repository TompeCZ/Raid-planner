/** 40man: 8 skupin x 5 slotů. Slot v mřížce = pozice v rámci skupiny, neukládá se —
 * jen groupNo se persistuje, kapacitu 5/skupinu hlídá appka (viz actions.ts). */
export const GROUP_COUNT = 8;
export const SLOTS_PER_GROUP = 5;

export function assertValidGroupNo(groupNo: number): void {
  if (!Number.isInteger(groupNo) || groupNo < 1 || groupNo > GROUP_COUNT) {
    throw new Error(`Skupina musí být 1–${GROUP_COUNT}.`);
  }
}

export function assertValidSlotNo(slotNo: number): void {
  if (!Number.isInteger(slotNo) || slotNo < 1 || slotNo > SLOTS_PER_GROUP) {
    throw new Error(`Slot musí být 1–${SLOTS_PER_GROUP}.`);
  }
}
