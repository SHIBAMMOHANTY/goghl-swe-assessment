# Private Notes Encryption Protocol (`PROTOCOL.md`)

Switchboard implements client-side end-to-end encryption (E2EE) for internal agent notes so the server stores and relays notes without ever receiving plaintext or decryption keys.

## 1. Key Holders & Key Lifecycle

- **Workspace Agents (Browsers)**: Each agent browser holds a 256-bit symmetric `AES-GCM` workspace key (`K_ws`) in `localStorage` (`sb_e2e_key:<workspace>`).
- **Key Generation & Distribution**: An agent generates `K_ws` locally using `crypto.getRandomValues(32)` in `scaffold/web/src/crypto.ts` and shares it out-of-band with teammates in the same workspace (or imports an existing base64url key). A 6-byte SHA-256 fingerprint (`keyId`) lets teammates confirm they are using the same key without exposing `K_ws`.
- **Switchboard Server**: Never receives `K_ws` or plaintext note content. It only checks session authentication and workspace membership before storing or returning ciphertext records.

## 2. What the Server Stores

In the `notes` MongoDB collection (`NoteDoc` in `scaffold/server/src/store/schema.ts`), the server stores:

- `workspace` (`string`): Workspace identifier.
- `contact` (`string`): Conversation contact identifier.
- `authorSub` (`string`) and `authorName` (`string`): Authenticated author metadata.
- `ciphertext` (`string`): Base64url-encoded `AES-256-GCM` ciphertext + authentication tag produced in the browser.
- `iv` (`string`): Base64url-encoded random 96-bit (12-byte) nonce generated per note.
- `alg` (`string`): `'AES-256-GCM'`.
- `keyId` (`string`): Fingerprint of `K_ws`.
- `createdAt` (`Date`): Creation timestamp.

Each note is encrypted with Additional Authenticated Data (`AAD`) set to UTF-8 `${workspace}:${contact}` so a malicious server or database attacker cannot silently transplant a note ciphertext from one contact or workspace into another without failing GCM authentication on decryption.

## 3. Three Attacks This Scheme Does Not Stop

1. **XSS or Compromised Client Device**: Because `K_ws` resides in browser `localStorage` and plaintext is decrypted in the DOM, an XSS vulnerability in the frontend or a compromised agent browser can exfiltrate `K_ws` and read all notes encrypted under that key.
2. **Metadata & Traffic Analysis by the Server**: The server still observes who wrote a note (`authorSub`), which `workspace` and `contact` it belongs to, when it was created (`createdAt`), and the approximate plaintext length from `ciphertext.length`.
3. **Revoked / Departed Agent Access (No Forward Secrecy Without Rotation)**: Any former workspace member who saved `K_ws` before losing IdP access can still decrypt historical ciphertexts if they obtain a database backup or previously cached ciphertexts. Rotating `K_ws` protects future notes, not notes already encrypted under the old key.
