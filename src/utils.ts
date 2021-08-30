import { atob, btoa } from "js-base64";
import { resolve } from "path-cross";

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // eslint-disable-next-line functional/no-let
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  // eslint-disable-next-line functional/no-let
  let i = 0;
  // eslint-disable-next-line functional/no-loop-statement
  while (i < len) {
    binary += String.fromCharCode(bytes[i++]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  // eslint-disable-next-line functional/no-let
  let i = 0;
  // eslint-disable-next-line functional/no-loop-statement
  while (i < len) {
    // eslint-disable-next-line functional/immutable-data
    bytes[i] = binary_string.charCodeAt(i++);
  }
  return bytes.buffer;
}

function isBase64(str: string): boolean {
  try {
    return str === btoa(atob(str));
  } catch {
    return false;
  }
}

export function rawText(str: string): string {
  if (!!str && isBase64(str)) {
    return atob(str);
  }

  return str;
}

export function alwayBase64(str: string): string {
  if (!str || isBase64(str)) {
    return str;
  }

  return btoa(str);
}

export function textToArrayBuffer(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
  const bufView = new Uint16Array(buf);
  const strlen = str.length;

  // eslint-disable-next-line functional/no-let
  let i = 0;
  // eslint-disable-next-line functional/no-loop-statement
  while (i < strlen) {
    // eslint-disable-next-line functional/immutable-data
    bufView[i] = str.charCodeAt(i++);
  }

  return buf;
}

export function isParentFolder(parent: string, children: string): boolean {
  parent = resolve(parent);
  children = resolve(children);
  const pathsA = parent.split("/");
  const pathsB = children.split("/");

  return (
    pathEquals(parent, children) === false &&
    pathsA.every((value, index) => value === pathsB[index])
  );
}

export function pathEquals(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}
