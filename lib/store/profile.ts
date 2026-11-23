import type { ObjectId } from "mongodb";
import { collections, EMPTY_PROFILE, type UserDoc } from "../db";
import { DEFAULT_PREFERENCES } from "../validation";
import type { IssuerProfile, IssuerSnapshot, MeDTO } from "../types";

/** El emisor tiene todo lo que hace falta para emitir. */
export function isProfileComplete(profile: IssuerProfile): profile is IssuerSnapshot {
  return Boolean(profile.businessName && profile.cuit && profile.ivaCondition && profile.address && profile.pointOfSale);
}

/** Los campos nuevos de un usuario recién creado. */
export function newUserFields(email: string, now: Date): UserDoc {
  return { email, profile: EMPTY_PROFILE, logo: null, preferences: DEFAULT_PREFERENCES, createdAt: now };
}

export async function getUser(userId: ObjectId) {
  const { users } = await collections();
  return users.findOne({ _id: userId });
}

export function userToMe(user: UserDoc & { _id: ObjectId }): MeDTO {
  const profile = { ...EMPTY_PROFILE, ...user.profile };
  return {
    user: { id: user._id.toString(), email: user.email },
    profile,
    hasLogo: user.logo !== null,
    profileComplete: isProfileComplete(profile),
    preferences: { ...DEFAULT_PREFERENCES, ...user.preferences },
  };
}

export async function loadMe(userId: ObjectId): Promise<MeDTO | null> {
  const user = await getUser(userId);
  return user ? userToMe(user) : null;
}
