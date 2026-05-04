import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  createUserContext,
  deleteUserContext,
  listUserContext,
  type UserContext,
  type UserContextKind,
} from "@/lib/api";
import { useT, type StringKey } from "@/lib/i18n";
import { useHaptics } from "@/lib/haptics";

type SectionDef = {
  kind: UserContextKind;
  titleKey: StringKey;
  emptyKey: StringKey;
  addKey: StringKey;
  labelPlaceholderKey: StringKey;
  detailsPlaceholderKey: StringKey;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};

const SECTIONS: ReadonlyArray<SectionDef> = [
  {
    kind: "device",
    titleKey: "about_me_section_devices",
    emptyKey: "about_me_empty_devices",
    addKey: "about_me_add_device",
    labelPlaceholderKey: "about_me_label_placeholder_device",
    detailsPlaceholderKey: "about_me_details_placeholder_device",
    icon: "hardware-chip-outline",
  },
  {
    kind: "account",
    titleKey: "about_me_section_accounts",
    emptyKey: "about_me_empty_accounts",
    addKey: "about_me_add_account",
    labelPlaceholderKey: "about_me_label_placeholder_account",
    detailsPlaceholderKey: "about_me_details_placeholder_account",
    icon: "person-circle-outline",
  },
];

export default function AboutMeScreen() {
  const router = useRouter();
  const { t } = useT();
  const haptics = useHaptics();

  const [items, setItems] = useState<UserContext[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingKind, setEditingKind] = useState<UserContextKind | null>(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await listUserContext();
      setItems(fresh);
    } catch (err) {
      console.error("[about-me] list failed", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listUserContext()
        .then((fresh) => {
          if (!cancelled) setItems(fresh);
        })
        .catch((err: unknown) => {
          console.error("[about-me] list failed", err);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  function handleRemove(item: UserContext) {
    Alert.alert(
      t("about_me_remove_confirm_title"),
      t("about_me_remove_confirm_body"),
      [
        { text: t("about_me_cancel"), style: "cancel" },
        {
          text: t("about_me_remove"),
          style: "destructive",
          onPress: async () => {
            haptics.selection();
            try {
              await deleteUserContext(item.id);
              setItems((prev) => prev.filter((p) => p.id !== item.id));
            } catch (err) {
              console.error("[about-me] delete failed", err);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("back_a11y")}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
          hitSlop={12}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>{t("back")}</Text>
        </Pressable>

        <Text style={styles.headerTitle}>{t("about_me_title")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{t("about_me_intro")}</Text>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#5A6173" />
          </View>
        ) : (
          SECTIONS.map((sec) => {
            const sectionItems = items.filter((i) => i.kind === sec.kind);
            return (
              <View key={sec.kind} style={styles.section}>
                <Text style={styles.sectionTitle}>{t(sec.titleKey)}</Text>
                <View style={styles.sectionCard}>
                  {sectionItems.length === 0 ? (
                    <Text style={styles.empty}>{t(sec.emptyKey)}</Text>
                  ) : (
                    sectionItems.map((item, idx) => (
                      <View
                        key={item.id}
                        style={[
                          styles.itemRow,
                          idx > 0 && styles.itemRowDivider,
                        ]}
                      >
                        <View style={styles.itemBody}>
                          <Text style={styles.itemLabel}>{item.label}</Text>
                          {item.details ? (
                            <Text style={styles.itemDetails}>
                              {item.details}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => handleRemove(item)}
                          accessibilityRole="button"
                          accessibilityLabel={t("about_me_remove")}
                          style={({ pressed }) => [
                            styles.removeButton,
                            pressed && styles.removeButtonPressed,
                          ]}
                          hitSlop={10}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={20}
                            color="#C8312D"
                          />
                        </Pressable>
                      </View>
                    ))
                  )}

                  <Pressable
                    onPress={() => {
                      haptics.selection();
                      setEditingKind(sec.kind);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t(sec.addKey)}
                    style={({ pressed }) => [
                      styles.addButton,
                      pressed && styles.addButtonPressed,
                    ]}
                  >
                    <Ionicons name="add" size={22} color="#2A6CF6" />
                    <Text style={styles.addButtonText}>{t(sec.addKey)}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {editingKind ? (
        <AddItemSheet
          kind={editingKind}
          section={SECTIONS.find((s) => s.kind === editingKind)!}
          onClose={() => setEditingKind(null)}
          onSaved={async () => {
            setEditingKind(null);
            await refresh();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function AddItemSheet({
  kind,
  section,
  onClose,
  onSaved,
}: {
  kind: UserContextKind;
  section: SectionDef;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const haptics = useHaptics();
  const [label, setLabel] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!label.trim() || !details.trim() || saving) return;
    setSaving(true);
    haptics.selection();
    try {
      await createUserContext({
        kind,
        label: label.trim(),
        details: details.trim(),
      });
      onSaved();
    } catch (err) {
      console.error("[about-me] create failed", err);
      setSaving(false);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalBackdrop}
      >
        <Pressable
          style={styles.backdropFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("about_me_cancel")}
        />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t(section.addKey)}</Text>

          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder={t(section.labelPlaceholderKey)}
            placeholderTextColor="#8E96A8"
            style={styles.modalInput}
            autoFocus
          />
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder={t(section.detailsPlaceholderKey)}
            placeholderTextColor="#8E96A8"
            style={[styles.modalInput, styles.modalInputMultiline]}
            multiline
          />

          <View style={styles.modalActions}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.modalSecondary,
                pressed && styles.modalSecondaryPressed,
              ]}
            >
              <Text style={styles.modalSecondaryText}>
                {t("about_me_cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!label.trim() || !details.trim() || saving}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.modalPrimary,
                (!label.trim() || !details.trim() || saving) &&
                  styles.modalPrimaryDisabled,
                pressed && styles.modalPrimaryPressed,
              ]}
            >
              <Text style={styles.modalPrimaryText}>
                {t("about_me_save")}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E8EF",
    minHeight: 56,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    minWidth: 80,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  backButtonPressed: { backgroundColor: "#F0F2F8" },
  backArrow: {
    fontSize: 32,
    color: "#2A6CF6",
    marginRight: 4,
    lineHeight: 32,
    marginTop: -4,
  },
  backText: { fontSize: 18, color: "#2A6CF6", fontWeight: "500" },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    textAlign: "center",
  },
  headerSpacer: { minWidth: 80 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  intro: {
    fontSize: 16,
    color: "#5A6173",
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 4,
  },

  loadingWrap: { paddingVertical: 40, alignItems: "center" },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#5A6173",
    letterSpacing: 0.6,
    marginBottom: 10,
    paddingHorizontal: 4,
    textTransform: "uppercase",
  },
  sectionCard: {
    backgroundColor: "#F6F7FB",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  empty: {
    fontSize: 15,
    color: "#5A6173",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  itemRowDivider: {
    borderTopWidth: 1,
    borderTopColor: "#E6E8EF",
  },
  itemBody: { flex: 1, paddingRight: 12 },
  itemLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1F2C",
    marginBottom: 2,
  },
  itemDetails: { fontSize: 14, color: "#5A6173", lineHeight: 19 },
  removeButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  removeButtonPressed: { backgroundColor: "#FFE9E9" },

  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#E6E8EF",
    gap: 6,
  },
  addButtonPressed: { opacity: 0.7 },
  addButtonText: { fontSize: 16, fontWeight: "600", color: "#2A6CF6" },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 31, 44, 0.45)",
    justifyContent: "flex-end",
  },
  backdropFill: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1F2C",
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: "#F6F7FB",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: "#1A1F2C",
    marginBottom: 12,
    minHeight: 56,
  },
  modalInputMultiline: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  modalSecondary: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: "#F1F4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryPressed: { backgroundColor: "#E4ECFB" },
  modalSecondaryText: { fontSize: 17, fontWeight: "600", color: "#2A6CF6" },
  modalPrimary: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: "#2A6CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryDisabled: { backgroundColor: "#B5C4E8" },
  modalPrimaryPressed: { opacity: 0.85 },
  modalPrimaryText: { fontSize: 17, fontWeight: "600", color: "#FFFFFF" },
});
