/* eslint-disable functional/no-this-expression */

import type { StatResult } from "@capacitor/filesystem";

// eslint-disable-next-line functional/no-class
export class Stat {
  public readonly type: string;
  public readonly mode = 16822;
  public readonly size: number;
  public readonly ino = 967;
  public readonly mtimeMs: number;
  public readonly ctimeMs: number;
  public readonly uid = 1;
  public readonly gid = 1;
  public readonly dev = 1;

  constructor(stats: StatResult) {
    this.type = stats.type;
    this.size = stats.size;
    this.mtimeMs = stats.mtime;
    this.ctimeMs = stats.ctime || stats.mtime;
  }
  isFile(): boolean {
    return this.type === "file";
  }
  isDirectory(): boolean {
    return this.type === "directory";
  }
  isSymbolicLink(): boolean {
    return this.type === "symlink";
  }
}

// eslint-disable-next-line functional/no-class
export class StatBigInt {
  public readonly type: string;
  public readonly mode = BigInt(16822);
  public readonly size: BigInt;
  public readonly ino = BigInt(967);
  public readonly mtimeMs: BigInt;
  public readonly ctimeMs: BigInt;
  public readonly uid = BigInt(1);
  public readonly gid = BigInt(1);
  public readonly dev = BigInt(1);

  constructor(stats: StatResult) {
    this.type = stats.type;
    this.size = BigInt(stats.size);
    this.mtimeMs = BigInt(stats.mtime);
    this.ctimeMs = BigInt(stats.ctime || stats.mtime);
  }
  isFile(): boolean {
    return this.type === "file";
  }
  isDirectory(): boolean {
    return this.type === "directory";
  }
  isSymbolicLink(): boolean {
    return this.type === "symlink";
  }
}
