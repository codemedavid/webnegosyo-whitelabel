import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Modal } from "../../Modal";
import { colors, radius, spacing, typography } from "../../../theme/colors";
import { centeredDialog, useCenteredDialog } from "../dialog-layout";
import { formatPeso } from "../../../lib/format";
import {
  GOV_DISCOUNT_RULES,
  maskIdNumber,
  needsManagerApproval,
  type GovDiscountKind,
  type GovProblem,
} from "../../../lib/gov-discount";
import type { PosCartLine } from "../../../lib/pos-cart";
import {
  govApprovalPending,
  withApproval,
  withDiners,
  withOfflineSkip,
  withoutClaimant,
  type PosGovApproval,
  type PosGovContext,
  type PosGovSession,
  type PosGovState,
} from "../../../lib/pos-gov-discount";
import {
  draftFromClaimant,
  isIdentityComplete,
  newClaimantDraft,
  sessionWithDraft,
  type ClaimantDraft,
} from "../../../lib/pos-gov-draft";
import { ClaimantCard } from "./ClaimantCard";
import { GovPreviewCard } from "./GovPreviewCard";
import { IdentityStep } from "./IdentityStep";
import { KindTiles } from "./KindTiles";
import { ManagerApprovalSheet } from "./ManagerApprovalSheet";
import { ShareStep } from "./ShareStep";
import { Stepper } from "./Stepper";
import { useGovIdPhotoStore } from "../../../stores/gov-id-photo-store";
import { discardIdPhoto } from "../../../lib/gov-id-photos/capture";
import type { CapturedIdPhoto } from "../../../lib/gov-id-photos/types";

type Props = {
  visible: boolean;
  onClose: () => void;
  tenantId: string;
  outletId: string | null;
  cart: readonly PosCartLine[];
  session: PosGovSession;
  context: PosGovContext;
  /** The bill before any discount: items + service charge + delivery. */
  saleGross: number;
  /** Vouchers + manual discount on the sale, for the "higher one wins" note. */
  otherDiscountTotal: number;
  /** Prices a candidate session the same way the register will. */
  price: (session: PosGovSession) => PosGovState;
  onApply: (session: PosGovSession) => void;
  /** The owner may jump to setup; everyone else is told to ask. */
  canSetUp: boolean;
  onSetUp: () => void;
  newClaimantId: () => string;
};

type Step = "who" | "id" | "share";
type SheetView = { kind: "summary" } | { kind: "draft"; step: Step; draft: ClaimantDraft };

/** The photo that goes with a claimant being applied (null = none / removed). */
type PhotoChange = { claimantId: string; photo: CapturedIdPhoto | null };

const STEP_TITLES: Record<Step, string> = { who: "Who is claiming?", id: "Their ID", share: "What's theirs?" };
const STEP_ORDER: readonly Step[] = ["who", "id", "share"];

function problemsFor(state: PosGovState, claimantId: string): GovProblem[] {
  if (state.status !== "needs_attention") return [];
  return state.problems.filter((problem) => !problem.claimantId || problem.claimantId === claimantId);
}

/**
 * The register's Senior / PWD flow: three quick answers and a live receipt.
 *
 * Who → ID → what's theirs, with the money shown as it changes. Applying adds
 * the claimant to the sale; a large discount asks a manager first (or, with no
 * connection, goes through flagged — the law never lets the till refuse).
 */
export function GovDiscountSheet(props: Props) {
  const { visible, onClose, cart, session, context, price, onApply, saleGross } = props;
  const isCentered = useCenteredDialog();
  const [view, setView] = useState<SheetView>({ kind: "summary" });
  const [approvalFor, setApprovalFor] = useState<PosGovSession | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PhotoChange | null>(null);
  const appliedPhotos = useGovIdPhotoStore((state) => state.photos);
  const setIdPhoto = useGovIdPhotoStore((state) => state.setPhoto);

  // Opening on an empty sale goes straight to step 1 — no extra tap.
  useEffect(() => {
    if (!visible) return;
    setView(
      session.claimants.length === 0
        ? { kind: "draft", step: "who", draft: newClaimantDraft(props.newClaimantId(), "senior") }
        : { kind: "summary" },
    );
    setApprovalFor(null);
    // Only on open: the session changes underneath while the sheet is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const enabledKinds = context.profile?.enabledKinds ?? [];
  const summaryState = useMemo(() => price(session), [price, session]);

  function startDraft() {
    setView({ kind: "draft", step: "who", draft: newClaimantDraft(props.newClaimantId(), "senior") });
  }

  function editClaimant(id: string) {
    const claimant = session.claimants.find((entry) => entry.id === id);
    if (claimant) {
      setView({ kind: "draft", step: "share", draft: draftFromClaimant(claimant, appliedPhotos[id] ?? null) });
    }
  }

  function savePhoto(change: PhotoChange | null) {
    if (!change) return;
    const previous = appliedPhotos[change.claimantId];
    if (previous && previous.fileUri !== change.photo?.fileUri) void discardIdPhoto(previous.fileUri);
    setIdPhoto(change.claimantId, change.photo);
  }

  function finish(next: PosGovSession, photo: PhotoChange | null = pendingPhoto) {
    onApply(next);
    savePhoto(photo);
    setApprovalFor(null);
    setPendingPhoto(null);
    setView({ kind: "summary" });
  }

  function apply(candidate: PosGovSession, reduction: number, photo: PhotoChange) {
    if (context.profile && needsManagerApproval(context.profile, reduction) && govApprovalPending(candidate, context.profile, reduction)) {
      setApprovalFor(candidate);
      setPendingPhoto(photo);
      return;
    }
    finish(candidate, photo);
  }

  function removeClaimant(id: string) {
    onApply(withoutClaimant(session, id));
    savePhoto({ claimantId: id, photo: null });
  }

  const body = !context.profile ? (
    <SetupNeeded canSetUp={props.canSetUp} onSetUp={props.onSetUp} />
  ) : view.kind === "summary" ? (
    <Summary
      session={session}
      state={summaryState}
      saleGross={saleGross}
      onAdd={startDraft}
      onEdit={editClaimant}
      onRemove={removeClaimant}
      onDiners={(diners) => onApply(withDiners(session, diners))}
      onDone={onClose}
    />
  ) : (
    <DraftFlow
      {...props}
      view={view}
      enabledKinds={enabledKinds}
      onView={setView}
      onApplyCandidate={apply}
      appliedPhoto={view.kind === "draft" ? appliedPhotos[view.draft.id] ?? null : null}
    />
  );

  const approvalState = approvalFor ? price(approvalFor) : null;
  const approvalReduction = approvalState?.status === "priced" ? approvalState.pricing.result.totalReduction : 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.backdrop, isCentered && centeredDialog.backdrop]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.sheet, isCentered && centeredDialog.sheet]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Government discount</Text>
              <Text style={styles.title}>Senior & PWD</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.close}>Close</Text>
            </TouchableOpacity>
          </View>
          {props.otherDiscountTotal > 0 && context.profile ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                This sale already has {formatPeso(props.otherDiscountTotal)} in other discounts. By law
                they get the higher one, not both — the register applies whichever saves more.
              </Text>
            </View>
          ) : null}
          {body}
        </View>
      </KeyboardAvoidingView>

      {approvalFor ? (
        <ManagerApprovalSheet
          visible
          tenantId={props.tenantId}
          outletId={props.outletId}
          reduction={approvalReduction}
          claimants={approvalFor.claimants.map((claimant) => ({
            kind: claimant.kind,
            name: claimant.name,
            idMasked: maskIdNumber(claimant.idNumber),
          }))}
          onApproved={(approval: PosGovApproval) => finish(withApproval(approvalFor, approval))}
          onSkipOffline={() => finish(withOfflineSkip(approvalFor))}
          onClose={() => {
            setApprovalFor(null);
            setPendingPhoto(null);
          }}
        />
      ) : null}
    </Modal>
  );
}

// --- the draft flow ---------------------------------------------------------

type DraftFlowProps = Props & {
  view: Extract<SheetView, { kind: "draft" }>;
  enabledKinds: readonly GovDiscountKind[];
  onView: (view: SheetView) => void;
  onApplyCandidate: (candidate: PosGovSession, reduction: number, photo: PhotoChange) => void;
  appliedPhoto: CapturedIdPhoto | null;
};

function DraftFlow(props: DraftFlowProps) {
  const { view, onView, cart, session, context, price, saleGross } = props;
  const { draft, step } = view;
  const others = useMemo(() => withoutClaimant(session, draft.id), [session, draft.id]);
  // The headcount is the table's, but it is chosen here while this claimant is
  // being set up, so it is held locally until Apply.
  const [diners, setDiners] = useState(session.diners ?? 2);
  const candidate = useMemo(() => {
    const next = sessionWithDraft(others, draft, cart, context.excludedMenuItemIds);
    const usesTable = next.claimants.some((entry) => entry.allocation.mode === "shared");
    return usesTable ? withDiners(next, diners) : next;
  }, [others, draft, cart, context.excludedMenuItemIds, diners]);
  const state = useMemo(() => price(candidate), [price, candidate]);
  const priced = state.status === "priced" ? state.pricing.result : null;
  const claimant = priced?.claimants.find((entry) => entry.id === draft.id) ?? null;
  const problems = problemsFor(state, draft.id);
  const sharedCount = candidate.claimants.filter((entry) => entry.allocation.mode === "shared").length;
  const isNew = !session.claimants.some((entry) => entry.id === draft.id);
  const rule = GOV_DISCOUNT_RULES[draft.kind];

  const setDraft = (next: ClaimantDraft) => onView({ ...view, draft: next });
  const goBack = () => {
    const index = STEP_ORDER.indexOf(step);
    if (index === 0 || (!isNew && step === "share")) {
      onView({ kind: "summary" });
      return;
    }
    onView({ ...view, step: STEP_ORDER[index - 1] });
  };

  return (
    <>
      <View style={styles.stepBar}>
        <TouchableOpacity onPress={goBack} accessibilityRole="button" hitSlop={10}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.dots} accessibilityLabel={`Step ${STEP_ORDER.indexOf(step) + 1} of 3`}>
          {STEP_ORDER.map((entry) => (
            <View key={entry} style={[styles.stepDot, STEP_ORDER.indexOf(entry) <= STEP_ORDER.indexOf(step) && styles.stepDotOn]} />
          ))}
        </View>
      </View>
      <Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        {step === "who" ? (
          <KindTiles
            kinds={props.enabledKinds}
            vatStatus={context.profile?.vatStatus ?? "vat"}
            onPick={(kind) => onView({ kind: "draft", step: "id", draft: { ...draft, kind } })}
          />
        ) : null}

        {step === "id" ? (
          <IdentityStep
            draft={draft}
            onChange={setDraft}
            photoMode={context.profile?.idPhotoMode ?? "off"}
            appliedPhoto={props.appliedPhoto}
            onSubmit={() => isIdentityComplete(draft) && onView({ ...view, step: "share" })}
          />
        ) : null}

        {step === "share" ? (
          <>
            <ShareStep
              draft={draft}
              onChange={setDraft}
              cart={cart}
              others={others}
              excluded={context.excludedMenuItemIds}
              allowShared={context.allowShared}
              diners={diners}
              minDiners={Math.max(1, sharedCount)}
              onDinersChange={setDiners}
            />
            <GovPreviewCard
              claimant={claimant}
              saleGross={saleGross}
              totalReduction={priced?.totalReduction ?? 0}
              pendingMessage={problems[0]?.message ?? null}
            />
          </>
        ) : null}
      </ScrollView>

      {step === "id" ? (
        <PrimaryButton
          label="Next"
          isDisabled={!isIdentityComplete(draft)}
          onPress={() => onView({ ...view, step: "share" })}
        />
      ) : null}
      {step === "share" ? (
        <PrimaryButton
          label={claimant ? `Apply ${rule.code} discount · −${formatPeso(claimant.reduction)}` : `Apply ${rule.code} discount`}
          isDisabled={!priced || !claimant || claimant.reduction <= 0}
          onPress={() =>
            priced &&
            props.onApplyCandidate(candidate, priced.totalReduction, {
              claimantId: draft.id,
              // A store that switched photos off keeps none, even one taken earlier.
              photo: context.profile?.idPhotoMode === "optional" ? draft.idPhoto : null,
            })
          }
        />
      ) : null}
    </>
  );
}

// --- summary and setup ------------------------------------------------------

type SummaryProps = {
  session: PosGovSession;
  state: PosGovState;
  saleGross: number;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onDiners: (diners: number) => void;
  onDone: () => void;
};

function Summary({ session, state, saleGross, onAdd, onEdit, onRemove, onDiners, onDone }: SummaryProps) {
  const priced = state.status === "priced" ? state.pricing.result : null;
  const hasShared = session.claimants.some((claimant) => claimant.allocation.mode === "shared");
  const sharedCount = session.claimants.filter((claimant) => claimant.allocation.mode === "shared").length;

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll}>
        {state.status === "needs_attention" ? (
          <View style={[styles.notice, styles.noticeDanger]}>
            <Text style={styles.noticeText}>{state.problems[0]?.message}</Text>
          </View>
        ) : null}
        {priced?.claimants.map((claimant) => (
          <ClaimantCard
            key={claimant.id}
            claimant={claimant}
            diners={session.diners}
            onEdit={() => onEdit(claimant.id)}
            onRemove={() => onRemove(claimant.id)}
          />
        ))}
        {hasShared ? (
          <View style={styles.dinersRow}>
            <Text style={styles.dinersLabel}>People at the table</Text>
            <Stepper
              value={session.diners ?? 2}
              min={Math.max(1, sharedCount)}
              max={50}
              label="diners"
              onChange={onDiners}
            />
          </View>
        ) : null}
        <TouchableOpacity style={styles.addAnother} onPress={onAdd} accessibilityRole="button">
          <Text style={styles.addAnotherText}>+ Add another Senior / PWD</Text>
        </TouchableOpacity>
        {priced ? (
          <View style={styles.totals}>
            <Text style={styles.totalsLabel}>Taken off this sale</Text>
            <Text style={styles.totalsValue}>−{formatPeso(priced.totalReduction)}</Text>
            <Text style={styles.totalsHint}>
              Order now {formatPeso(Math.max(0, saleGross - priced.totalReduction))}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <PrimaryButton label="Done" onPress={onDone} />
    </>
  );
}

function SetupNeeded({ canSetUp, onSetUp }: { canSetUp: boolean; onSetUp: () => void }) {
  return (
    <View style={styles.setup}>
      <Text style={styles.setupTitle}>One setting first</Text>
      <Text style={styles.setupBody}>
        Senior and PWD discounts are worked out differently for VAT-registered and non-VAT stores.
        {canSetUp
          ? " Tell us which this store is, once, and the register does the math from then on."
          : " Ask the owner to finish Tax & discounts in Settings. Until then, give the discount by hand and note the ID."}
      </Text>
      {canSetUp ? <PrimaryButton label="Set up Tax & discounts" onPress={onSetUp} /> : null}
    </View>
  );
}

function PrimaryButton({ label, onPress, isDisabled = false }: { label: string; onPress: () => void; isDisabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.primary, isDisabled && styles.primaryDisabled]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "94%",
    gap: spacing.sm,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  eyebrow: { ...typography.eyebrow, color: colors.textSecondary },
  title: { ...typography.title, color: colors.textPrimary },
  close: { ...typography.body, fontWeight: "600", color: colors.primary },
  notice: { backgroundColor: colors.infoLight, borderRadius: radius.md, padding: spacing.md },
  noticeDanger: { backgroundColor: colors.dangerLight },
  noticeText: { ...typography.caption, color: colors.textPrimary },
  stepBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xs },
  back: { ...typography.body, fontWeight: "600", color: colors.primary },
  dots: { flexDirection: "row", gap: 6 },
  stepDot: { width: 22, height: 4, borderRadius: radius.full, backgroundColor: colors.separator },
  stepDotOn: { backgroundColor: colors.accent },
  stepTitle: { ...typography.heading, fontSize: 20, color: colors.textPrimary },
  scroll: { gap: spacing.md, paddingVertical: spacing.sm },
  dinersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
  },
  dinersLabel: { ...typography.body, fontWeight: "600", color: colors.textPrimary },
  addAnother: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  addAnotherText: { ...typography.body, fontWeight: "700", color: colors.textPrimary },
  totals: { alignItems: "center", gap: 2, paddingVertical: spacing.sm },
  totalsLabel: { ...typography.eyebrow, color: colors.textSecondary },
  totalsValue: { ...typography.title, color: colors.success, fontVariant: ["tabular-nums"] },
  totalsHint: { ...typography.caption, color: colors.textSecondary },
  setup: { gap: spacing.md, paddingVertical: spacing.md },
  setupTitle: { ...typography.heading, color: colors.textPrimary },
  setupBody: { ...typography.body, color: colors.textSecondary },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { ...typography.body, fontWeight: "700", color: colors.card },
});
