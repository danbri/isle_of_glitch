# Chromecast notes — Tellyclub

Two separate Cast quirks trace to the same root: Tellyclub casts through
Google's **Default Media Receiver**, and archive.org's older items
carry no TV-decodable video. Neither is a player bug, but both are
improvable — one with data, one with a one-time registration.

## 1. "Audio only" on the TV

Cast hardware decodes **h.264** (newer devices add VP9/AV1). It does
not decode MPEG-4 Part 2 (the DivX-era codec), MPEG-1/2, Ogg Theora, or
Cinepak — which is everything archive.org derived for its older items.
When the TV is handed one of those files it plays the AAC audio track
over a black screen.

What the pipeline does about it (`tools/enrich.mjs`):

- If the on-air file isn't h.264 but the item carries an h.264
  derivative, the program gets `castSrc: <url>` and casting uses that
  file instead. (~740 programs)
- If the item has **no h.264 encode at all**, the program gets
  `castSrc: 0`. (~810 programs, mostly the silent/early-sound era —
  their items pre-date archive.org's h.264 derive pipeline.)

For `castSrc: 0` programs the player still casts (the soundtrack can be
worth having) but says so everywhere: a toast when the load happens,
`· 🔇 audio-only on TV` in the cast mini-player, `· audio-only encode`
in the cast badge and in the title shown on the TV itself. Zapping to
any program with a real encode reloads the TV with the proper file.

There is no client-side fix for the missing encodes — the receiver
fetches the URL directly, so nothing on the phone can transcode for it.
If a mirror (see `cloudflare/`) ever grows an h.264 transcode step,
`enrich.mjs` is the place to point `castSrc` at it.

## 2. Speakers cluttering the device picker

The device list is Google's UI, filtered only by what the **receiver
app** declares it supports. The stock Default Media Receiver declares
audio-only-device support, so every Nest speaker and speaker group on
the network is listed alongside the TVs. If you pick one, Tellyclub warns
("audio-only — sound without picture") but can't stop it appearing.

To filter the picker to video devices, register your own receiver:

1. Sign up at the [Google Cast SDK Developer Console]
   (https://cast.google.com/publish) — one-time $5 fee.
2. **Add New Application → Styled Media Receiver.** No code needed; the
   stock player skinned with your name.
3. In the app's settings, leave **"Supports casting to audio-only
   devices"** (Google Cast for Audio) **unchecked**.
4. While the app is unpublished, register your Chromecast's serial as a
   test device (or just publish the app — it's only a receiver id).
5. Give Tellyclub the app id (8-character hex from the console):

   ```js
   localStorage.setItem('tvp.castAppId', JSON.stringify('YOUR_APP_ID'))
   ```

   Reload; the picker now lists video-capable devices only. Remove the
   key to fall back to the default receiver.

The knob is read in `tvp/app/js/cast.js` (`wire()`), and the player
mentions it once in the chat stream the first time the picker opens.
