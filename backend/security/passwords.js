import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
// Store a password hash, never the password.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function passwordMatches(password, savedHash) {
  const [salt, hash] = savedHash.split(":");
  return timingSafeEqual(
    await scrypt(password, salt, 64),
    Buffer.from(hash, "hex"),
  );
}
export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
