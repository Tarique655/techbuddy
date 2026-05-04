# @techbuddy/desktop

The Windows/Mac companion app installed on the senior's computer. Its primary job is to host a remote desktop session so a human technician can connect.

**Stack:** Electron + electron-vite + React + TypeScript.

## To scaffold (after env setup is verified)

From this folder:

```powershell
pnpm create @quick-start/electron . --template react-ts
```

## Responsibilities

- Trusted-installer experience: signed Windows/Mac binary, auto-update
- Remote-desktop client (we'll evaluate RustDesk SDK vs WebRTC vs paid SDKs)
- Always-visible big red "End Session" button in the chrome
- Heartbeat to backend so the family portal knows when a session is live
- One-tap "share my screen" approval that the senior can read in plain English

## Why Electron over Tauri

Tauri is leaner, but the remote-desktop ecosystem (screen capture, input injection, codec libs) is richer on Electron/Node. Re-evaluate after MVP.
