/*
 * Vezlivo Age Rules
 *
 * This file contains age-related rules used by the current
 * Vezlivo version.
 *
 * LIVE streaming is intentionally not available in the
 * current version of Vezlivo. It can be added later as a
 * separate feature update.
 */

export function getAge(dateOfBirth) {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(dateOfBirth);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();

  let age =
    today.getFullYear() -
    birthDate.getFullYear();

  const monthDifference =
    today.getMonth() -
    birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (
      monthDifference === 0 &&
      today.getDate() <
        birthDate.getDate()
    )
  ) {
    age -= 1;
  }

  return age;
}


export function isMinor(dateOfBirth) {
  const age =
    getAge(dateOfBirth);

  if (age === null) {
    return false;
  }

  return age < 18;
}


export function isAdult(dateOfBirth) {
  const age =
    getAge(dateOfBirth);

  if (age === null) {
    return false;
  }

  return age >= 18;
}


export function isTeen(dateOfBirth) {
  const age =
    getAge(dateOfBirth);

  if (age === null) {
    return false;
  }

  return age >= 13 && age <= 17;
}