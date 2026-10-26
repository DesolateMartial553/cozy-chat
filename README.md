# Cozy 💗

A tiny, private AI chat for a phone, made with love for someone dear. The look
comes from the cozy mockup: a soft pink bar with pill buttons, a warm dark-plum
screen, a little cat when it opens, and "hello, you. ♡"

It is a **PWA** — a web app she installs with "Add to Home screen", so it gets a
real app icon and opens fullscreen like an app. No Play Store, no APK.

```
cozy-chat/
├── index.html            the app shell
├── css/style.css         the pastel design
├── js/app.js             chat, settings, saved on the phone
├── js/providers.js       Gemini + OpenRouter (free models), streaming
├── sw.js                 offline shell cache
├── manifest.webmanifest  makes it installable
└── icons/                the cat icon (SVG + PNG)
```

## How she gets it (once you give her the link)

1. Open the link in Chrome on her Android phone.
2. Chrome menu (⋮) → **Add to Home screen** → **Install**.
3. Tap the cat icon: it opens fullscreen, no browser bars.
4. First run: **MENU > API key** → pick the provider, paste your key, **Save**.
   That is the only setup. The key stays in her phone's storage; the repo never has it.

## For her — how to use your little corner 💗

Hello, lovely. This is yours, and it is simple on purpose.

- **Put me on your home screen.** Open this page in Chrome, tap the three dots
  (⋮) at the top right, then **Add to Home screen** → **Install**. From then on
  I am a little cat icon, one tap away — no browser bars, no faff.
- **Come and talk whenever you like.** Type in the box at the bottom in your own
  words. Plans, recipes, revision questions, gift ideas, half-formed thoughts at
  midnight — all welcome. There is no wrong way to talk to me.
- **Make it the real thing.** It starts in practice mode, with only a couple of
  lines. When you want the proper AI, tap **MENU › API key** and paste the key
  you were given. One minute, once, and you never have to think about it again.
- **Start fresh whenever.** **+ NEW** at the top wipes the chat and gives you a
  clean page. Nothing is thrown away by accident — it asks first.
- **Your words are yours.** The conversation stays saved on your phone. It only
  travels when you press send, and only to the AI you connected. Nothing else is
  watching, and there is no account to make.
- **If something feels off** — a button that will not work, a reply that looks
  strange — tell the person who gave you this. He will be glad to fix it.

Made with love, late at night, in Birmingham.

## The key (read this)

- Default provider is **Google Gemini** — free key from
  <https://aistudio.google.com/apikey>. Flash models are quick.
- **OpenRouter** works too: free models end in `:free` under MENU > Model.
- The key is stored in the phone's `localStorage` — same trust level as the Termux
  kit's `oc key`. **Never paste a key into the repo or an issue.**
- Her messages go to the provider you choose (that's who answers them). Nobody
  else — there is no server in this app. "Everything stays on your phone."

## Testing locally

```bash
cd ~/Work-Projects/cozy-chat
python -m http.server 8123
```
Open <http://localhost:8123>. (A local server is needed for the service worker;
opening the file directly works for a quick look but won't install.)

## Deploying

GitHub Pages fits: push this folder to a repo (name ideas: `cozy-chat`) and turn
on Pages. The install link becomes
`https://<user>.github.io/cozy-chat/`.

## Notes

- Chat history lives in `localStorage` (last ~200 messages kept). Clearing site
  data resets Cozy to first-run.
- The streaming parser handles both APIs' SSE formats; errors are translated into
  friendly messages (bad key / rate limit / hiccup).
- No tracking, no analytics, no external fonts or libraries — three files and
  two icons.
