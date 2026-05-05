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

export type Language = "en" | "fr" | "es";

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
    mic_a11y: "Tap to speak to Buddy instead of typing",
    mic_listening_a11y: "Tap to stop listening",
    voice_listening_hint: "Listening… speak naturally, then pause when you're done.",
    alert_mic_permission_title: "Microphone permission needed",
    alert_mic_permission_body:
      "TechBuddy needs microphone access to hear your voice. Please allow it in your phone's Settings.",
    alert_voice_failed_title: "Couldn't hear you",
    alert_voice_failed_body:
      "Something went wrong with the microphone. Please try again.",

    // Settings ------------------------------------------------------------
    settings: "Settings",
    settings_a11y: "Open settings",
    settings_section_language: "Language",
    settings_lang_english: "English",
    settings_lang_french: "Français",
    settings_lang_spanish: "Español",
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
    settings_section_legal: "Legal",
    settings_privacy_policy: "Privacy Policy",
    settings_terms_of_service: "Terms of Service",
    settings_legal_external_a11y: "Opens in your phone's browser",

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
    // The screenshot/picture nudge is included here so the senior sees it
    // before they start typing — most issues are easier to diagnose with a
    // picture, and the "How to take a screenshot" link below the bubble
    // gives them the steps if they don't know how.
    buddy_greet_generic:
      "Hi {name}! I'm Buddy. What can I help you with today? If you can, a picture or screenshot of what you're seeing helps me understand quickly.",
    buddy_greet_device:
      "Hi {name}! I'm Buddy. I hear your {device} is giving you trouble — tell me what's happening. If you can, a picture or screenshot of what you're seeing helps me understand quickly.",

    // Screenshot help (link under the greeting + modal contents) -----------
    screenshot_help_link: "How to take a screenshot",
    screenshot_help_link_a11y: "Show me how to take a screenshot",
    screenshot_help_modal_title: "How to take a screenshot",
    screenshot_help_modal_close: "Got it",
    screenshot_help_phone_ios:
      "On this iPhone:\n\n1. Press the Side button and the Volume Up button at the same time.\n\n2. Let go right away — you'll see a small picture appear in the corner.\n\nThen come back here and tap the photo icon on the bottom-left to send it to me.",
    screenshot_help_phone_android:
      "On this phone:\n\n1. Press the Power button and the Volume Down button at the same time.\n\n2. Let go right away — you'll see a small picture preview.\n\nThen come back here and tap the photo icon on the bottom-left to send it to me.",
    screenshot_help_tablet:
      "On most tablets:\n\nPress the Top button and the Volume Up button at the same time, then let go right away.\n\nOn an older iPad with a round Home button: press the Home button and the Top button together.\n\nThe screenshot saves to your Photos.",
    screenshot_help_computer:
      "On a Windows PC:\n\nPress the Windows key, Shift, and S all at the same time, then drag a box around what you want to capture.\n\nOn a Mac:\n\nPress Command, Shift, and 4 all together, then drag a box.\n\nEmail the picture to yourself so you can open it on this phone and send it to me.",
    screenshot_help_camera_only:
      "TVs, printers, and Wi-Fi routers can't take screenshots — but you can use this phone's camera instead.\n\nTap the camera icon on the bottom-left and take a clear photo of what you're seeing.",

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
    settings_lang_spanish: "Español",
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

    // Bug report (link + modal contents) ----------------------------------
    bug_report_link: "Report a bug",
    bug_report_link_a11y: "Report a bug to the people who built this app",
    bug_report_modal_title: "Report a bug",
    bug_report_modal_body:
      "Tell me what went wrong. If you can, add a screenshot or photo so I can see it too.",
    bug_report_description_placeholder:
      "What happened? (e.g. \"The Send button didn't do anything when I tapped it.\")",
    bug_report_take_screenshot: "Take a photo",
    bug_report_pick_screenshot: "Pick a screenshot",
    bug_report_remove_image: "Remove photo",
    bug_report_remove_image_a11y: "Remove the attached photo",
    bug_report_send: "Send report",
    bug_report_cancel: "Cancel",
    bug_report_sending: "Sending…",
    bug_report_success_title: "Thanks for letting us know",
    bug_report_success_body:
      "Your report was sent. We'll look into it. You can keep using the app.",
    bug_report_error_title: "Couldn't send that report",
    bug_report_error_body:
      "Please check your internet connection and try again.",
  },

  fr: {
    home_subtitle: "En quoi puis-je vous aider aujourd'hui ?",
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
    devices_q: "Quel appareil a besoin d'aide ?",
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
    chat_done_title: "Tout est réglé ?",
    chat_done_body: "Buddy vous a-t-il aidé à régler le problème ?",
    chat_done_no: "Pas encore, continuons",
    chat_done_yes: "Oui, tout est réglé",
    type_placeholder: "Tapez votre message…",
    send: "Envoyer",
    send_a11y: "Envoyer le message",
    msg_input_a11y: "Message à Buddy",
    camera_a11y: "Prendre une photo pour la montrer à Buddy",
    gallery_a11y: "Choisir une capture d'écran ou une photo à envoyer à Buddy",
    mic_a11y: "Toucher pour parler à Buddy au lieu de taper",
    mic_listening_a11y: "Toucher pour arrêter l'écoute",
    voice_listening_hint:
      "À l'écoute… parlez naturellement, puis faites une pause quand vous avez terminé.",
    alert_mic_permission_title: "Permission du microphone requise",
    alert_mic_permission_body:
      "TechBuddy a besoin d'accéder au microphone pour entendre votre voix. Veuillez l'autoriser dans les paramètres de votre téléphone.",
    alert_voice_failed_title: "Impossible de vous entendre",
    alert_voice_failed_body:
      "Une erreur est survenue avec le microphone. Veuillez réessayer.",

    settings: "Paramètres",
    settings_a11y: "Ouvrir les paramètres",
    settings_section_language: "Langue",
    settings_lang_english: "English",
    settings_lang_french: "Français",
    settings_lang_spanish: "Español",
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
    settings_section_legal: "Mentions légales",
    settings_privacy_policy: "Politique de confidentialité",
    settings_terms_of_service: "Conditions d'utilisation",
    settings_legal_external_a11y:
      "S'ouvre dans le navigateur de votre téléphone",

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
    chips_hint: "Ou choisissez un problème courant :",
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

    screenshot_help_link: "Comment prendre une capture d'écran",
    screenshot_help_link_a11y: "Montrez-moi comment prendre une capture d'écran",
    screenshot_help_modal_title: "Comment prendre une capture d'écran",
    screenshot_help_modal_close: "Compris",
    screenshot_help_phone_ios:
      "Sur cet iPhone :\n\n1. Appuyez sur le bouton latéral et le bouton Volume haut en même temps.\n\n2. Relâchez tout de suite — vous verrez une petite image apparaître dans le coin.\n\nRevenez ensuite ici et touchez l'icône photo en bas à gauche pour me l'envoyer.",
    screenshot_help_phone_android:
      "Sur ce téléphone :\n\n1. Appuyez sur le bouton d'alimentation et le bouton Volume bas en même temps.\n\n2. Relâchez tout de suite — vous verrez un petit aperçu de l'image.\n\nRevenez ensuite ici et touchez l'icône photo en bas à gauche pour me l'envoyer.",
    screenshot_help_tablet:
      "Sur la plupart des tablettes :\n\nAppuyez sur le bouton du haut et le bouton Volume haut en même temps, puis relâchez tout de suite.\n\nSur un iPad plus ancien avec un bouton Accueil rond : appuyez sur le bouton Accueil et le bouton du haut en même temps.\n\nLa capture d'écran est enregistrée dans vos Photos.",
    screenshot_help_computer:
      "Sur un PC Windows :\n\nAppuyez sur la touche Windows, Maj et S en même temps, puis tracez un rectangle autour de ce que vous voulez capturer.\n\nSur un Mac :\n\nAppuyez sur Commande, Maj et 4 en même temps, puis tracez un rectangle.\n\nEnvoyez-vous l'image par courriel pour pouvoir l'ouvrir sur ce téléphone et me l'envoyer.",
    screenshot_help_camera_only:
      "Les téléviseurs, imprimantes et routeurs Wi-Fi ne peuvent pas faire de captures d'écran — mais vous pouvez utiliser la caméra de ce téléphone.\n\nTouchez l'icône de l'appareil photo en bas à gauche et prenez une photo claire de ce que vous voyez.",

    buddy_greet_generic:
      "Bonjour {name} ! Je suis Buddy. En quoi puis-je vous aider aujourd'hui ? Si possible, une photo ou une capture d'écran de ce que vous voyez m'aide à comprendre rapidement.",
    buddy_greet_device:
      "Bonjour {name} ! Je suis Buddy. Je vois que votre {device} vous donne du fil à retordre — dites-moi ce qui se passe. Si possible, une photo ou une capture d'écran de ce que vous voyez m'aide à comprendre rapidement.",

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
    settings_lang_spanish: "Español",
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

    bug_report_link: "Signaler un problème",
    bug_report_link_a11y:
      "Signaler un problème aux personnes qui ont créé cette application",
    bug_report_modal_title: "Signaler un problème",
    bug_report_modal_body:
      "Dites-nous ce qui ne va pas. Si possible, ajoutez une capture d'écran ou une photo pour qu'on puisse voir.",
    bug_report_description_placeholder:
      "Que s'est-il passé ? (ex. « Le bouton Envoyer ne faisait rien quand je le touchais. »)",
    bug_report_take_screenshot: "Prendre une photo",
    bug_report_pick_screenshot: "Choisir une capture d'écran",
    bug_report_remove_image: "Retirer la photo",
    bug_report_remove_image_a11y: "Retirer la photo jointe",
    bug_report_send: "Envoyer le signalement",
    bug_report_cancel: "Annuler",
    bug_report_sending: "Envoi en cours…",
    bug_report_success_title: "Merci de nous l'avoir signalé",
    bug_report_success_body:
      "Votre signalement a été envoyé. Nous allons regarder ça. Vous pouvez continuer à utiliser l'application.",
    bug_report_error_title: "Impossible d'envoyer le signalement",
    bug_report_error_body:
      "Veuillez vérifier votre connexion internet et réessayer.",
  },

  // ==========================================================================
  // Spanish (Spain) — es-ES
  // ==========================================================================
  // First-pass translations using the formal "usted" register, which is the
  // appropriate respectful form for addressing seniors in Spain. NEEDS NATIVE
  // SPEAKER REVIEW before any Spanish-language launch — auto-generated copy
  // can miss tone, regional idioms, and the warm-but-clear voice we want
  // Buddy to have.
  // ==========================================================================
  es: {
    home_subtitle: "¿En qué puedo ayudarle hoy?",
    get_help_now: "Pedir ayuda",
    get_help_now_helper: "Toque aquí para empezar",
    get_help_now_a11y:
      "Pedir ayuda ahora. Toque para elegir un dispositivo y empezar una sesión de ayuda.",
    recent_help: "Ayuda reciente",
    empty_recent: "Sus sesiones de ayuda recientes aparecerán aquí.",
    history_load_error: "No se pudo cargar su historial de ayuda.",
    see_all_history: "Ver todo mi historial",
    open_session_a11y: "Abrir la sesión de {device} de {when}",

    morning: "Buenos días",
    afternoon: "Buenas tardes",
    evening: "Buenas noches",

    time_now: "Hace un momento",
    time_minutes_ago: "Hace {n} minutos",
    time_hour_ago: "Hace 1 hora",
    time_hours_ago: "Hace {n} horas",
    time_yesterday: "Ayer",
    time_days_ago: "Hace {n} días",

    status_active: "Abierta",
    status_resolved: "Resuelta",
    status_escalated: "Con una persona",

    devices_header: "Pedir ayuda",
    devices_q: "¿Qué necesita ayuda?",
    devices_subtitle: "Elija el dispositivo que le da problemas.",

    device_computer: "Ordenador",
    device_computer_caption: "Windows o Mac",
    device_phone: "Este teléfono",
    device_phone_caption: "El que tiene en la mano",
    device_tablet: "Tableta",
    device_tablet_caption: "iPad o Android",
    device_tv: "Televisor inteligente",
    device_tv_caption: "O reproductor",
    device_printer: "Impresora",
    device_printer_caption: "Con cable o inalámbrica",
    device_wifi: "Wi-Fi",
    device_wifi_caption: "Internet en casa",
    device_other: "Otra cosa",
    device_other_caption: "O no estoy seguro",

    card_computer: "Ordenador",
    card_phone: "Teléfono",
    card_tablet: "Tableta",
    card_tv: "Televisor",
    card_printer: "Impresora",
    card_wifi: "Wi-Fi",
    card_help_session: "Sesión de ayuda",

    back: "Atrás",
    back_a11y: "Volver al inicio",
    done: "Listo",
    done_a11y: "He terminado con esta sesión de ayuda",
    chat_title: "Buddy",
    chat_done_title: "¿Todo arreglado?",
    chat_done_body: "¿Le ha ayudado Buddy a solucionarlo?",
    chat_done_no: "Todavía no, sigamos",
    chat_done_yes: "Sí, todo arreglado",
    type_placeholder: "Escriba su mensaje…",
    send: "Enviar",
    send_a11y: "Enviar mensaje",
    msg_input_a11y: "Mensaje a Buddy",
    camera_a11y: "Hacer una foto para enseñársela a Buddy",
    gallery_a11y: "Elegir una captura de pantalla o foto para enviar a Buddy",
    mic_a11y: "Toque para hablar con Buddy en lugar de escribir",
    mic_listening_a11y: "Toque para dejar de escuchar",
    voice_listening_hint:
      "Escuchando… hable con naturalidad y haga una pausa cuando termine.",
    alert_mic_permission_title: "Hace falta permiso del micrófono",
    alert_mic_permission_body:
      "TechBuddy necesita acceso al micrófono para oír su voz. Por favor, permítalo en los Ajustes del teléfono.",
    alert_voice_failed_title: "No le pude oír",
    alert_voice_failed_body:
      "Algo salió mal con el micrófono. Por favor, inténtelo de nuevo.",

    settings: "Ajustes",
    settings_a11y: "Abrir los ajustes",
    settings_section_language: "Idioma",
    settings_lang_english: "English",
    settings_lang_french: "Français",
    settings_lang_spanish: "Español",
    settings_section_text: "Tamaño del texto",
    settings_text_normal: "Normal",
    settings_text_large: "Grande",
    settings_text_xlarge: "Muy grande",
    settings_text_preview:
      "Así se verá el texto en sus conversaciones con Buddy.",
    settings_section_audio: "Sonido y voz",
    settings_read_aloud: "Leer en voz alta",
    settings_read_aloud_desc:
      "Buddy leerá sus respuestas en voz alta en su idioma.",
    settings_haptics: "Vibración al tocar",
    settings_haptics_desc:
      "Una vibración suave cuando toca un botón, para confirmar el toque.",
    settings_section_legal: "Aviso legal",
    settings_privacy_policy: "Política de privacidad",
    settings_terms_of_service: "Términos del servicio",
    settings_legal_external_a11y: "Se abre en el navegador del teléfono",

    history_title: "Todo mi historial",
    history_empty:
      "Aún no tiene sesiones de ayuda. Toque «Pedir ayuda» en la pantalla de inicio para empezar una.",

    onboarding_welcome_title: "¡Hola! Soy Buddy.",
    onboarding_welcome_body:
      "Le ayudo con su ordenador, su teléfono, el Wi-Fi y otros problemas técnicos. Le guío paso a paso, y puedo avisar a una persona de verdad cuando hace falta.",
    onboarding_welcome_cta: "Empezar",
    onboarding_name_title: "¿Cómo debo llamarle?",
    onboarding_name_body:
      "Lo usaré para saludarle, y para ayudar si una persona tiene que intervenir más adelante.",
    onboarding_name_placeholder: "Su nombre",
    onboarding_name_cta: "Continuar",
    onboarding_creating: "Preparando todo…",
    onboarding_error_title: "Algo salió mal",
    onboarding_error_body:
      "Compruebe que está conectado a Internet y vuelva a intentarlo.",
    onboarding_retry: "Reintentar",
    onboarding_splash: "TechBuddy",

    about_me_title: "Sobre mí",
    about_me_intro:
      "Añada los dispositivos que usa y las cuentas que tiene. Buddy las recordará para no tener que preguntar cada vez.",
    about_me_section_devices: "Mis dispositivos",
    about_me_section_accounts: "Mis cuentas",
    about_me_section_other: "Otro",
    about_me_empty_devices:
      "Todavía no ha añadido ningún dispositivo. Toque el + de abajo para añadir uno.",
    about_me_empty_accounts:
      "Todavía no ha añadido ninguna cuenta. Toque el + de abajo para añadir una.",
    about_me_add_device: "Añadir un dispositivo",
    about_me_add_account: "Añadir una cuenta",
    about_me_add_other: "Añadir una nota",
    about_me_label_placeholder_device:
      "¿Qué tipo? (ej. Portátil, iPhone, iPad)",
    about_me_label_placeholder_account: "¿Cuál? (ej. Correo, Netflix)",
    about_me_label_placeholder_other: "¿De qué se trata?",
    about_me_details_placeholder_device:
      "¿Algún detalle? (ej. Windows 11, marca Dell)",
    about_me_details_placeholder_account:
      "¿Algún detalle? (ej. Gmail, el que más uso)",
    about_me_details_placeholder_other: "Más detalles",
    about_me_save: "Guardar",
    about_me_cancel: "Cancelar",
    about_me_remove: "Quitar",
    about_me_remove_confirm_title: "¿Quitar esto?",
    about_me_remove_confirm_body:
      "Buddy ya no lo recordará. Siempre podrá añadirlo de nuevo más adelante.",
    about_me_link: "Sobre mí",
    about_me_link_desc:
      "Dispositivos y cuentas que Buddy recordará.",
    buddy_thinking: "Buddy está pensando...",
    chips_hint: "O elija uno de los problemas más habituales:",
    chip_computer_signin: "No puedo entrar",
    chip_computer_suspicious: "Ventana sospechosa",
    chip_computer_slow: "Va muy lento",

    chip_phone_app_crash: "La aplicación se cierra",
    chip_phone_video_call: "La videollamada no funciona",
    chip_phone_password: "Contraseña olvidada",

    chip_tablet_app_crash: "La aplicación se cierra",
    chip_tablet_password: "Contraseña olvidada",
    chip_tablet_email: "Problema con el correo",

    chip_tv_streaming: "No puedo ver mis programas",
    chip_tv_remote: "El mando no funciona",
    chip_tv_signin: "Problema para iniciar sesión",

    chip_printer_no_print: "No imprime",
    chip_printer_offline: "Impresora sin conexión",
    chip_printer_paper_ink: "Papel o tinta",

    chip_wifi_connect: "No me conecto",
    chip_wifi_slow: "Internet va lento",
    chip_wifi_drop: "El Wi-Fi se corta",

    chip_other_password: "Contraseña olvidada",
    chip_other_popup: "Ventana extraña",
    chip_other_email: "Problema con el correo",
    chip_other_printer: "La impresora no funciona",
    opening_chat: "Abriendo su conversación…",

    screenshot_help_link: "Cómo hacer una captura de pantalla",
    screenshot_help_link_a11y:
      "Enséñeme cómo hacer una captura de pantalla",
    screenshot_help_modal_title: "Cómo hacer una captura de pantalla",
    screenshot_help_modal_close: "Entendido",
    screenshot_help_phone_ios:
      "En este iPhone:\n\n1. Pulse el botón lateral y el botón Subir volumen a la vez.\n\n2. Suéltelos enseguida — verá una pequeña imagen en la esquina.\n\nLuego vuelva aquí y toque el icono de la foto en la parte de abajo a la izquierda para enviármela.",
    screenshot_help_phone_android:
      "En este teléfono:\n\n1. Pulse el botón de Encendido y el botón Bajar volumen a la vez.\n\n2. Suéltelos enseguida — verá una vista previa pequeña.\n\nLuego vuelva aquí y toque el icono de la foto en la parte de abajo a la izquierda para enviármela.",
    screenshot_help_tablet:
      "En la mayoría de las tabletas:\n\nPulse el botón superior y el botón Subir volumen a la vez, y suéltelos enseguida.\n\nEn un iPad antiguo con botón de inicio redondo: pulse el botón de Inicio y el botón superior a la vez.\n\nLa captura se guarda en sus Fotos.",
    screenshot_help_computer:
      "En un PC con Windows:\n\nPulse la tecla Windows, Mayúsculas y S a la vez, y arrastre un recuadro alrededor de lo que quiere capturar.\n\nEn un Mac:\n\nPulse Comando, Mayúsculas y 4 a la vez, y arrastre un recuadro.\n\nMándese la imagen por correo para abrirla en este teléfono y enviármela.",
    screenshot_help_camera_only:
      "Los televisores, impresoras y rúters Wi-Fi no pueden hacer capturas de pantalla — pero puede usar la cámara de este teléfono.\n\nToque el icono de la cámara en la parte de abajo a la izquierda y haga una foto clara de lo que ve.",

    buddy_greet_generic:
      "¡Hola, {name}! Soy Buddy. ¿En qué puedo ayudarle hoy? Si puede, una foto o captura de pantalla de lo que ve me ayuda a entenderlo rápido.",
    buddy_greet_device:
      "¡Hola, {name}! Soy Buddy. He oído que su {device} le está dando problemas — cuénteme qué pasa. Si puede, una foto o captura de pantalla de lo que ve me ayuda a entenderlo rápido.",

    noun_computer: "ordenador",
    noun_phone: "teléfono",
    noun_tablet: "tableta",
    noun_tv: "televisor",
    noun_printer: "impresora",
    noun_wifi: "Wi-Fi",

    photo_default_caption: "Aquí tiene una foto de lo que veo.",

    alert_buddy_trouble_title: "Buddy tiene un problema",
    alert_buddy_trouble_body: "Por favor, inténtelo de nuevo en un momento.",
    alert_ok: "De acuerdo",
    alert_session_open_title: "No se pudo abrir esa sesión",
    alert_session_open_body:
      "Algo salió mal. Inténtelo de nuevo desde la pantalla de inicio.",
    alert_camera_permission_title: "Hace falta permiso de la cámara",
    alert_camera_permission_body:
      "TechBuddy necesita acceso a la cámara para que pueda enseñarle a Buddy lo que tiene en la pantalla. Por favor, permítalo en los Ajustes del teléfono.",
    alert_camera_open_title: "No se pudo abrir la cámara",
    alert_camera_open_body: "Por favor, inténtelo de nuevo.",
    alert_gallery_permission_title: "Hace falta permiso de las fotos",
    alert_gallery_permission_body:
      "TechBuddy necesita acceso a sus fotos para que pueda elegir una captura de pantalla. Por favor, permítalo en los Ajustes del teléfono.",
    alert_gallery_open_title: "No se pudo abrir sus fotos",
    alert_photo_send_title: "No se pudo enviar esa foto",
    alert_photo_send_body:
      "Algo salió mal al preparar la imagen. Por favor, inténtelo de nuevo.",

    bug_report_link: "Informar de un problema",
    bug_report_link_a11y:
      "Informar de un problema a las personas que crearon esta aplicación",
    bug_report_modal_title: "Informar de un problema",
    bug_report_modal_body:
      "Cuéntenos qué ha pasado. Si puede, añada una captura de pantalla o foto para que también podamos verlo.",
    bug_report_description_placeholder:
      "¿Qué ha pasado? (ej. «El botón Enviar no hacía nada cuando lo tocaba».)",
    bug_report_take_screenshot: "Hacer una foto",
    bug_report_pick_screenshot: "Elegir una captura de pantalla",
    bug_report_remove_image: "Quitar la foto",
    bug_report_remove_image_a11y: "Quitar la foto adjunta",
    bug_report_send: "Enviar informe",
    bug_report_cancel: "Cancelar",
    bug_report_sending: "Enviando…",
    bug_report_success_title: "Gracias por avisarnos",
    bug_report_success_body:
      "Su informe se ha enviado. Lo revisaremos. Puede seguir usando la aplicación.",
    bug_report_error_title: "No se pudo enviar el informe",
    bug_report_error_body:
      "Por favor, compruebe su conexión a Internet y vuelva a intentarlo.",
  },
} as const;

// Force every language object to have the exact same key set at compile
// time. Adding a new language? Add another _Check pair below.
type _CheckEnFr = (typeof STRINGS)["en"] extends Record<
  keyof (typeof STRINGS)["fr"],
  string
>
  ? (typeof STRINGS)["fr"] extends Record<keyof (typeof STRINGS)["en"], string>
    ? true
    : never
  : never;
type _CheckEnEs = (typeof STRINGS)["en"] extends Record<
  keyof (typeof STRINGS)["es"],
  string
>
  ? (typeof STRINGS)["es"] extends Record<keyof (typeof STRINGS)["en"], string>
    ? true
    : never
  : never;
const _checkFr: _CheckEnFr = true;
const _checkEs: _CheckEnEs = true;
void _checkFr;
void _checkEs;

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
        if (v === "en" || v === "fr" || v === "es") setLanguageState(v);
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
