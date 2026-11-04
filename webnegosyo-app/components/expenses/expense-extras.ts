import type { AddExpenseForm } from "../../lib/expenses/add-expense-form";
import { dayLabel } from "../../lib/expenses/expense-format";
import type { ExtraItem } from "./AddExpenseParts";

interface ExtrasInput {
  form: AddExpenseForm;
  today: string;
  hasReceipt: boolean;
  /** The chosen category asks for a note. */
  isNoteNeeded: boolean;
  /** Book mode only: a drawer pay-out is today, to whoever was paid at the counter. */
  canPickDateAndPayee: boolean;
  openPanel: string | null;
  onPhoto: () => void;
  onNote: () => void;
  onDate: () => void;
  onPaidTo: () => void;
}

/** The extras row: Photo · Note, and in the book also Date · Paid to — each filled once set. */
export function expenseExtras(input: ExtrasInput): ExtraItem[] {
  const { form, today, hasReceipt, openPanel } = input;
  const note = form.note.trim();
  const paidTo = form.paidToName.trim();
  const isNoteMissing = input.isNoteNeeded && note === "";
  const photo: ExtraItem = {
    key: "photo",
    icon: "camera",
    label: hasReceipt ? "Photo added" : "Photo",
    accessibilityLabel: hasReceipt ? "Receipt photo added. Change" : "Add a receipt photo",
    isSet: hasReceipt,
    onPress: input.onPhoto,
  };
  const noteItem: ExtraItem = {
    key: "note",
    icon: "note",
    label: note ? "Note added" : isNoteMissing ? "Note needed" : "Note",
    accessibilityLabel: note ? `Note: ${note}. Change` : isNoteMissing ? "Add a note, needed" : "Add a note",
    isSet: note !== "",
    isWarn: isNoteMissing,
    isOpen: openPanel === "note",
    onPress: input.onNote,
  };
  if (!input.canPickDateAndPayee) return [photo, noteItem];
  const day = dayLabel(form.spentOn);
  return [
    photo,
    noteItem,
    {
      key: "date",
      icon: "calendar",
      label: day,
      accessibilityLabel: `Date: ${day}. Change`,
      isSet: form.spentOn !== today,
      isOpen: openPanel === "date",
      onPress: input.onDate,
    },
    {
      key: "paidTo",
      icon: "account",
      label: paidTo || "Paid to",
      accessibilityLabel: paidTo ? `Paid to ${paidTo}. Change` : "Paid to",
      isSet: paidTo !== "",
      isOpen: openPanel === "paidTo",
      onPress: input.onPaidTo,
    },
  ];
}
