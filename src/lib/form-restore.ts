"use client";

/**
 * React resetuje uncontrolled inputy formuláře po KAŽDÉM dokončení `action`
 * funkce — i té, co si chybu sama zachytí ve vlastním try/catch a nikam ji
 * dál nepropaguje (z pohledu Reactu akce "doběhla", tedy se resetuje). Proto
 * je po chybě potřeba hodnoty z původního FormData ručně vrátit zpět do DOM.
 */
export function restoreFormValues(form: HTMLFormElement | null, formData: FormData): void {
  if (!form) return;
  for (const key of new Set(formData.keys())) {
    const el = form.elements.namedItem(key);
    if (!el) continue;

    if (el instanceof RadioNodeList) {
      const values = formData.getAll(key).map(String);
      el.forEach((node) => {
        if (node instanceof HTMLInputElement && (node.type === "checkbox" || node.type === "radio")) {
          node.checked = values.includes(node.value);
        }
      });
      continue;
    }

    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = formData.get(key) === "on";
    } else if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      el.value = String(formData.get(key) ?? "");
    }
  }
}
