import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useHaptics } from "@/lib/haptics";

type Props = {
  checked: boolean;
  onToggle: (next: boolean) => void;
  label: string;
  /** Optional smaller line under the label. */
  helper?: string;
  disabled?: boolean;
};

/**
 * Senior-friendly checkbox — the whole row is tappable (not just a tiny
 * box), matching the rest of the app's "big tap targets" rule. Used for
 * "Remember my password" on the signup and login screens.
 */
export function CheckboxRow({ checked, onToggle, label, helper, disabled }: Props) {
  const haptics = useHaptics();

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.selection();
        onToggle(!checked);
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
      hitSlop={4}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: 8,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  box: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#B9C1D1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: "#FFFFFF",
  },
  boxChecked: {
    backgroundColor: "#2A6CF6",
    borderColor: "#2A6CF6",
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1F2C",
  },
  helper: {
    fontSize: 13,
    color: "#5A6173",
    marginTop: 2,
    lineHeight: 18,
  },
});
