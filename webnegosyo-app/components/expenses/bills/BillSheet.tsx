import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BillPayment } from "../../../lib/expenses/bill-schedule";
import {
  dueLine,
  isPausedNow,
  pauseChoices,
  payContextFor,
  shortDate,
  stopNote,
  targetDueOn,
  usualAmountLine,
  type BillPayContext,
  type BillRowModel,
} from "../../../lib/expenses/bills-screen";
import { shortCategoryName } from "../../../lib/expenses/category-look";
import { formatCents } from "../../../lib/expenses/expense-format";
import { addDays } from "../../../lib/expenses/manila-date";
import type { ExpenseCategory } from "../../../lib/expenses/types";
import { colors, spacing, typography } from "../../../theme/colors";
import { Button } from "../../Button";
import { DrawerSheet, sheetText } from "../../drawer/DrawerSheet";
import { ActionList, ActionRow, BillHero, LinkList } from "./BillSheetParts";
import { useLinkableExpenses } from "./use-linkable-expenses";
import type { BillWrites } from "./use-bill-writes";

type Step = "main" | "link" | "manage" | "pause" | "stop";

/** Where Android back (and "Back") goes from each inner step. */
const BACK_TO: Readonly<Record<Exclude<Step, "main">, Step>> = {
  link: "main",
  manage: "main",
  pause: "manage",
  stop: "manage",
};

/** What the screen shows after a write: "Skipped Rent for October · Undo". */
export interface BillDone {
  message: string;
  /** Present when the write can be undone (a skip). */
  undo?: { billId: string; dueOn: string };
}

interface BillSheetProps {
  row: BillRowModel;
  category: ExpenseCategory | null;
  categories: ReadonlyMap<string, ExpenseCategory>;
  payments: readonly BillPayment[];
  today: string;
  /** The oldest due date the board read payments for (for "N past payments"). */
  historyFrom: string;
  writes: BillWrites;
  onPay: (context: BillPayContext) => void;
  onEdit: () => void;
  onOpenExpense: (expenseId: string) => void;
  onDone: (done: BillDone) => void;
  onClose: () => void;
}

/**
 * One bill's sheet: "Mark paid" first, then the quieter answers — I already
 * recorded it, remind me tomorrow, nothing to pay this time, and edit / pause /
 * stop. Inner steps swap the body in place (never a sheet on a sheet); Android
 * back and the corner "Back" step out one level before the sheet closes.
 */
export function BillSheet(props: BillSheetProps) {
  const { row, category, payments, today, writes } = props;
  const { bill, occurrence } = row;
  const [step, setStep] = useState<Step>("main");
  const [error, setError] = useState<string | null>(null);
  const dueOn = targetDueOn(occurrence);
  const linkable = useLinkableExpenses(bill, dueOn, step === "link");

  const back = () => {
    if (writes.isBusy) return;
    setError(null);
    if (step === "main") props.onClose();
    else setStep(BACK_TO[step]);
  };

  const after = async <T,>(write: Promise<{ ok: true; value: T } | { ok: false; message: string | null }>, done: BillDone) => {
    const result = await write;
    if (!result.ok) {
      if (result.message) setError(result.message);
      return;
    }
    props.onDone(done);
  };

  const name = bill.name;
  const { payment } = occurrence;
  const month = shortDate(dueOn, today);
  const isPaused = isPausedNow(bill, today);
  const isSettled = occurrence.state === "paid" || occurrence.state === "skipped";
  const canRemind = ["late", "due_today", "due_soon", "snoozed"].includes(occurrence.state);
  const amount = row.amount ?? "Amount changes";
  const lateNote = row.note ? `${row.note}. This marks the oldest one, due ${month}.` : null;
  const categoryName = category ? shortCategoryName(category.name) : "this kind of";

  const mainBody = isPaused ? (
    <>
      <Text style={styles.lead}>{"Paused. It won't remind you or count as still to pay."}</Text>
      <Button
        label="Turn it back on"
        size="lg"
        onPress={() => void after(writes.resume(bill.id), { message: `${name} is back on` })}
        isLoading={writes.isBusy}
        disabled={writes.isBusy}
        testID="bill-resume"
      />
      <ActionList>
        <ActionRow icon="edit" label="Edit, pause or stop this bill" onPress={() => setStep("manage")} testID="bill-manage" />
      </ActionList>
    </>
  ) : isSettled ? (
    <>
      {payment ? (
        <>
          <Text style={styles.lead}>
            Paid {formatCents(payment.amountCents, { compact: true })} on {shortDate(payment.spentOn, today)}.
          </Text>
          <Button label="Open the expense" tone="secondary" size="lg" onPress={() => props.onOpenExpense(payment.expenseId)} />
        </>
      ) : (
        <>
          <Text style={styles.lead}>Marked as nothing to pay for the one due {month}.</Text>
          <Button
            label="Undo: it needs paying"
            tone="secondary"
            size="lg"
            onPress={() => void after(writes.unmark(bill.id, occurrence.dueOn), { message: `${name} is back in Bills to pay` })}
            isLoading={writes.isBusy}
            disabled={writes.isBusy}
            testID="bill-unskip"
          />
        </>
      )}
      <ActionList>
        <ActionRow icon="edit" label="Edit, pause or stop this bill" onPress={() => setStep("manage")} testID="bill-manage" />
      </ActionList>
    </>
  ) : (
    <>
      <BillHero category={category} amount={amount} usualLine={usualAmountLine(bill, payments)} note={lateNote} />
      <Button
        label="Mark paid"
        size="lg"
        icon="check"
        onPress={() => props.onPay(payContextFor(bill, dueOn, payments))}
        disabled={writes.isBusy}
        testID="bill-mark-paid"
      />
      <ActionList>
        <ActionRow icon="receipt" label="I already recorded it" hint="Pick the expense you added" onPress={() => setStep("link")} testID="bill-link" />
        {canRemind ? (
          <ActionRow
            icon="bell"
            label="Remind me tomorrow"
            onPress={() => void after(writes.snooze(bill.id, dueOn, addDays(today, 1)), { message: `We'll remind you about ${name} tomorrow` })}
            isDisabled={writes.isBusy}
            testID="bill-snooze"
          />
        ) : null}
        <ActionRow
          icon="close"
          label="Nothing to pay this time"
          onPress={() => void after(writes.skip(bill.id, dueOn), { message: `${name}: nothing to pay this time`, undo: { billId: bill.id, dueOn } })}
          isDisabled={writes.isBusy}
          testID="bill-skip"
        />
        <ActionRow icon="edit" label="Edit, pause or stop this bill" onPress={() => setStep("manage")} testID="bill-manage" />
      </ActionList>
    </>
  );

  const linkBody = (
    <>
      <Text style={styles.lead}>Which expense paid the one due {month}?</Text>
      <LinkList
        expenses={linkable.expenses}
        categories={props.categories}
        isLoading={linkable.isLoading}
        error={linkable.error}
        emptyText={`No ${categoryName} expense within 10 days of ${month}. Use Mark paid to record it.`}
        isBusy={writes.isBusy}
        onRetry={linkable.retry}
        onPick={(expense) =>
          void after(writes.link(expense.id, bill.id, dueOn), {
            message: `${name} marked paid with ${formatCents(expense.amountCents, { compact: true })}`,
          })
        }
      />
    </>
  );

  const manageBody = (
    <ActionList>
      <ActionRow icon="edit" label="Change the bill" hint="Name, amount, how often, reminders" onPress={props.onEdit} testID="bill-edit" />
      {bill.status === "active" ? (
        <ActionRow icon="clock" label="Pause it" hint="For a closed month or a break" onPress={() => setStep("pause")} testID="bill-pause" />
      ) : null}
      <ActionRow icon="trash" label="Stop this bill" tone="danger" onPress={() => setStep("stop")} testID="bill-stop" />
    </ActionList>
  );

  const pauseBody = (
    <ActionList>
      {pauseChoices(today).map((choice) => (
        <ActionRow
          key={choice.key}
          icon="clock"
          label={choice.label}
          onPress={() => void after(writes.pause(bill.id, choice.until), { message: `${name} is paused` })}
          isDisabled={writes.isBusy}
          testID={`bill-pause-${choice.key}`}
        />
      ))}
    </ActionList>
  );

  const stopBody = (
    <>
      <Text style={styles.lead}>{stopNote(bill, payments, props.historyFrom)}</Text>
      <Button
        label={`Stop ${name}`}
        tone="danger"
        size="lg"
        onPress={() => void after(writes.end(bill.id), { message: `${name} is stopped` })}
        isLoading={writes.isBusy}
        disabled={writes.isBusy}
        testID="bill-stop-confirm"
      />
    </>
  );

  const bodies: Record<Step, React.ReactNode> = { main: mainBody, link: linkBody, manage: manageBody, pause: pauseBody, stop: stopBody };
  const titles: Record<Step, string> = {
    main: name,
    link: "I already recorded it",
    manage: `Edit, pause or stop ${name}`,
    pause: `Pause ${name}`,
    stop: `Stop ${name}?`,
  };

  return (
    <DrawerSheet
      visible
      title={titles[step]}
      subtitle={step === "main" && !isPaused ? dueLine(bill, occurrence.dueOn, today) : undefined}
      onClose={back}
      isBusy={writes.isBusy}
      closeLabel={step === "main" ? "Close" : "Back"}
    >
      <View style={styles.body}>{bodies[step]}</View>
      {error ? (
        <Text style={sheetText.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, marginTop: spacing.sm },
  lead: { ...typography.body, color: colors.textSecondary },
});
