# TechBuddy Privacy Policy

**Last updated: May 3, 2026**

This is the privacy policy for **TechBuddy**, a mobile app that helps seniors with technology problems. We've tried to write this in plain English so anyone can understand what we do with your information. If something here is unclear, please email us — see the **Contact** section at the bottom.

## Who we are

TechBuddy is operated by Tariq (an individual developer in beta-stage product development). All references to "we", "our", or "us" mean the developer of the TechBuddy app.

## What information we collect

When you use TechBuddy, we collect:

- **Your first name** — what you tell us during onboarding. We use this to greet you and to give context to Buddy (the AI assistant) so it can address you naturally.
- **Your conversations with Buddy** — every message you send and every reply Buddy gives. We store these so you can come back to a past help session and pick up where you left off.
- **The device you ask about** — when you start a help session, you pick a device (computer, phone, TV, etc.). We save this so Buddy knows what context to start in.
- **"About me" facts** — things you choose to add in the About me screen, such as the kind of laptop you use or the email service you have. These are stored only because you explicitly added them, and you can delete any of them anytime from the About me screen.
- **Photos you send to Buddy** — when you take a photo or pick one from your gallery to show Buddy what's on your screen. **Photos are sent to our AI provider for analysis but are not stored on our servers**. After Buddy reads the photo and replies, the image is discarded.
- **Voice transcripts** — when you use the microphone button to speak to Buddy, your speech is converted to text by your phone's built-in speech recognition. **Audio recordings stay on your phone and never leave it.** Only the resulting text is sent to our servers, and is stored as part of your conversation history.
- **Basic session metadata** — when a session starts and ends, whether it was resolved or abandoned. This helps us understand how the app is being used and improve it.

We do **not** collect:

- Your email address (we don't currently use email-based accounts)
- Your phone number
- Your physical address
- Your contacts, photos library, calendar, or other personal data on your phone
- Your precise location
- Browsing or web history outside the app

## How we use your information

We use what we collect only to:

1. Provide the help service you came to TechBuddy for
2. Let you resume past conversations
3. Help Buddy give better answers by knowing your name and the devices you use
4. Diagnose and fix problems with the app

We do **not** sell your information. We do **not** use your conversations or photos to train AI models. We do **not** show you advertisements.

## Who else sees your information

Operating TechBuddy requires the help of three other companies. We share information with them only as much as the service requires:

- **Anthropic** (our AI provider) — your messages, photos, and any "About me" facts that are relevant to a current conversation are sent to Anthropic so their Claude model can read them and reply. Anthropic processes this data on your behalf and does not retain it for training. See [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy).
- **Neon** (our database host) — your conversations and account data are stored in a Neon Postgres database hosted on Amazon Web Services in the United States. See [Neon's privacy policy](https://neon.tech/privacy-policy).
- **Render** (our backend host) — the TechBuddy backend runs on Render's servers. Render does not have access to your data beyond what's needed to operate the service.

We don't share your information with anyone else, including advertisers, analytics companies, or data brokers.

## How we store and protect your data

- Your account data lives in an encrypted PostgreSQL database hosted in the United States.
- Communication between your phone and our servers is encrypted (HTTPS).
- Your account is identified by a unique ID generated when you onboard. The ID itself is treated as a credential — anyone with it can access your account.
- We don't currently support passwords or two-factor authentication. This is suitable for an early beta. We will add stronger account protection before TechBuddy is available to the general public.

## Photos and voice — extra detail

Because these are sensitive types of data, we want to be specific:

- **Photos**: when you tap the camera or gallery icon, you grant TechBuddy permission to access that photo. The image is sent to Anthropic for analysis (so Buddy can read what's on the screen). The image is **not stored on our servers**. Only Buddy's text reply about the photo is saved as part of the conversation.
- **Voice**: when you tap the microphone icon, your phone's operating system (Android or iOS) records audio and converts it to text using its built-in speech recognition. **The audio recording itself never leaves your phone.** Only the resulting text is sent to our servers. We do not record, transmit, or store any voice audio.

## Your rights

You can:

- **See your data** — your About me, your conversation history, and your sessions are all visible inside the app at any time.
- **Delete your About me facts** — tap the trash icon next to any item in About me.
- **Delete your account** — for now, please email us (contact below) and we'll permanently delete all your data within 30 days. We will add an in-app delete option in a future update.
- **Ask questions about your data** — email us anytime and we'll respond.

If you live in a place with a privacy law that gives you specific rights — such as the EU (GDPR), California (CCPA), or Quebec (Law 25) — those rights still apply, and you can email us to exercise them.

## Children

TechBuddy is designed for adults, particularly seniors. We do not knowingly collect information from anyone under 18. If you believe a child has used the app without their parent's permission, please email us and we'll delete the account.

## Changes to this policy

If we change how we handle your data in any meaningful way, we'll update this policy and update the "Last updated" date at the top. For significant changes, we'll show a notice in the app the next time you open it. If you don't agree with a change, you can stop using TechBuddy and email us to delete your data.

## Contact

If you have any questions about this policy or about your data, please email **techbuddy.support@teekaylabs.net** with the subject line "TechBuddy Privacy". We aim to respond within 7 days.
