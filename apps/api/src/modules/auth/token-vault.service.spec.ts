import { Test } from "@nestjs/testing";
import { ENV } from "../../config/env";
import { TokenVaultService } from "./token-vault.service";

describe("TokenVaultService", () => {
  let vault: TokenVaultService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TokenVaultService,
        {
          provide: ENV,
          useValue: {
            TOKEN_ENCRYPTION_KEY:
              "2d498dee3493b502e0477c044a885c16f9e15f0ec26f928ccddd04c56c4c402f".slice(0, 64),
          },
        },
      ],
    }).compile();
    vault = module.get(TokenVaultService);
  });

  it("round-trips a plaintext refresh token", () => {
    const plaintext = "1//09-fake-google-refresh-token";
    const encrypted = vault.encrypt(plaintext);
    expect(encrypted).not.toEqual(plaintext);
    expect(vault.decrypt(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = vault.encrypt("same-token");
    const b = vault.encrypt("same-token");
    expect(a).not.toEqual(b);
    expect(vault.decrypt(a)).toBe("same-token");
    expect(vault.decrypt(b)).toBe("same-token");
  });

  it("rejects a tampered ciphertext (auth tag mismatch)", () => {
    const encrypted = vault.encrypt("secret-token");
    const bytes = Buffer.from(encrypted, "base64");
    // Flip a bit inside the ciphertext region (after iv + auth tag).
    const lastIndex = bytes.length - 1;
    bytes.writeUInt8(bytes.readUInt8(lastIndex) ^ 0xff, lastIndex);
    const tampered = bytes.toString("base64");
    expect(() => vault.decrypt(tampered)).toThrow();
  });

  it("handles unicode content", () => {
    const plaintext = "café ☕️ refresh-token-日本語";
    expect(vault.decrypt(vault.encrypt(plaintext))).toBe(plaintext);
  });
});
