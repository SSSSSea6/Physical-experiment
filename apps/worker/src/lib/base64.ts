function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

export function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}

export function base64UrlFromArrayBuffer(buffer: ArrayBuffer): string {
  return base64FromArrayBuffer(buffer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

