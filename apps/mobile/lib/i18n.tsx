import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Language = "en" | "fr";

const STORAGE_KEY = "techbuddy.language";

/**
 * Flat translation tables. Keys are stable; the English copy is the source
 * of truth for review. Both objects MUST have the same keys — TypeScript
 * enforces this via the keyof intersection on Key.
 *
 * Use {placeholders} in values; the t() helper substitutes them.
 */
const STRINGS = {
  en: {
    // Home -----------------------------------------------------------------
    home_subtitle: "What can I help you with today?",
    get_help_now: "Get Help Now",
    get_help_now_helper: "Tap here to start",
    get_help_now_a11y:
      "Get help now. Tap to pick a device and start a help session.",
    recent_help: "Recent help",
    empty_recent: "Your recent help sessions will show up here.",
    history_load_error: "Couldn't load your help history.",
    see_all_history: "See all my help history",
    open_session_a11y: "Open {device} session from {when}",

    // Greetings -----------------------------------------------------------
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",

    // Time-ago -------------------------------------------------------------
    time_now: "A moment ago",
    time_minutes_ago: "{n} minutes ago",
    time_hour_ago: "1 hour ago",
    time_hours_ago: "{n} hours ago",
    time_yesterday: "Yesterday",
    time_days_ago: "{n} days ago",

    // Status badges --------------------------------------------------------
    status_active: "Open",
    status_resolved: "Resolved",
    status_escalated: "With a person",

    // Device picker --------------------------------------------------------
    devices_header: "Get help",
    devices_q: "What needs help?",
    devices_subtitle: "Pick the device you're having trouble with.",

    device_computer: "Computer",
    device_computer_caption: "Windows or Mac",
    device_phone: "This phone",
    device_phone_caption: "The one you're holding",
    device_tablet: "Tablet",
    device_tablet_caption: "iPad or Android",
    device_tv: "Smart TV",
    device_tv_caption: "Or streaming device",
    device_printer: "Printer",
    device_printer_caption: "Wired or wireless",
    device_wifi: "Wi-Fi",
    device_wifi_caption: "Internet at home",
    device_other: "Something else",
    device_other_caption: "Or not sure",

    // Card labels on Home --------------------------------------------------
    card_computer: "Computer",
    card_phone: "Phone",
    card_tablet: "Tablet",
    card_tv: "TV",
    card_printer: "Printer",
    card_wifi: "Wi-Fi",
    card_help_session: "Help session",

    // Chat -----------------------------------------------------------------
    back: "Back",
    back_a11y: "Go back to home",
    done: "Done",
    done_a11y: "I'm all done with this help session",
    chat_title: "Buddy",
    chat_done_title: "All fixed?",
    chat_done_body: "Did Buddy help you sort it out?",
    chat_done_no: "Not yet, keep going",
    chat_done_yes: "Yes, all fixed",
    type_placeholder: "Type your message…",
    send: "Send",
    send_a11y: "Send message",
    msg_input_a11y: "Message to Buddy",
    camera_a11y: "Take a photo to show Buddy",
    gallery_a11y: "Pick a screenshot or photo to send to Buddy",

    // Settings ------------------------------------------------------------
    settings: "Settings",
    settings_a11y: "Open settings",
    settings_section_language: "Language",
    settings_lang_english: "English",
    settings_lang_french: "Français",
    settings_section_text: "Text size",
    settings_text_normal: "Normal",
    settings_text_large: "Large",
    settings_text_xlarge: "Extra large",
    settings_text_preview:
      "This is how text will look in your chats with Buddy.",
    settings_section_audio: "Sound and speech",
    settings_read_aloud: "Read aloud",
    settings_read_aloud_desc:
      "Buddy will speak its replies out loud in your language.",
    settings_haptics: "Vibration on tap",
    settings_haptics_desc: "Gentle buzz when you tap a button.",

    // History --------------------------------------------------------------
    history_title: "All my help",
    history_empty:
      "You don't have any help sessions yet. Tap Get Help Now on the home screen to start one.",

    // Onboarding ----------------------------------------------------------
    onboarding_welcome_title: "Hi! I'm Buddy.",
    onboarding_welcome_body:
      "I help with computers, phones, Wi-Fi, and other tech problems. I'll walk you through fixes one step at a time, and bring in a real person when something needs it.",
    onboarding_welcome_cta: "Get started",
    onboarding_name_title: "What should I call you?",
    onboarding_name_body:
      "I'll use this to greet you, and to help if a real person needs to step in later.",
    onboarding_name_placeholder: "Your first name",
    onboarding_name_cta: "Continue",
    onboarding_creating: "Setting things up…",
    onboarding_error_title: "Something went wrong",
    onboarding_error_body:
      "Make sure you're connected to the internet, then try again.",
    onboarding_retry: "Try again",
    onboarding_splash: "TechBuddy",

    // About Me ------------------------------------------------------------
    about_me_title: "About me",
    about_me_intro:
      "Add the devices you use and the accounts you have. Buddy will remember these so it doesn't have to ask every time.",
    about_me_section_devices: "My devices",
    about_me_section_accounts: "My accounts",
    about_me_section_other: "Other",
    about_me_empty_devices:
      "No devices added yet. Tap the + below to add one.",
    about_me_empty_accounts:
      "No accounts added yet. Tap the + below to add one.",
    about_me_add_device: "Add a device",
    about_me_add_account: "Add an account",
    about_me_add_other: "Add a note",
    about_me_label_placeholder_device:
      "What kind? (e.g. Laptop, iPhone, iPad)",
    about_me_label_placeholder_account: "Which one? (e.g. Email, Netflix)",
    about_me_label_placeholder_other: "What is it?",
    about_me_details_placeholder_device:
      "Any details? (e.g. Windows 11, made by Dell)",
    about_me_details_placeholder_account:
      "Any details? (e.g. Gmail, the one I use most)",
    about_me_details_placeholder_other: "More details",
    about_me_save: "Save",
    about_me_cancel: "Cancel",
    about_me_remove: "Remove",
    about_me_remove_confirm_title: "Remove this?",
    about_me_remove_confirm_body:
      "Buddy won't remember this anymore. You can always add it again later.",
    about_me_link: "About me",
    about_me_link_desc: "Devices and accounts Buddy will remember.",
    buddy_thinking: "Buddy is thinking...",
    chips_hint: "Or pick a common one to start:",

    chip_computer_signin: "Can't sign in",
    chip_computer_suspicious: "Suspicious pop-up",
    chip_computer_slow: "Running slow",

    chip_phone_app_crash: "App keeps closing",
    chip_phone_video_call: "Video call won't work",
    chip_phone_password: "Forgot a password",

    chip_tablet_app_crash: "App keeps closing",
    chip_tablet_password: "Forgot a password",
    chip_tablet_email: "Email not working",

    chip_tv_streaming: "Can't watch shows",
    chip_tv_remote: "Remote not working",
    chip_tv_signin: "Trouble signing in",

    chip_printer_no_print: "Won't print",
    chip_printer_offline: "Printer offline",
    chip_printer_paper_ink: "Paper or ink",

    chip_wifi_connect: "Can't connect",
    chip_wifi_slow: "Internet is slow",
    chip_wifi_drop: "Wi-Fi keeps dropping",

    chip_other_password: "Forgot a password",
    chip_other_popup: "Strange pop-up",
    chip_other_email: "Email not working",
    chip_other_printer: "Printer not working",
    opening_chat: "Opening your chat…",

    // Buddy greetings (rendered locally before any API call) ---------------
    buddy_greet_generic:
      "Hi {name}! I'm Buddy. What can I help you with today?",
    buddy_greet_device:
      "Hi {name}! I'm Buddy. I hear your {device} is giving you trouble — tell me what's happening.",

    noun_computer: "computer",
    noun_phone: "phone",
    noun_tablet: "tablet",
    noun_tv: "TV",
    noun_printer: "printer",
    noun_wifi: "Wi-Fi",

    // Photo intake helper text --------------------------------------------
    photo_default_caption: "Here's a photo of what I'm seeing.",

    // Settings -------------------------------------------------------------
    settings: "Settings",
    settings_a11y: "Open settings",
    settings_section_language: "Language",
    settings_lang_english: "English",
    settings_lang_french: "Français",
    settings_section_text: "Text size",
    settings_text_normal: "Normal",
    settings_text_large: "Large",
    settings_text_xlarge: "Extra large",
    settings_text_preview:
      "This is how Buddy's messages will look at this size.",
    settings_section_audio: "Sound & speech",
    settings_read_aloud: "Read aloud",
    settings_read_aloud_desc:
      "Buddy will speak its replies out loud after they appear.",
    settings_haptics: "Vibration on tap",
    settings_haptics_desc:
      "Gentle buzz when you tap a button so you know it worked.",

    // Alerts ---------------------------------------------------------------
    alert_buddy_trouble_title: "Buddy is having trouble",
    alert_buddy_trouble_body: "Please try again in a moment.",
    alert_ok: "OK",
    alert_session_open_title: "Couldn't open that session",
    alert_session_open_body:
      "Something went wrong. Try again from the home screen.",
    alert_camera_permission_title: "Camera permission needed",
    alert_camera_permission_body:
      "TechBuddy needs camera access so you can show Buddy what's on your screen. Please allow it in your phone's Settings.",
    alert_camera_open_title: "Couldn't open the camera",
    alert_camera_open_body: "Please try again.",
    alert_gallery_permission_title: "Photos permission needed",
    alert_gallery_permission_body:
      "TechBuddy needs access to your photos so you can pick a screenshot to send. Please allow it in your phone's Settings.",
    alert_gallery_open_title: "Couldn't open your photos",
    alert_photo_send_title: "Couldn't send that photo",
    alert_photo_send_body:
      "Something went wrong preparing the image. Please try again.",
  },

  fr: {
    home_subtitle: "En quoi puis-je vous aider aujourd'hui ?",
    get_help_now: "Obtenir de l'aide",
    get_help_now_helper: "Touchez ici pour commencer",
    get_help_now_a11y:
      "Obtenir de l'aide maintenant. Touchez pour choisir un appareil et commencer une session d'aide.",
    recent_help: "Aide récente",
    empty_recent: "Vos sessions d'aide récentes apparaîtront ici.",
    history_load_error: "Impossible de charger votre historique d'aide.",
    see_all_history: "Voir tout mon historique d'aide",
    open_session_a11y: "Ouvrir la session {device} de {when}",

    morning: "Bonjour",
    afternoon: "Bon après-midi",
    evening: "Bonsoir",

    time_now: "À l'instant",
    time_minutes_ago: "Il y a {n} minutes",
    time_hour_ago: "Il y a 1 heure",
    time_hours_ago: "Il y a {n} heures",
    time_yesterday: "Hier",
    time_days_ago: "Il y a {n} jours",

    status_active: "Ouvert",
    status_resolved: "Résolu",
    status_escalated: "Avec une personne",

    devices_header: "Obtenir de l'aide",
    devices_q: "Quel appareil a besoin d'aide ?",
    devices_subtitle: "Choisissez l'appareil qui vous pose problème.",

    device_computer: "Ordinateur",
    device_computer_caption: "Windows ou Mac",
    device_phone: "Ce téléphone",
    device_phone_caption: "Celui que vous tenez",
    device_tablet: "Tablette",
    device_tablet_caption: "iPad ou Android",
    device_tv: "Téléviseur intelligent",
    device_tv_caption: "Ou appareil de diffusion",
    device_printer: "Imprimante",
    device_printer_caption: "Filaire ou sans fil",
    device_wifi: "Wi-Fi",
    device_wifi_caption: "Internet à la maison",
    device_other: "Autre chose",
    device_other_caption: "Ou je ne sais pas",

    card_computer: "Ordinateur",
    card_phone: "Téléphone",
    card_tablet: "Tablette",
    card_tv: "Téléviseur",
    card_printer: "Imprimante",
    card_wifi: "Wi-Fi",
    card_help_session: "Session d'aide",

    back: "Retour",
    back_a11y: "Revenir à l'accueil",
    done: "Terminé",
    done_a11y: "J'ai terminé cette session d'aide",
    chat_title: "Buddy",
    chat_done_title: "Tout est réglé ?",
    chat_done_body: "Buddy vous a-t-il aidé à régler le problème ?",
    chat_done_no: "Pas encore, continuons",
    chat_done_yes: "Oui, tout est réglé",
    type_placeholder: "Tapez votre message…",
    send: "Envoyer",
    send_a11y: "Envoyer le message",
    msg_input_a11y: "Message à Buddy",
    camera_a11y: "Prendre une photo pour la montrer à Buddy",
    gallery_a11y: "Choisir une capture d'écran ou une photo à envoyer à Buddy",

    settings: "Paramètres",
    settings_a11y: "Ouvrir les paramètres",
    settings_section_language: "Langue",
    settings_lang_english: "English",
    settings_lang_french: "Français",
    settings_section_text: "Taille du texte",
    settings_text_normal: "Normal",
    settings_text_large: "Grand",
    settings_text_xlarge: "Très grand",
    settings_text_preview:
      "Voici à quoi ressemblera le texte dans vos conversations avec Buddy.",
    settings_section_audio: "Son et lecture",
    settings_read_aloud: "Lecture à voix haute",
    settings_read_aloud_desc:
      "Buddy lira ses réponses à voix haute dans votre langue.",
    settings_haptics: "Vibration au toucher",
    settings_haptics_desc:
      "Léger bourdonnement lorsque vous touchez un bouton.",

    history_title: "Tout mon historique",
    history_empty:
      "Vous n'avez pas encore de sessions d'aide. Touchez Obtenir de l'aide sur l'écran d'accueil pour en commencer une.",

    onboarding_welcome_title: "Bonjour ! Je suis Buddy.",
    onboarding_welcome_body:
      "Je vous aide avec votre ordinateur, votre téléphone, votre Wi-Fi et d'autres problèmes techniques. Je vous guide pas à pas et je peux faire intervenir une vraie personne quand c'est nécessaire.",
    onboarding_welcome_cta: "Commencer",
    onboarding_name_title: "Comment dois-je vous appeler ?",
    onboarding_name_body:
      "Je l'utiliserai pour vous saluer et pour aider si une vraie personne doit intervenir plus tard.",
    onboarding_name_placeholder: "Votre prénom",
    onboarding_name_cta: "Continuer",
    onboarding_creating: "Configuration en cours…",
    onboarding_error_title: "Une erreur est survenue",
    onboarding_error_body:
      "Vérifiez votre connexion internet, puis réessayez.",
    onboarding_retry: "Réessayer",
    onboarding_splash: "TechBuddy",

    about_me_title: "À propos de moi",
    about_me_intro:
      "Ajoutez les appareils que vous utilisez et les comptes que vous avez. Buddy s'en souviendra pour ne pas avoir à demander à chaque fois.",
    about_me_section_devices: "Mes appareils",
    about_me_section_accounts: "Mes comptes",
    about_me_section_other: "Autre",
    about_me_empty_devices:
      "Aucun appareil ajouté. Touchez le + ci-dessous pour en ajouter un.",
    about_me_empty_accounts:
      "Aucun compte ajouté. Touchez le + ci-dessous pour en ajouter un.",
    about_me_add_device: "Ajouter un appareil",
    about_me_add_account: "Ajouter un compte",
    about_me_add_other: "Ajouter une note",
    about_me_label_placeholder_device:
      "Quel genre ? (ex. Portable, iPhone, iPad)",
    about_me_label_placeholder_account: "Lequel ? (ex. Courriel, Netflix)",
    about_me_label_placeholder_other: "De quoi s'agit-il ?",
    about_me_details_placeholder_device:
      "Des détails ? (ex. Windows 11, fabriqué par Dell)",
    about_me_details_placeholder_account:
      "Des détails ? (ex. Gmail, celui que j'utilise le plus)",
    about_me_details_placeholder_other: "Plus de détails",
    about_me_save: "Enregistrer",
    about_me_cancel: "Annuler",
    about_me_remove: "Retirer",
    about_me_remove_confirm_title: "Retirer ?",
    about_me_remove_confirm_body:
      "Buddy ne s'en souviendra plus. Vous pourrez toujours l'ajouter à nouveau plus tard.",
    about_me_link: "À propos de moi",
    about_me_link_desc:
      "Appareils et comptes que Buddy se rappellera.",
    buddy_thinking: "Buddy réfléchit...",
    chips_hint: "Ou choisissez un problème courant :",
    chip_computer_signin: "Connexion impossible",
    chip_computer_suspicious: "Fenêtre suspecte",
    chip_computer_slow: "Très lent",

    chip_phone_app_crash: "L'app se ferme",
    chip_phone_video_call: "Appel vidéo bloqué",
    chip_phone_password: "Mot de passe oublié",

    chip_tablet_app_crash: "L'app se ferme",
    chip_tablet_password: "Mot de passe oublié",
    chip_tablet_email: "Problème de courriel",

    chip_tv_streaming: "Impossible de regarder",
    chip_tv_remote: "Télécommande bloquée",
    chip_tv_signin: "Problème de connexion",

    chip_printer_no_print: "N'imprime pas",
    chip_printer_offline: "Imprimante hors ligne",
    chip_printer_paper_ink: "Papier ou encre",

    chip_wifi_connect: "Pas de Wi-Fi",
    chip_wifi_slow: "Internet lent",
    chip_wifi_drop: "Wi-Fi se coupe",

    chip_other_password: "Mot de passe oublié",
    chip_other_popup: "Fenêtre étrange",
    chip_other_email: "Problème de courriel",
    chip_other_printer: "Imprimante en panne",
    opening_chat: "Ouverture de votre conversation…",

    buddy_greet_generic:
      "Bonjour {name} ! Je suis Buddy. En quoi puis-je vous aider aujourd'hui ?",
    buddy_greet_device:
      "Bonjour {name} ! Je suis Buddy. Je vois que votre {device} vous donne du fil à retordre — dites-moi ce qui se passe.",

    noun_computer: "ordinateur",
    noun_phone: "téléphone",
    noun_tablet: "tablette",
    noun_tv: "téléviseur",
    noun_printer: "imprimante",
    noun_wifi: "Wi-Fi",

    photo_default_caption: "Voici une photo de ce que je vois.",

    settings: "Paramètres",
    settings_a11y: "Ouvrir les paramètres",
    settings_section_language: "Langue",
    settings_lang_english: "English",
    settings_lang_french: "Français",
    settings_section_text: "Taille du texte",
    settings_text_normal: "Normal",
    settings_text_large: "Grand",
    settings_text_xlarge: "Très grand",
    settings_text_preview:
      "Voici à quoi ressembleront les messages de Buddy à cette taille.",
    settings_section_audio: "Son et lecture",
    settings_read_aloud: "Lire à voix haute",
    settings_read_aloud_desc:
      "Buddy lira ses réponses à voix haute après qu'elles apparaissent.",
    settings_haptics: "Vibration au toucher",
    settings_haptics_desc:
      "Léger bourdonnement quand vous touchez un bouton, pour vous confirmer la touche.",

    alert_buddy_trouble_title: "Buddy a un problème",
    alert_buddy_trouble_body: "Veuillez réessayer dans un instant.",
    alert_ok: "D'accord",
    alert_session_open_title: "Impossible d'ouvrir cette session",
    alert_session_open_body:
      "Une erreur est survenue. Réessayez depuis l'écran d'accueil.",
    alert_camera_permission_title: "Permission de la caméra requise",
    alert_camera_permission_body:
      "TechBuddy a besoin d'accéder à la caméra pour que vous puissiez montrer à Buddy ce qui est à l'écran. Veuillez l'autoriser dans les paramètres de votre téléphone.",
    alert_camera_open_title: "Impossible d'ouvrir la caméra",
    alert_camera_open_body: "Veuillez réessayer.",
    alert_gallery_permission_title: "Permission des photos requise",
    alert_gallery_permission_body:
      "TechBuddy a besoin d'accéder à vos photos pour que vous puissiez choisir une capture d'écran à envoyer. Veuillez l'autoriser dans les paramètres de votre téléphone.",
    alert_gallery_open_title: "Impossible d'ouvrir vos photos",
    alert_photo_send_title: "Impossible d'envoyer cette photo",
    alert_photo_send_body:
      "Une erreur est survenue lors de la préparation de l'image. Veuillez réessayer.",
  },
} as const;

// Force both language objects to have the same keys at compile time.
type _SameKeys = (typeof STRINGS)["en"] extends Record<
  keyof (typeof STRINGS)["fr"],
  string
>
  ? (typeof STRINGS)["fr"] extends Record<keyof (typeof STRINGS)["en"], string>
    ? true
    : never
  : never;
const _check: _SameKeys = true;
void _check;

export type StringKey = keyof (typeof STRINGS)["en"];

type Vars = Record<string, string | number>;

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: StringKey, vars?: Vars) => string;
  /** True until AsyncStorage has been read at least once. */
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function interpolate(template: string, vars: Vars | undefined): string {
  if (!vars) return template;
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [ready, setReady] = useState(false);

  // Hydrate from disk on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === "en" || v === "fr") setLanguageState(v);
      })
      .catch(() => {
        /* fall back to English */
      })
      .finally(() => setReady(true));
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(STORAGE_KEY, lang).catch(() => {});
  }, []);

  const t = useCallback(
    (key: StringKey, vars?: Vars) =>
      interpolate(STRINGS[language][key], vars),
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, t, ready }),
    [language, setLanguage, t, ready]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useT must be used inside <LanguageProvider>");
  return ctx;
}
