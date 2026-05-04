import { Fragment } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

/**
 * Inline-icon vocabulary that Buddy is taught in its system prompt.
 *
 * Keep this map in sync with the icon list in `apps/api/src/lib/buddy.ts` —
 * if the names drift, Buddy will emit markers we can't render (we drop them
 * silently in renderContent below) or we'll render icons Buddy was never
 * told about.
 */
const ICON_MAP: Record<string, ComponentProps<typeof Ionicons>["name"]> = {
  refresh: "refresh",
  search: "search",
  settings: "settings",
  menu: "menu",
  more: "ellipsis-horizontal",
  back: "arrow-back",
  close: "close",
  check: "checkmark",
  plus: "add",
  lock: "lock-closed",
  eye: "eye",
  mic: "mic",
  camera: "camera",
  send: "send",
  home: "home",
  mail: "mail",
  bell: "notifications",
  person: "person",
  trash: "trash",
  edit: "create",
  power: "power",
  wifi: "wifi",
  bluetooth: "bluetooth",
  volume: "volume-high",
  download: "download",
  share: "share-social",
};

const ICON_PATTERN = /\[icon:([a-z-]+)\]/g;

/**
 * Render text with inline icons. Splits the input on [icon:NAME] markers and
 * returns a fragment of text spans interleaved with Ionicons. Suitable to
 * drop inside a parent <Text> — Ionicons render correctly inside Text on RN
 * because they're font icons under the hood.
 *
 * Icons inherit the surrounding text color so they read as part of the
 * sentence. Sized slightly larger than the surrounding text since UI icons
 * read poorly when too small.
 *
 * @param content   The full message string, possibly containing markers.
 * @param fontSize  Surrounding text size in points; icons are sized 1.1×.
 * @param color     Color to render icons in; should match the text color.
 */
export function renderContent(
  content: string,
  fontSize: number,
  color: string
) {
  const parts: Array<string | { iconName: string; key: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Reset regex state — global regexes carry it across calls.
  ICON_PATTERN.lastIndex = 0;

  while ((match = ICON_PATTERN.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push({
      iconName: match[1],
      key: `icon-${match.index}`,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  const iconSize = Math.round(fontSize * 1.1);

  return parts.map((part, idx) => {
    if (typeof part === "string") {
      return <Fragment key={`t-${idx}`}>{part}</Fragment>;
    }
    const ionName = ICON_MAP[part.iconName];
    if (!ionName) {
      // Unknown icon — drop the marker entirely to avoid showing raw `[icon:foo]`.
      return null;
    }
    return (
      <Ionicons
        key={part.key}
        name={ionName}
        size={iconSize}
        color={color}
      />
    );
  });
}
