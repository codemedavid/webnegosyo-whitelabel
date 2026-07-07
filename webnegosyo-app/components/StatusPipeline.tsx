import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radius } from "../theme/colors";
import { getStatusMeta } from "../lib/order-visuals";

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
}

interface StatusPipelineProps {
  stages: PipelineStage[];
  onStagePress?: (key: string) => void;
}

export function StatusPipeline({ stages, onStagePress }: StatusPipelineProps) {
  return (
    <View style={styles.container}>
      {stages.map((stage) => {
        const meta = getStatusMeta(stage.key);
        const isEmpty = stage.count === 0;
        return (
          <TouchableOpacity
            key={stage.key}
            style={[styles.stage, { backgroundColor: meta.bg }, isEmpty && styles.stageEmpty]}
            onPress={() => onStagePress?.(stage.key)}
            disabled={!onStagePress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${stage.count} ${stage.label}`}
          >
            <Text style={[styles.count, { color: meta.text }, isEmpty && styles.countEmpty]}>
              {stage.count}
            </Text>
            <Text style={[styles.label, { color: meta.text }, isEmpty && styles.labelEmpty]}>
              {stage.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "stretch", gap: spacing.xs },
  stage: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
  },
  stageEmpty: { backgroundColor: colors.surfaceSubtle },
  count: { fontSize: 22, fontWeight: "800" },
  countEmpty: { color: colors.textTertiary },
  label: { fontSize: 10, fontWeight: "700", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  labelEmpty: { color: colors.textTertiary },
});
