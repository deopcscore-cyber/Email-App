import { Inject, Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { ENV, type Env } from "../../config/env";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // NIST-recommended nonce size for GCM

/**
 * Encrypts provider refresh tokens at rest. Stored format is
 * base64(iv | authTag | ciphertext) so a row is self-contained and the key
 * can be rotated by re-encrypting rows.
 */
@Injectable()
export class TokenVaultService {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "hex");
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      "base64",
    );
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = raw.subarray(IV_LENGTH + 16);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}
