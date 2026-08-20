export function timingSafeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < first.length; index++) {
    result |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }

  return result === 0;
}
